# Audit Module — Migration Map

Status: planning  
Last reviewed: 2026-09-24

## Platform status clarification — 2026-09-30

The legacy comparisons below remain pinned to Controle_Auditoria `b916ba8`; they are not claims about current Gaúcha Gestão. Historical platform snapshot `3f158d3` implemented reopen, generalized Action Plans and Action Plan Evidence; at that snapshot, Checklist Evidence and Audit exports were not yet implemented. That statement is superseded for current state: `main` at `c3f135f6026899362e1edacda3e97e922528ac8e` includes Audit Export & Reporting (PR #9) and Checklist Evidence (PR #11). See [Quality completion matrix](QUALITY_COMPLETION_V1.md).

Reopen and the permission/scope model are resolved by Audit Domain v1 and ADR-005. Product approved all three reporting outputs—inspection Excel, unit-history Excel and print/PDF—implemented under [Audit Export & Reporting v1](../../briefs/AUDIT_EXPORT_REPORTING_V1.md). Checklist attachments are implemented under [Audit Checklist Evidence v1](../../briefs/AUDIT_CHECKLIST_EVIDENCE_V1.md), with the current implementation contract in [CHECKLIST_EVIDENCE_V1.md](CHECKLIST_EVIDENCE_V1.md). Portable archives and Realtime are outside this completion v1; retention remains an operational/business decision. Do not reopen these accepted platform decisions based on the historical planning list below.

## Objective

Migrate the proven Audit domain into Gaúcha Gestão without carrying forward standalone technical constraints or coupling platform-wide concepts to the Audit module.

## Source systems

1. Standalone Audit v2.9.1 — functional/UX baseline presented before new requests.
2. `The-Vonky/Controle_Auditoria` online v3 — current multi-user technical evolution.
3. `IMPLEMENTATION_BRIEF_ACTION_PLANS_V3.md` — approved post-demonstration Action Plan evolution, pending implementation on reviewed main.

## Reuse directly when compatible

### Domain data/rules
- official checklist content and stable item IDs;
- 9-section / 158-item structure;
- answer status semantics;
- conformity formula and classification thresholds;
- finalization completeness rule;
- AP/NAT corrective-action trigger rule.

### Tests/fixtures to recreate
- known scoring examples from v2.9.1 validation;
- template count/ID validation;
- finalization behavior;
- AP/NAT Action Plan uniqueness.

The platform should encode these as automated tests rather than relying on manual comparison with the old HTML.

## Reuse with adaptation

### Current online React UI
Useful references/components:
- unit cards and hero patterns;
- inspection tabs;
- checklist section navigation;
- responsive question cards;
- modal behavior;
- Action Plan cards;
- evidence list UX;
- Excel export logic.

Adaptations required:
- platform App Shell replaces Audit-specific shell;
- Core provides canonical unit/user information;
- permission checks replace hard-coded role checks;
- module routes live under platform routing;
- shared UI primitives should be reused rather than copied.

### Current online PostgreSQL model
Useful concepts:
- UUID-style identifiers;
- normalized inspections/answers/action plans/attachments;
- version-based optimistic concurrency;
- database-enforced authorization concept;
- Realtime capability where it provides business value.

Adaptations required:
- Core-owned entity references;
- generalized Action Plan model;
- platform permission/scope enforcement;
- platform-wide system audit logging;
- incremental migrations in the platform schema.

The current Supabase schema is a reference, not a migration to replay blindly.

### Current media gateway
Useful concepts:
- authenticated media access;
- binary storage outside PostgreSQL;
- metadata rows;
- upload size enforcement.

Adapt to the storage/auth stack selected by the platform.

## Do not port

- single-file HTML architecture;
- LocalStorage as authoritative business data;
- IndexedDB as platform source of truth;
- browser-local recovery as infrastructure backup;
- Audit-specific global app shell;
- fixed role checks such as `role === 'qualidade'`;
- direct module ownership of users/units;
- deleting a Core unit from Audit and cascading all related platform data;
- provider-specific infrastructure assumptions before the platform ADR selects them.

## Platform dependencies required by Audit

Audit v1 requires a minimum set of shared capabilities:

### Core
- authenticated identity/profile;
- authorization/permission evaluation;
- organizational unit;
- optional sector reference where needed by Action Plans;
- organizational data scope;
- system audit-event capability.

### Shared/platform
- App Shell/navigation;
- common modal/form primitives;
- file/attachment contract;
- error/loading/empty-state patterns;
- date/time formatting;
- deployment/configuration conventions.

### Transversal business capability
- Action Plans, according to ADR-003.

## Recommended logical route placement

User-facing navigation:

```text
Qualidade
├── Auditorias
├── Planos de Ação
├── Registros ISO
└── Pesquisa de Satisfação
```

Possible route shape is intentionally not finalized until the web framework/router decision, but Audit must remain addressable as its own module boundary.

## Migration phases

### A. Freeze functional baseline

Done for planning:
- v2.9.1 artifact identified by SHA-256;
- current online v3 main identified;
- post-demonstration brief identified.

### B. Foundation contract

Before moving Audit code:
- select platform application/backend/auth/data/storage architecture;
- define Core entity contracts;
- define first permission catalog;
- define module boundary and public interfaces;
- define migration/test strategy.

### C. Audit skeleton

Create:
- platform navigation entry under Quality;
- Audit module public entry;
- module routes/pages;
- permissions;
- unit-scoped read path.

Do not migrate all functionality at once.

### D. Domain migration

Move/reimplement:
- template;
- inspections;
- answers;
- scoring;
- concurrency;
- finalization;
- regression tests.

### E. Action Plans

Implement the generalized model:
- checklist source;
- manual source;
- effectiveness planning/verification;
- evidence;
- optional sector;
- no duplicate checklist plan.

### F. Media and export

Integrate:
- checklist evidence;
- Action Plan evidence;
- export/report behavior.

### G. Reconciliation

Validate the new module against known standalone/online scenarios:
- score results;
- response counts;
- inspection lifecycle;
- Action Plan creation;
- attachments;
- exports;
- permissions;
- unit scope;
- mobile behavior.

## Open migration decisions

Must be resolved explicitly:

1. Does platform Audit preserve explicit reopening of a finalized inspection?
2. Is unit-history Excel export retained in v1?
3. Does Audit need a user-facing portable archive in addition to infrastructure backup?
4. Which existing online UI components are clean enough to transplant versus reimplement?
5. Is Realtime required for every Audit view or only collaborative editing/status surfaces?
6. Exact permission catalog and unit/sector scope model.
7. Exact retention policy for finalized inspections and evidence.

None of these questions justify blocking architecture work outside their affected area.

