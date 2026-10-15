# ADR-008 — Production host: Lenovo ThinkStation C30

Status: Accepted  
Date: 2026-10-15  
Supersedes: the physical-host part of [ADR-004](ADR-004-platform-stack.md) (HP ProLiant ML350, Linux VM). Every other ADR-004 decision remains in force.  
Related: [ADR-006](ADR-006-infra-v1-reused-hardware.md) (minimum Compose profile), [Plano Diretor 2026](../planning/PLANO_DIRETOR_2026.md).

## Context

ADR-004 accepted the HP ProLiant ML350 as the initial single physical host, running a Linux VM. ADR-006 later deferred the hardware decision and recorded that the ML350 had never been inventoried or validated.

On 2026-10-15 the project owner communicated a change in infrastructure planning: the previously planned legacy server is replaced by a new server, a **Lenovo ThinkStation C30**, as the platform host.

Inventory supplied by the project owner (details in Plano Diretor §3):

| Item | Value |
| --- | --- |
| Model | ThinkStation C30, type 1097A58; BIOS A1KT46AUS (2013), UEFI |
| CPU | 1 × Intel Xeon E5-2620 (first generation), 6 cores / 12 threads, 2.0 GHz |
| Memory | 8 GB DDR3 ECC, 4 × 2 GB Hynix HMT325U7CFR8C (part code indicates ECC UDIMM; confirm on the label) |
| Disk | 1 × SATA SSD MARKVISION 256 GB; ~19.5% free at first collection |
| Network | Intel 82579LM 1 Gbps (active) + Intel Gigabit CT2 (disconnected) |
| Current OS | Windows 11 Pro 23H2, Docker Desktop + WSL2, 13 containers (not the ADR-006 profile) |

The current measurements were taken under Windows, Docker Desktop, desktop applications and a full Supabase stack. They are **not** valid evidence of capacity for the platform.

## Decision

1. The Lenovo ThinkStation C30 is the single physical host of the platform. The single-host SPOF accepted in ADR-004 carries over to this machine.
2. The host runs **Ubuntu Server LTS directly on the hardware** (bare metal), replacing Windows 11. No hypervisor layer: with 8 GB RAM and one SSD, a VM adds overhead without a second workload to isolate. This resolves the "VM versus bare metal" item deferred in ADR-006.
3. Runtime: Docker Engine + Docker Compose with the ADR-006 minimum profile (PostgreSQL 17, Kong, GoTrue, PostgREST, Storage API). Docker Desktop and the services omitted by ADR-006 are not used.
4. The host is **dedicated**: no desktop applications or unrelated workloads.
5. ADR-004 remains authoritative for the rest of the platform: Cloudflare Workers Static Assets, DNS/WAF/Tunnel with no inbound public ports, R2 as object storage, off-site backups, Ansible, GitHub Actions.

## Acceptance criteria for the host

The C30 is chosen, but it is **not accepted for production** until all of the following are evidenced:

1. Whatever currently runs on the C30 is backed up and a restore is verified before Windows is removed.
2. Re-measurement on Ubuntu with the ADR-006 profile: available RAM, swap, disk use below 70%, full SMART report, CPU temperature under load.
3. Load test against the targets defined by the project owner (technical RPO, RTO, p95 latency, expected users and units). These targets are still pending.
4. UPS with automated safe shutdown tested.
5. Off-site backup and restore drill demonstrated (gates O3 and O4 in [QUALITY_ACCEPTANCE_V1](../modules/audit/QUALITY_ACCEPTANCE_V1.md)).

## Known risks

- One consumer-grade SSD, no RAID: disk failure means a full restore from off-site backup.
- 2012–2013 platform: spare parts and DDR3 ECC UDIMM availability are limited.
- 8 GB RAM: RAM and disk upgrade triggers in Plano Diretor §7 are already met in the current Windows state and must be re-evaluated on Ubuntu.
- No contingency host is defined. The RTO depends on rebuilding on replacement hardware.

## Open decisions

- Fate of the legacy server: decommission, or keep it as STAGING / restore-drill host.
- Where STAGING runs (separate machine, or the C30 with registered isolation and resource limits).
- WAL/PITR tool (WAL-G or pgBackRest) and off-site destination, still open in ADR-006.

## Consequences

- ML350-specific requirements in ADR-004 (BBWC/FBWC write-back cache, RAID controller inventory) no longer apply. They are replaced by SMART monitoring, UPS checks and the acceptance criteria above.
- Documents that named the ML350 as the target host were updated to reference this ADR. Historical briefs that mention the ML350 only as out of scope are left unchanged.

## Reversal

If the C30 fails acceptance, the options are RAM/SSD upgrades within the triggers of Plano Diretor §7, modern replacement hardware, or a managed alternative. Any of these requires a new ADR. Returning to the ML350 is not assumed: it was never inventoried.
