# Platform Foundation Gates

Status: active  
Date: 2026-09-24

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
- database resource sizing;
- exact migration framework/conventions in the application repository.

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

Still pending:
- bucket/object-key convention;
- maximum sizes/types by module;
- retention/versioning policy;
- malware/unsafe-file controls where justified.

## Gate 7 — System audit log

Status: **TO DESIGN BEFORE PRODUCTION**

Need:
- event model;
- actor;
- timestamp;
- entity/module/action;
- before/after strategy;
- retention;
- privileged read permission.

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

Status: **MOSTLY RESOLVED**

Already defined:
- Audit source of truth;
- Audit migration map;
- transversal Action Plans ownership;
- first Audit permission catalog;
- Core schema required by Audit;
- platform foundation implementation brief.

Still pending before Audit business implementation:
- explicit reopen behavior;
- unit-history export decision;
- Audit module implementation brief.

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

The first platform-code brief has now been issued:
- `docs/briefs/PLATFORM_FOUNDATION_V1.md`.

Platform foundation implementation may begin without migrating Audit business tables/data.

Infrastructure implementation details for Gates 7–9 must have a minimum production baseline before production rollout, but they do not block creation of the application foundation.
