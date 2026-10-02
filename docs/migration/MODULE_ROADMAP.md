# Module Migration Roadmap

## Purpose

This is a sequencing guide, not a delivery-date promise.

Migration order prioritizes:
1. current business priority;
2. foundation validation;
3. reuse of stable systems;
4. reduction of risk before complex domains.

## Inventory

| Module | Standalone status | Initial migration risk | Notes |
| --- | --- | --- | --- |
| Audit / Quality Audit | platform v1 implemented | medium/high | repository implementation complete; P1–P9 physical and O1–O8 operational acceptance are the current closure priority; do not reimplement completed slices |
| ISO Records / legacy Propostas ISO | finished legacy | medium | migration gate required before implementation; the source system is functionally commercial clients/proposals despite the historical ISO name, so ownership/navigation must be resolved first |
| Sales / Card Machines | finished | low | dashboard/import-oriented |
| Satisfaction Survey | finished | low | strong unit/period integration candidate |
| Meeting Room Scheduling | finished, weak | low | likely cheaper to reimplement on platform foundation |
| Fleet | not finished | medium | continue future development directly in platform after foundation |
| Planned vs Actual | finished | medium | preserve validated import/calculation rules |
| ABC Curve | not finished | high | continue future development in platform; data/history sensitive |
| Contracts ERP | finished | high | important workflows/data; backup/recovery must be reviewed first |

## Phase 0 — Architecture and foundation design

Deliverables:
- architecture decisions;
- authorization model;
- security baseline;
- data ownership;
- backup/recovery design;
- first foundation implementation brief.

No production cutover.

## Phase 1 — Platform foundation + Audit

Status: repository implementation complete; physical/operational acceptance remains open.

Goal: prove the platform using the highest-priority active system.

The implemented scope is Audit, Action Plans, both evidence domains, reporting/export and the Core/Admin capabilities they require. Do not restart these slices. Close `docs/modules/audit/QUALITY_ACCEPTANCE_V1.md` before declaring the phase production-ready.

Do not build every future module capability in advance.

## Phase 2 — Early stable modules

Candidate sequence after Quality closure:
1. resolve the migration gate and domain ownership of legacy `Registros_ISO-Gaucha` / Propostas ISO;
2. Sales / Card Machines;
3. Satisfaction Survey;
4. Meeting Room Scheduling.

The first item is not authorized for implementation until its functional ownership and navigation placement are approved.

This sequence intentionally tests different workloads while keeping migration complexity moderate.

## Phase 3 — Operational/analytical expansion

Candidate sequence:
1. Fleet;
2. Planned vs Actual.

## Phase 4 — Complex domains

Candidate sequence:
1. ABC Curve;
2. Contracts ERP.

Exact order can change with business priority and source-system readiness.

## Per-module migration gate

Before implementation:
- source repository/current version identified;
- behavior inventory;
- critical calculations/rules documented;
- data classification;
- Core entity mappings;
- permission catalog;
- migration/cutover strategy;
- acceptance criteria.

Before cutover:
- functional parity/approved differences validated;
- access control validated;
- source-vs-target data reconciliation;
- backup created;
- restore/rollback path known;
- stakeholder validation completed.

## Legacy policy

Do not delete or rewrite the standalone repository during migration.

When a module is successfully cut over:
- tag or otherwise identify the final standalone release;
- freeze ordinary feature development there;
- retain it as historical/recovery reference for the agreed period.
