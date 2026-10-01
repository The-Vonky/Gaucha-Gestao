# Platform Foundation Gates

Status: active  
Reviewed: 2026-10-01 against `664ed5a95684b15c8035e78c21a413bdbd057103`

Implementation evidence and remaining Quality work: `docs/modules/audit/QUALITY_COMPLETION_V1.md`. Production entries below are repository gates, not a live infrastructure assessment. Quality v1 functional software and pre-homologation hardening are complete after PR #14; physical P1–P9 acceptance is pending and operational O1–O8 readiness remains pending/partial. **Production ready: NO.** See the completion matrix for the current O1–O8 classifications.

## Purpose

Gaúcha Gestão must not begin broad feature implementation before a small set of foundational decisions are explicit.

This is not a request to overdesign the platform. Each gate should be resolved only to the level needed for Audit as module #1 and the next few modules.

## Gate 1 — Runtime and deployment topology

Status: **DECIDED (baseline)**

Decision:
- HP ProLiant ML350 as initial physical host;
- Linux VM;
- Ubuntu Server LTS;
- Docker Engine + Docker Compose;
- Cloudflare DNS/WAF/Tunnel;
- React static assets delivered from Cloudflare Workers;
- controlled production deployment;
- single-host availability accepted for v1.

Still pending:
- exact VM sizing after ML350 inventory;
- final DEV/STAGING/PROD topology;
- UPS/network failover capabilities.

Reference:
- ADR-004.

## Gate 2 — Application stack

Status: **DECIDED**

Decision:
- React;
- TypeScript;
- Vite;
- modular monolith;
- Supabase Self-Hosted for backend/data platform;
- GitHub Actions for CI/CD.

Reference:
- ADR-001;
- ADR-004.

## Gate 3 — Database

Status: **DECIDED (baseline)**

Decision:
- PostgreSQL;
- Supabase Self-Hosted;
- incremental migrations;
- fixed-precision financial values;
- private database boundary;
- logical backup + physical/base backup + WAL archiving/PITR;
- off-site backup destination.

Still pending:
- exact backup tool (pgBackRest, WAL-G or equivalent);
- retention/RPO/RTO;
- database resource sizing.

Implemented convention: append-only SQL migrations under `supabase/migrations`, applied by local Supabase and integration CI.

## Gate 4 — Authentication and authorization

Status: **DECIDED FOR V1**

Decision:
- Supabase Auth;
- default deny;
- roles are reusable permission bundles;
- granular permissions;
- unit/sector organizational scope;
- server/database trusted enforcement;
- permission-driven navigation.

Decision:
- Supabase Auth identity;
- Core profile activation state;
- multiple scoped role assignments per user;
- role -> permission bundles;
- scope on each role assignment: global/unit/sector;
- first Audit/Action Plan/Administration permission catalog;
- Platform Administrator as privileged global role;
- database/RLS enforcement.

Still pending:
- detailed invitation/account-administration UX.

## Gate 5 — Organizational Core

Status: **DECIDED FOR V1**

Decision:
- `core.profiles`;
- `core.units`;
- `core.sectors`;
- `core.unit_sectors`;
- `core.permissions`;
- `core.roles`;
- `core.role_permissions`;
- `core.user_role_assignments`;
- `core.system_audit_log`;
- deactivation instead of ordinary hard deletion for referenced Core entities;
- UUID technical IDs and stable business codes where applicable.

Physical migrations are authorized by `docs/briefs/PLATFORM_FOUNDATION_V1.md`.

## Gate 6 — Files and attachments

Status: **DECIDED (baseline)**

Decision:
- Supabase Storage API;
- Cloudflare R2 preferred as production S3-compatible backend;
- database stores metadata/references, not arbitrary file blobs;
- private authorized access;
- file restore/retention handled independently from database backup.

Implemented for Action Plans: private `action-plan-evidence` bucket, UUID keys, 10 MiB files, JPEG/PNG/PDF/XLSX/DOCX, 20 active items per plan, logical removal, rounds and signed downloads (Evidence/Storage v1, migration 0008). Implemented for Audit Checklist Evidence in PR #11: private `audit-checklist-evidence` bucket, server UUID keys, 10 MiB files, 10 active/criterion and 100/inspection, logical removal, lifecycle-version binding and signed attachment downloads. Magic-byte checks remain client-side, not server attestation.

