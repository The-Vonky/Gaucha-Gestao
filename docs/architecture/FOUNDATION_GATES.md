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

Status: **PARTIALLY DECIDED**

Decision:
- Supabase Auth;
- default deny;
- roles are reusable permission bundles;
- granular permissions;
- unit/sector organizational scope;
- server/database trusted enforcement;
- permission-driven navigation.

Still pending:
- exact schema for roles/permissions/scopes;
- exact first permission catalog;
- administrator/superuser semantics;
- invitation/account lifecycle UX.

## Gate 5 — Organizational Core

Status: **CONCEPTUALLY DECIDED**

Minimum Core:
- users/profiles;
- units;
- sectors;
- roles;
- permissions;
- user organizational scope;
- system audit-log capability.

Still pending:
- physical schema;
- deactivation/retention behavior;
- initial seed/migration process for units/sectors.

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

Status: **IN PROGRESS**

Already defined:
- Audit source of truth;
- Audit migration map;
- transversal Action Plans ownership.

Still pending:
- explicit reopen behavior;
- unit-history export decision;
- first Audit permission catalog;
- Core schema required by Audit;
- first implementation brief.

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

The first platform-code brief may be issued once:
- Gate 4 has an implementable v1 schema;
- Gate 5 has an implementable Core schema;
- the Audit-specific portion of Gate 10 is resolved.

Infrastructure implementation details for Gates 7–9 must have a minimum production baseline before production rollout, but they do not block creation of the application foundation.
