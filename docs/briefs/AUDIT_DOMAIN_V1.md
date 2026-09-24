# Implementation Brief — Audit Domain v1

Status: CLOSED FOR IMPLEMENTATION  
Date: 2026-09-24  
Baseline: `main` at or after `65f41b2e0069a616ddfc8817782b303607ec40b3`

> This brief implements the first real business module of Gaúcha Gestão: Qualidade > Auditorias. It is intentionally limited to the audit/checklist lifecycle. Action Plans, media/evidence, Realtime, infrastructure and deployment remain separate work.

## Objective

Replace the current Audit placeholder with a functional multi-user Audit module built on the accepted Platform Foundation.

At the end of this brief, an authorized user must be able to:

- open Qualidade > Auditorias;
- see only units/inspections allowed by Core authorization;
- create an inspection for an allowed active unit;
- receive the canonical 158-item checklist in 9 sections;
- answer each criterion with AT/AP/NAT/NAP;
- record a textual observation per criterion;
- see progress and partial conformity while filling;
- finalize only a fully answered inspection;
- reopen a finalized inspection only with explicit permission;
- review the unit's inspection history and score evolution;
- safely handle concurrent edits without silent overwrite;
- use the flow on desktop and mobile.

Do not implement Action Plans in this brief.

## Required reading

Before editing:

- `AGENTS.md`
- `docs/briefs/PLATFORM_FOUNDATION_V1.md`
- `docs/reference/AUDIT_CHECKLIST_V1.json`
- `docs/decisions/ADR-001-modular-monolith.md`
- `docs/decisions/ADR-002-core-and-module-ownership.md`
- `docs/decisions/ADR-004-platform-stack.md`
- `docs/decisions/ADR-005-core-authorization.md`
- `docs/architecture/PRODUCT_STRUCTURE.md`
- `docs/architecture/AUTHORIZATION.md`
- `docs/architecture/DATA_MODEL.md`
- `docs/architecture/SECURITY.md`

Inspect the current Audit placeholder and existing Core/shared UI conventions before editing.

Do not load unrelated module documentation.

## Current platform baseline

Platform Foundation v1 is complete and must be preserved.

The following are already established:

- Supabase Auth;
- `core.profiles`;
- canonical `core.units` and `core.sectors`;
- scoped RBAC (`global | unit | sector`);
- RLS helpers in `private`;
- permission-driven navigation;
- optimistic `version` fields;
- Core system audit log;
- local Supabase configuration;
- automated CI validation.

Existing Audit permissions:

- `audit.inspection.read`
- `audit.inspection.create`
- `audit.inspection.edit`
- `audit.inspection.finalize`
- `audit.inspection.reopen`
- `audit.inspection.export`

Do not replace this authorization model with module-specific roles.

## Canonical checklist source

The exact catalog for this implementation is:

`docs/reference/AUDIT_CHECKLIST_V1.json`

Catalog version:

`checklist-geral-2026-09-22-v1`

Reference origin:

`CHECKLIST GERAL - MODELO.xlsx`

Reference SHA-256:

`50e812762e216c64860e9a96c051811a51bed09c397c594b08d52763e2d53902`

The reference catalog was also validated in the standalone Audit implementation v2.9.1.

### Catalog invariants

- exactly 9 sections;
- exactly 158 criteria;
- display numbering intentionally reaches 161;
- numbers 32, 117 and 135 do not exist;
- stable technical item keys use `item-NNN`;
- source text, spelling and punctuation are preserved intentionally;
- implementation must not silently "correct" criterion wording.

Section distribution:

| Order | Section | Items |
| ---: | --- | ---: |
| 1 | ESTRUTURA | 13 |
| 2 | ORGANIZAÇÃO E LIMPEZA DA ESTRUTURA | 22 |
| 3 | ORGANIZAÇÃO E LIMPEZA DOS EQUIPAMENTOS E UTENSÍLIOS | 16 |
| 4 | FUNCIONAMENTO DE EQUIPAMENTOS | 21 |
| 5 | MANIPULADORES DE ALIMENTOS | 12 |
| 6 | PROCEDIMENTOS | 31 |
| 7 | ESTOQUE | 10 |
| 8 | PREPARO DO ALIMENTO | 21 |
| 9 | PLANEJAMENTO | 12 |
| | **Total** | **158** |

