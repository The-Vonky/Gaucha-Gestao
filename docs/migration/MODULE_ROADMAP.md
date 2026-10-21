# Module Migration Roadmap

> **Estado revisado em 21/10/2026:** este documento define uma **sequência candidata**, não é autorização para implementar nem substitui o [Plano Diretor](../planning/PLANO_DIRETOR_2026.md). O código da Curva ABC v1 já foi integrado (PR #69); Agendamento de Salas tem somente um brief AG-00 proposto (PR #72). **PROD NO-GO.**

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
| Meeting Room Scheduling | legacy functional; brief AG-00 PROPOSTO | low | [ROOM_BOOKING_V1](../briefs/ROOM_BOOKING_V1.md) e [critérios AG](../modules/room-booking/ACCEPTANCE_V1.md) ainda sem aceite do responsável e da secretária; implementação AG-01 não autorizada |
| Fleet | not finished | medium | continue future development directly in platform after foundation |
| Planned vs Actual | finished | medium | preserve validated import/calculation rules |
| ABC Curve | **platform v1 integrated (PR #69)** | high | import/query/revision implemented; [ERP samples and two-person acceptance](https://github.com/The-Vonky/Gaucha-Gestao/issues/70) pending; no desktop history migrated; data sensitive |
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
1. Contracts ERP (after backup/recovery and domain acceptance).

ABC v1 was pulled forward and integrated in October 2026; the ABC module is **no longer a future migration task**. Extensions beyond v1 require a separate brief and authorization.

Exact order can change with business priority and source-system readiness.

## Priority change — 2026-10-19

**Historical decision, 19/10:** by product-owner priority, ABC Curve moved ahead of Phases 2–4. **Current implementation state, 21/10:** ABC v1 was merged by [PR #69](https://github.com/The-Vonky/Gaucha-Gestao/pull/69) on 20/10. Import, revision and query code exists, but manual acceptance is still open in [Issue #70](https://github.com/The-Vonky/Gaucha-Gestao/issues/70); do not call it ready for production. Quality closure (P1–P9, O1–O8) remains the production release gate. The standalone ABC repository (`The-Vonky/CurvaABC-Gaucha`) contributes rules and tests; its desktop history is not migrated.

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
