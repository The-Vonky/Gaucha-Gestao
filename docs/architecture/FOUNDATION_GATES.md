# Platform Foundation Gates

Status: planning gate  
Date: 2026-09-24

## Purpose

Gaúcha Gestão must not begin broad feature implementation before a small set of foundational decisions are explicit.

This is not a request to overdesign the platform. Each gate should be resolved only to the level needed for Audit as module #1 and the next few modules.

## Gate 1 — Runtime and deployment topology

Decide:
- where production runs;
- supported operating system/runtime;
- whether the application is intranet-only, internet-accessible, or hybrid;
- reverse-proxy/TLS boundary;
- process/container strategy;
- development/staging/production separation.

Acceptance:
- supported and maintainable production runtime;
- no dependency on an unsupported OS as an unexamined default;
- deploy/rollback path can be documented.

## Gate 2 — Application stack

Decide:
- frontend framework/build tool;
- backend/application API strategy;
- monorepo/workspace organization;
- schema validation approach;
- test stack.

Acceptance:
- suitable for a modular monolith;
- strong typing/contracts where practical;
- low operational overhead;
- good agent/tooling support;
- no unnecessary framework proliferation.

## Gate 3 — Database

Decision baseline already established:
- relational model is required;
- PostgreSQL is the primary candidate.

Finalize:
- hosting;
- migration tool;
- connection/pooling strategy;
- backup mechanism;
- authorization enforcement boundary;
- development/test database workflow.

Acceptance:
- automated backup possible;
- incremental migrations;
- fixed-precision financial values supported;
- no shared production database credentials in frontend code.

## Gate 4 — Authentication and authorization

Finalize:
- identity provider/session implementation;
- profile lifecycle;
- roles as permission bundles;
- granular permission evaluation;
- unit/sector scope representation;
- trusted enforcement layer;
- administrator model.

Acceptance:
- default deny;
- deactivation/revocation possible;
- module navigation reflects permissions;
- server/database rejects unauthorized direct access.

## Gate 5 — Organizational Core

Define minimum Core entities:
- users/profiles;
- units;
- sectors;
- roles;
- permissions;
- user access scope.

Acceptance:
- Audit can reference canonical Unit;
- later modules do not need private copies of Unit/User;
- deleting/deactivating a Unit cannot accidentally destroy unrelated module history.

## Gate 6 — Files and attachments

Decide:
- storage provider/location;
- metadata model;
- file size/type policy;
- private download flow;
- object naming;
- deletion/retention behavior;
- backup/restore.

Acceptance:
- no public-by-default sensitive files;
- authorization occurs before access;
- binary storage is recoverable together with metadata.

## Gate 7 — System audit log

Define:
- event model;
- actor;
- timestamp;
- entity/module/action;
- before/after strategy for sensitive mutations;
- retention;
- access permission.

Acceptance:
- permission changes and sensitive administrative mutations are traceable;
- secrets are never stored in audit payloads.

## Gate 8 — Backup and disaster recovery

Define:
- database backup cadence/retention;
- file backup cadence/retention;
- off-host/off-failure-domain copy;
- restore procedure;
- RPO/RTO targets appropriate to the business;
- restore-test schedule.

Acceptance:
- complete platform can be rebuilt on replacement infrastructure;
- a restore test can be performed without touching production.

## Gate 9 — Observability and operations

Define minimum:
- structured application logs;
- error tracking strategy;
- health checks;
- backup-failure visibility;
- disk/storage/database monitoring;
- production incident/rollback procedure.

Acceptance:
- failures do not depend solely on a user reporting that a screen stopped working.

## Gate 10 — First-module contract

Before migrating Audit, approve:
- `docs/modules/audit/AUDIT_SOURCE_OF_TRUTH.md`;
- `docs/modules/audit/MIGRATION_MAP.md`;
- Action Plans ownership;
- first Audit permissions;
- platform-vs-Audit responsibilities;
- explicit decisions for reopen/history export;
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
- a generic workflow engine;
- speculative integrations.

Those decisions belong to their modules when they become concrete.

## Implementation start condition

The first platform-code brief may be issued once Gates 1–6 and the Audit-specific portion of Gate 10 are sufficiently resolved.

Gates 7–9 need a concrete baseline before production, but their complete operational maturity can evolve incrementally before broad rollout.