Future checklist changes must create a new catalog/template version. Do not mutate a template already referenced by historical inspections.

## Domain ownership

Audit owns its business schema and records.

Create schema:

`audit`

Core remains owner of:

- users/profiles;
- units;
- sectors;
- roles/permissions;
- platform audit log.

Audit may reference Core entities. Core must not depend on Audit.

## Database model

Use new incremental migrations only. Do not modify:

- `202609240001_core_foundation.sql`
- `202609240002_permission_catalog.sql`
- `202609240003_revocation_authority.sql`

A sensible physical model is required to represent the concepts below. Exact non-semantic naming may follow existing repository conventions, but do not change the domain behavior.

### audit.checklist_templates

Immutable versioned checklist definition.

Required semantics:

- stable `version` / catalog key;
- human-readable name;
- expected item count;
- enabled/available-for-new-inspections flag where useful;
- created timestamp.

Clients do not create/edit templates.

### audit.checklist_sections

Required semantics:

- template version;
- stable section key;
- display order;
- section name.

Catalog rows are migration/seed owned and client read-only.

### audit.checklist_items

Required semantics:

- template version;
- stable item key (`item-NNN`);
- section key;
- position/order;
- original display number;
- exact criterion text.

Catalog rows are migration/seed owned and client read-only.

### audit.inspections

Required semantics:

- UUID primary key;
- `unit_id` referencing `core.units`;
- template version;
- application date;
- optional previous-visit date;
- responsible/applying Core user where appropriate;
- lifecycle status (`draft` / `finalized`, or equivalent narrow representation);
- authoritative final score nullable until finalization;
- authoritative final classification nullable until finalization;
- finalization actor/time;
- optimistic `version`;
- created/updated timestamps;
- created/updated actor metadata.

Do not duplicate unit name or user authorization state in Audit.

Do not hard-delete inspections in v1.

### audit.inspection_answers

One row per checklist item per inspection.

Required semantics:

- inspection ID;
- template version/item key relationship;
- response nullable while draft;
- observation text;
- optimistic `version`;
- updated timestamp/actor;
- unique `(inspection_id, item_key)`.

Inspection creation must initialize exactly 158 answer rows from the selected immutable template.

Normal clients must not arbitrarily insert/delete answer rows after creation.

## Response states

Allowed responses are exactly:

- `AT` — Atende
- `AP` — Atende parcialmente
- `NAT` — Não atende
- `NAP` — Não se aplica
- `null` — Não respondido while draft

Do not invent a fifth business response.

Selecting the currently selected response again may clear it back to unanswered while the inspection is editable.

## Scoring

The scoring rule is authoritative and must be identical in database finalization, UI display and automated tests.

For a set of criteria:

```text
AT  = count(response = AT)
AP  = count(response = AP)
NAT = count(response = NAT)
NAP = count(response = NAP)

answered = AT + AP + NAT + NAP
applicable_answered = AT + AP + NAT

partial_conformity =
  (AT + 0.5 × AP) / applicable_answered × 100
```

If `applicable_answered = 0`, conformity is undefined (`null`/no score), not 0%.

For a completed 158-item inspection, the same calculation is equivalent to:

```text
final_conformity =
  (AT + 0.5 × AP) / (158 - NAP) × 100
```

Do not include unanswered or NAP criteria in the score denominator.

### Progress

```text
progress = answered / total_items × 100
```

Progress and conformity are separate concepts.

A new inspection with zero answers displays:

- progress: 0/158;
- conformity: no data / `—`;
- no classification.

### Partial score

While the inspection is incomplete:

- show partial conformity when at least one applicable criterion is answered;
- explicitly label it as partial/in progress;
- do not present Adequada / Parcialmente adequada / Inadequada as a final classification;
- incomplete state uses neutral progress styling, not final green/yellow/red status.

### Final classification

Only after all 158 criteria are answered:

- `>= 76%` => **Adequada**
- `>= 51% and < 76%` => **Adequada parcialmente e requer análise de mudanças**
- `< 51%` => **Inadequada e requer intervenção imediata**

