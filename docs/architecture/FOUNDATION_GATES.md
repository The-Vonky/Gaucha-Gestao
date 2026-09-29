# Platform Foundation Gates

Status: active  
Reviewed: 2026-09-29 against `3f158d36c6c087a560fd464e7c60bcdee2e7fae7`

Implementation evidence and remaining Quality work: `docs/modules/audit/QUALITY_COMPLETION_V1.md`. Production entries below are repository gates, not a live infrastructure assessment.

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

Implemented for Action Plans: private `action-plan-evidence` bucket, UUID keys, 10 MiB files, JPEG/PNG/PDF/XLSX/DOCX, 20 active items per plan, logical removal, rounds and signed downloads (Evidence/Storage v1, migration 0008). Magic-byte checks are client-side, not server attestation.

Still pending: Audit checklist evidence implementation under its separate brief; retention/purge policy and production Storage/backup/header/reconciliation gates. No universal attachment table is authorized.

## Gate 7 — System audit log

Status: **MODEL AND APPLICATION IMPLEMENTED; OPERATIONS PENDING**

ADR-005 and migration 0001 define `core.system_audit_log`, actor/time, entity/module/action, before/after payloads, trusted writes and scoped `admin.audit_log.read`. Audit lifecycle, Action Plan changes and evidence add/remove use that capability.

Still pending: operational retention, monitoring and authorized purge/runbook procedures. Do not confuse the system log with the Quality Audit business module.

## Gate 8 — Backup and disaster recovery

Status: **BASELINE DECIDED; IMPLEMENTATION PENDING**

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
- RPO/RTO;
- restore-test cadence;
- final runbook.

## Gate 9 — Observability and operations

Status: **BASELINE DECIDED; IMPLEMENTATION PENDING**

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

Status: **DOMAIN CONTRACT IMPLEMENTED; COMPLETION SLICES SPECIFIED**

Already defined:
- Audit source of truth;
- Audit migration map;
- transversal Action Plans ownership;
- first Audit permission catalog;
- Core schema required by Audit;
- platform foundation implementation brief.

Resolved: `AUDIT_DOMAIN_V1.md` defines reopen and its implementation exists in migrations 0004/0009 and Audit UI. Action Plans and their evidence are also implemented.

Product decision approved on 2026-09-29: preserve inspection Excel, unit-history Excel and print/PDF. Implementation remains pending under `AUDIT_EXPORT_REPORTING_V1.md`. Checklist attachments remain pending under `AUDIT_CHECKLIST_EVIDENCE_V1.md`; proposed product/security details require the approvals recorded there.

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

Foundation and the first Quality domain slices are implemented. Remaining application work is limited by the specific briefs and the completion matrix. Gates 7–9 still require operational evidence before production rollout; this document does not authorize infrastructure changes or deploys.