Still pending: retention/purge policy and production Storage/backup/header/reconciliation gates for both evidence domains. No universal attachment table is authorized.

## Gate 7 — System audit log

Status: **MODEL AND APPLICATION IMPLEMENTED; OPERATIONS PENDING**

ADR-005 and migration 0001 define `core.system_audit_log`, actor/time, entity/module/action, before/after payloads, trusted writes and scoped `admin.audit_log.read`. Audit lifecycle, Action Plan changes and evidence add/remove use that capability.

Still pending: operational retention, monitoring and authorized purge/runbook procedures. Do not confuse the system log with the Quality Audit business module.

## Gate 8 — Backup and disaster recovery

Status: **BASELINE DECIDED; IMPLEMENTATION AND OPERATIONAL EVIDENCE PENDING**

Decision:
- automated backups;
- local recovery copy where useful;
- off-site copies;
- logical PostgreSQL backups;
- base backup + WAL/PITR;
- periodic restore drills;
- Ansible for reproducible recovery.

Still pending:
- tool choice;
- storage destination/account;
- retention;
- technical RPO and RTO inside/outside operating hours (definition/measurement);
- restore-test cadence;
- final runbook.

Operational owner and backup/restore owner: the current person responsible for the project. Alert recipients: the current person responsible for the project and supervisor. The provisional operating window, 24x7 infrastructure expectation and data-preservation requirement are recorded in [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md#operational-decisions-and-provisions--2026-10-01). They do not close O1; numeric RPO/RTO and retention remain pending.

## Gate 9 — Observability and operations

Status: **BASELINE DECIDED; IMPLEMENTATION AND OPERATIONAL EVIDENCE PENDING**

Minimum:
- host metrics;
- container health/restarts;
- PostgreSQL connections/storage/backup health;
- Supabase service health;
- Cloudflare Tunnel health;
- backup/WAL archive failures;
- frontend error telemetry with privacy review;
- health checks and rollback procedure.

Tooling remains intentionally open.

## Gate 10 — First-module contract

Status: **FUNCTIONAL SOFTWARE AND PRE-HOMOLOGATION HARDENING COMPLETE; ACCEPTANCE PENDING**

Already defined:
- Audit source of truth;
- Audit migration map;
- transversal Action Plans ownership;
- first Audit permission catalog;
- Core schema required by Audit;
- platform foundation implementation brief.

Resolved: `AUDIT_DOMAIN_V1.md` defines reopen and its implementation exists in migrations 0004/0009 and Audit UI. Action Plans and their evidence are also implemented.

Product decision approved on 2026-09-29: preserve inspection Excel, unit-history Excel and print/PDF. The implementation under `AUDIT_EXPORT_REPORTING_V1.md` is integrated in `main` (PR #9); physical-device acceptance remains pending. Checklist attachments under `AUDIT_CHECKLIST_EVIDENCE_V1.md` are integrated in `main` by PR #11; the unit-history Data API truncation blocker is fixed by PR #13. Pre-homologation hardening is integrated by PR #14. Current post-merge CI `36854366048` passed on `664ed5a95684b15c8035e78c21a413bdbd057103`; E1–E3 remain the accepted product/security contract. Physical/mobile and operational release gates remain pending.

## What does not need to be designed now

Do not block Audit on:
- final executive dashboard;
- full permission catalog for all nine modules;
- ABC schema;
- Contracts migration details;
- Fleet schema;
- every future notification;
- microservices;
- Kubernetes;
- multi-node HA;
- blue/green deployment;
- generic workflow engine;
- speculative integrations.

## Implementation start condition

Foundation and the first Quality domain slices are implemented. Quality v1 functional software and pre-homologation hardening are complete; remaining physical P1–P9 and operational O1–O8 acceptance is tracked in the completion matrix. Gates 7–9 still have implementation and/or operational evidence pending before production rollout; this document does not authorize infrastructure changes or deploys.