Compare thresholds using the unrounded numeric result.

UI may display one decimal place. Do not use the rounded display value to decide classification.

If all 158 responses are NAP, final conformity/classification remain undefined and the UI must state that there are no applicable criteria; do not divide by zero.

### Section score

Each of the 9 sections uses the same scoring semantics over only its own criteria.

Section classification is final only when every item in that section is answered.

## Inspection lifecycle

### Create

Requires `audit.inspection.create` covering the selected unit.

Creation must be atomic:

1. validate active profile and permission;
2. validate active unit;
3. choose the active canonical template;
4. create the inspection;
5. create exactly 158 unanswered rows.

Prefer a trusted database RPC/transaction rather than a client loop performing 159 independent inserts.

Do not create inspections for inactive units.

### Draft/edit

An inspection in draft may be edited only with `audit.inspection.edit` covering its unit.

Editable in this brief:

- response;
- observation;
- application/previous-visit metadata only if the current product UI exposes those fields.

Do not allow response/observation mutations after finalization.

### Finalize

Requires `audit.inspection.finalize` covering the inspection unit.

Finalization must be an atomic trusted operation and must:

- use expected inspection version for optimistic concurrency;
- reject already-finalized/stale state;
- verify all 158 answer rows exist;
- verify all 158 have a response;
- compute authoritative counts/score;
- compute classification when applicable;
- persist final score/classification;
- persist finalization actor/time;
- set status finalized;
- increment version;
- record a trusted `core.system_audit_log` event with `module='audit'` or equivalent established value.

No client-supplied score/classification may be trusted.

### Reopen

Requires `audit.inspection.reopen` covering the inspection unit.

Reopening must be explicit, confirmed in application UI and atomic.

It must:

- require expected inspection version;
- change the lifecycle back to editable draft;
- preserve all existing answers/observations;
- clear current authoritative final score/classification while the inspection is reopened;
- increment version;
- record actor/time through trusted auditing.

Re-finalization recomputes the result from current answers.

### Delete

Out of scope.

Do not add a delete button or hard-delete API.

## Authorization / RLS

Every Audit table reachable from the Data API must have explicit grants and RLS.

Default deny.

### Catalog

Checklist template/section/item definitions contain no unit data.

They may be readable by active authenticated platform users who need the Audit surface. They remain client read-only.

### Inspections

Conceptually:

```text
SELECT
-> has_unit_permission('audit.inspection.read', unit_id)

CREATE
-> has_unit_permission('audit.inspection.create', unit_id)

EDIT
-> has_unit_permission('audit.inspection.edit', unit_id)

FINALIZE
-> has_unit_permission('audit.inspection.finalize', unit_id)

REOPEN
-> has_unit_permission('audit.inspection.reopen', unit_id)
```

Use the existing Core authorization helpers; do not copy RBAC logic into Audit.

A sector-scoped assignment must not accidentally gain access to a unit-wide inspection merely because it belongs to the same unit. Follow ADR-005 scope semantics.

### Answers

Answer read/write authorization derives from the parent inspection's unit and lifecycle.

Knowing an inspection UUID or item key must not bypass scope.

Anonymous users receive no Audit data.

Inactive Core profiles receive no Audit data even with an existing Auth session.

## Grants

Use narrow column grants where practical.

In particular:

- ordinary clients must not update final score/classification/finalization actor fields directly;
- ordinary clients must not directly set lifecycle state to bypass finalize/reopen rules;
- ordinary clients must not mutate checklist catalog rows;
- ordinary clients must not insert/delete arbitrary answer rows.

Trusted RPCs may perform these operations only after authorization/business validation.

## Concurrency

Concurrency is required in v1 because multiple users may access the same inspection.

### Inspection metadata/lifecycle

Use optimistic `version`.

Mutations that depend on current inspection state use the expected version.

A stale write must fail visibly; never last-write-wins silently.

### Answers

Each answer row also uses optimistic `version`.

Different users editing different criteria may succeed concurrently.

If two sessions edit the same criterion from the same version:

- first successful update wins;
- second receives a conflict;
- UI shows a clear conflict state;
- reload the latest server value;
- do not silently overwrite.

Observation edits must follow the same rule.

Do not build a generalized collaborative editor framework.

Realtime is explicitly out of scope; correctness must not depend on Realtime.

## UI / routes

Preserve the platform shell and permission-driven navigation.

Replace the current `AuditEntry` placeholder with real module routes/surfaces.

Suggested route semantics; adapt to existing router conventions without changing the product behavior:

```text
/audit
/audit/units/:unitId
/audit/inspections/:inspectionId
```

### Audit overview

Useful operational surface, not a decorative dashboard.

Show only authorized units/inspection data.

At minimum:

- page title;
- `Nova auditoria` when `audit.inspection.create` is effective for at least one unit;
- active unit/inspection search or filter when useful;
- latest inspection state per visible unit;
- last application date;
- final conformity for latest finalized inspection, or explicit in-progress state;
- count/list of inspections in progress;
- recent history entry points.

When two finalized inspections exist for a unit, the UI may show score delta in percentage points.

Treat absolute deltas `< 0.5 p.p.` as stable if trend is implemented.

Do not fabricate KPIs without persisted Audit data.

### Unit history

For an authorized unit show inspections newest first with:

- application date;
- responsible/applying user;
- lifecycle state;
- progress when draft;
- final score/classification when finalized;
- comparison/delta with the previous finalized inspection when available;
- open action.

Do not show final classification for an incomplete inspection.

### Inspection detail

Provide:

- breadcrumb back to Auditorias / Unit;
- unit;
- application date;
- responsible;
- lifecycle state;
- progress;
- overall conformity;
- section navigation;
- section scores;
- checklist content;
- finalize/reopen actions according to permission and state.

No Action Plan tab in this brief.

### Checklist interaction

Each item shows:

- original display number;
- exact criterion;
- AT;
- AP;
- NAT;
- NAP;
- observation.

Response buttons must have accessible labels/states.

AP and NAT may visually emphasize the observation field, but observation is not made mandatory in v1 unless a later business decision says so.

Save mutations to the server rather than keeping an unsynchronized local-only copy.

Provide clear `saving / saved / error / conflict` feedback without noisy global alerts.

## Mobile / accessibility

The module must be fully usable at 375px width and normal desktop widths.

Requirements:

- no mandatory horizontal scrolling for checklist operation;
- section navigation becomes a compact selector/drawer/modal as appropriate;
- response controls remain touch-friendly;
- long criteria wrap;
- dialogs fit `dvh`/safe areas where existing UI conventions support it;
- visible keyboard focus;
- semantic buttons/labels;
- native mobile keyboard opens only after explicit user interaction with a text field;
- no `alert()`, `confirm()` or `prompt()`.

Reuse existing shared modal/dialog/UI components before creating new ones.

## Loading / empty / error states

Implement explicit states for:

- loading overview;
- no authorized Audit data;
- unit with no inspections;
- newly created inspection;
- failed fetch;
- failed save;
- stale/concurrent save;
- unauthorized direct route;
- finalized inspection read-only state.

Do not render a misleading 0% when score is undefined.

## Data access

Keep Supabase access inside the module's data/domain boundary.

Do not scatter raw queries through presentation components.

Use strongly typed repository/service functions consistent with the current application conventions.

Do not add a custom backend server only for this module.

## Out of scope

Do not implement in this brief:

- Action Plan tables or UI;
- automatic AP/NAT Action Plan generation;
- manual Action Plans;
- effectiveness verification;
- checklist photos;
- file/document evidence;
- Supabase Storage;
- Cloudflare R2;
- Realtime subscriptions;
- occurrence/non-conformity workflows;
- ISO;
- Satisfaction;
- ABC;
- Planned vs Actual;
- Contracts;
- Meetings;
- Sales;
- Fleet;
- standalone-system data migration/import;
- backup ZIP/JSON flows from the old offline app;
- production infrastructure;
- Cloudflare;
- Envoy;
- Supavisor configuration;
- server/ML350 configuration;
- production deployment;
- production secrets.

`audit.inspection.export` already exists in the permission catalog, but Excel/PDF export is not required by this brief. Do not build placeholder export UI.

## Automated tests

Add/extend tests covering at minimum:

### Catalog

1. catalog version is exactly `checklist-geral-2026-09-22-v1`;
2. exactly 9 sections;
3. exactly 158 items;
4. item keys are unique;
5. display numbers are unique;
6. missing display numbers are exactly 32, 117 and 135;
7. section item counts match the reference;
8. database seed matches `docs/reference/AUDIT_CHECKLIST_V1.json`.

### Scoring

9. zero answers => score undefined and progress 0;
10. one AT in a draft => 100% partial, not final;
11. 158 AT => 100% final Adequada;
12. 79 AT + 79 NAT => 50% final Inadequada;
13. AP counts as 0.5;
14. NAP is excluded from denominator;
15. section score follows the same formula;
16. all NAP => undefined score without division-by-zero;
17. thresholds 50.99 / 51 / 75.99 / 76 behave correctly before display rounding.

### Lifecycle

18. create produces one inspection + exactly 158 unanswered rows atomically;
19. inactive unit cannot receive new inspection;
20. finalize rejects incomplete inspection;
21. finalize rejects stale expected version;
22. final score is computed server-side, not accepted from client;
23. finalized inspection blocks answer mutation;
24. reopen requires permission and expected version;
25. reopen preserves answers and returns inspection to editable state;
26. re-finalization recomputes result.

### Authorization

27. anon denied;
28. inactive profile denied;
29. authenticated user without Audit assignment denied;
30. global Audit read succeeds;
31. correct unit scope succeeds;
32. other unit denied;
33. sector-only assignment does not leak into a unit-wide inspection;
34. guessed inspection UUID cannot bypass RLS;
35. create/edit/finalize/reopen each require their own permission;
36. answer access inherits parent inspection authorization.

### Concurrency

37. two sessions updating different answers can both succeed;
38. stale update of the same answer is rejected;
39. stale lifecycle mutation is rejected.

### Frontend

40. permission-aware Audit navigation remains correct;
41. draft/finalized states render correctly;
42. partial result is not shown as final classification;
43. critical route/loading/error/conflict states are covered where practical.

## Validation

Before completion:

- `npm ci`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

Additionally, when local Supabase/Docker is available:

- reset/apply all migrations from zero;
- validate the Audit migrations against real PostgreSQL;
- exercise Auth + PostgREST + RLS with real JWTs;
- validate at least two sessions for concurrency;
- confirm no secret/service key appears in browser source;
- confirm no native `alert(`, `confirm(`, `prompt(` was introduced.

The local Supabase environment is sufficient. Do not touch production.

If a real integration validation cannot run, report the limitation exactly.

## Migration rules

- only new incremental migrations;
- preserve Platform Foundation migrations unchanged;
- no destructive Core changes;
- catalog seed must be deterministic/idempotent within normal migration execution;
- RLS and grants are part of the same delivered domain slice;
- no production migration execution.

Preferred separation if it remains clear:

1. Audit schema/domain/RLS/RPC foundation;
2. canonical checklist catalog seed.

Do not split merely for commit count.

## Git

Use focused atomic commits.

A reasonable grouping:

1. Audit schema/catalog/RLS;
2. scoring + domain data access;
3. overview/history/checklist UI;
4. lifecycle/concurrency;
5. tests/hardening.

Do not force this exact split if a smaller coherent grouping is better.

Do not force-push.

## Acceptance criteria

This brief is complete when:

- an authorized user can create and fill the canonical 158-item inspection;
- the 9 sections and criterion wording match the reference catalog;
- scoring matches the defined rule;
- incomplete inspections are clearly partial;
- finalization requires 158/158 answered;
- finalized inspections are read-only;
- reopen is explicit and permission protected;
- history works per unit;
- RLS prevents cross-unit/unauthorized access;
- concurrent same-answer edits cannot silently overwrite;
- mobile checklist operation is usable;
- all required validation passes;
- no out-of-scope Action Plan/media/infrastructure work was introduced.

## Completion report

Return only:

1. main files changed;
2. migrations created;
3. tests/validation executed;
4. real pending issues;
5. commits.
