# Implementation Brief — Action Plan Domain v1

Status: CLOSED FOR IMPLEMENTATION  
Date: 2026-09-24  
Baseline: `main` at or after `936626d13d1697dd88e643aec673a543b57a5ae6`

> This brief implements the transversal **Qualidade > Planos de Ação** module on top of the accepted Platform Foundation and Audit Domain v1. It covers checklist-generated plans, manual plans, execution tracking and effectiveness verification. Binary evidence/uploads, Storage/R2, Occurrences, Nonconformities and Meetings remain separate work.

## Objective

Create one canonical Action Plans module for the platform.

At the end of this brief, an authorized user must be able to:

- open `Qualidade > Planos de Ação`;
- see only plans covered by their Core permission + organizational scope;
- receive an Action Plan automatically when an Audit criterion becomes `AP` or `NAT`;
- keep exactly one checklist-origin plan for the same inspection criterion;
- create a manual Action Plan not linked to an Audit;
- assign the plan to a unit and optionally a sector;
- record the improvement point, action, execution method, responsible party, due date, effectiveness criterion, monitoring period and expected evidence;
- track `Pendente`, `Em andamento` and `Concluído`;
- identify overdue plans;
- verify effectiveness only after completion;
- classify effectiveness as `Eficaz`, `Parcialmente eficaz` or `Ineficaz`;
- record verification date and analysis;
- preserve history if the originating Audit answer later stops being `AP/NAT`;
- safely handle concurrent edits without silent overwrite;
- use the flow on desktop and mobile.

The domain must remain ready for future origins without implementing their workflows now.

## Business basis

The business structure agreed for a general Action Plan is:

```text
Ponto de melhoria / tópico
        ↓
O que fazer
        ↓
Como fazer
        ↓
Responsável
        ↓
Prazo
        ↓
Critério de eficácia
        ↓
Período de acompanhamento
        ↓
Evidência esperada
        ↓
Execução / status
        ↓
Verificação
        ↓
Eficácia
```

The central Action Plan differs from the old checklist-only implementation because a plan may exist without being linked to a checklist.

The currently approved origins in v1 are:

- Audit checklist;
- Manual.

Future product origins discussed but **not implemented in this brief** include:

- occurrence;
- nonconformity;
- meeting/alignment.

Do not build placeholder workflows, tables or screens for those future origins.

## Required reading

Before editing:

- `AGENTS.md`
- `docs/briefs/PLATFORM_FOUNDATION_V1.md`
- `docs/briefs/AUDIT_DOMAIN_V1.md`
- `docs/decisions/ADR-001-modular-monolith.md`
- `docs/decisions/ADR-002-core-and-module-ownership.md`
- `docs/decisions/ADR-004-platform-stack.md`
- `docs/decisions/ADR-005-core-authorization.md`
- `docs/architecture/PRODUCT_STRUCTURE.md`
- `docs/architecture/AUTHORIZATION.md`
- `docs/architecture/DATA_MODEL.md`
- `docs/architecture/SECURITY.md`

Inspect the current Audit implementation and Core/shared UI conventions before editing.

Do not load unrelated module documentation.

## Current platform baseline

The implementation must preserve:

- Platform Foundation v1;
- Supabase Auth;
- canonical Core users, units and sectors;
- scoped RBAC (`global | unit | sector`);
- Core authorization helpers;
- Core system audit log;
- permission-driven navigation;
- Audit Domain v1;
- immutable 158-item Audit checklist;
- Audit optimistic concurrency;
- current CI/build verification.

Existing Action Plan permissions are already canonical:

- `action_plan.read`
- `action_plan.create_manual`
- `action_plan.write`
- `action_plan.verify`

Do not add new Action Plan permissions in v1 unless a concrete security boundary in this brief cannot be represented with the existing catalog.

Application logic checks permissions, never role names.

## Domain ownership

Create/use the business schema:

`action_plans`

Private trusted helpers should live in a non-exposed schema:

`action_plans_private`

Core remains owner of:

- users/profiles;
- units;
- sectors;
- roles/permissions;
- platform audit log.

Audit remains owner of:

- inspections;
- checklist catalog;
- inspection answers.

Action Plans may reference Audit through the explicit integration contract defined by this brief.

Core must not depend on Action Plans.

Audit business tables must not be moved into Action Plans.

## Source model

Every plan has a source type.

Allowed v1 values:

- `checklist`
- `manual`

Do not add production behavior for occurrence/nonconformity/meeting yet.

The data model must use a source-type concept so future origins can be added by incremental migration without redesigning the entire plan entity.

### Checklist source

A checklist-origin plan is linked to exactly:

- one `audit.inspections` row;
- one `audit.inspection_answers.item_key`.

It inherits:

- `unit_id` from the inspection;
- no sector in v1 because Audit inspections/criteria are unit-wide resources;
- the criterion text as the initial improvement point;
- the current AP/NAT response as source severity/context;
- the Audit observation as source context.

Checklist-origin source identity is immutable.

Use a unique database constraint so the same inspection + item cannot generate duplicate plans.

### Manual source

A manual plan:

- has no Audit inspection/item link;
- requires a unit;
- may optionally have a sector valid for that unit;
- has a user-entered improvement point.

A manual plan is created only through the approved manual-create operation.

## Database model

Use new incremental migration(s) only.

Do not modify migrations already published through:

- `202609240005_audit_checklist_v1.sql`

A sensible physical model must represent the semantics below. Exact non-semantic names may follow repository conventions.

### action_plans.plans

Required semantics:

- UUID primary key;
- `unit_id uuid not null` -> `core.units`;
- optional `sector_id uuid` -> `core.sectors`;
- `source_type` = `checklist | manual`;
- nullable Audit inspection reference;
- nullable Audit item key;
- checklist source active flag;
- checklist source response/context where applicable;
- checklist observation snapshot/context where applicable;
- improvement point/topic;
- action / what to do;
- how to do it;
- responsible party;
- due date;
- status;
- effectiveness criterion;
- optional monitoring start date;
- optional monitoring end date;
- expected evidence description;
- effectiveness result;
- verification business date;
- verification analysis/notes;
- verification actor/time;
- completion actor/time where useful;
- optimistic `version`;
- created/updated timestamps;
- created/updated actor metadata.

Do not store uploaded bytes in this table.

### Responsible party

In v1, the responsible party is a **business label/text**, not necessarily a platform account.

This is intentional because valid responsible parties may be roles or teams such as:

- Gestora da Unidade;
- Líder de Produção;
- Nutricionista RT;
- Equipe de Qualidade;
- Equipe de Manutenção.

Do not require `admin.user.read` merely to assign an Action Plan.

Do not create a duplicate user directory inside Action Plans.

A future optional link to a Core profile may be added only when there is a concrete notification/account workflow.

## Status lifecycle

Allowed statuses are exactly:

- `pending` — Pendente
- `in_progress` — Em andamento
- `completed` — Concluído

Do not invent a fourth operational status in v1.

Overdue is **computed**, not stored:

```text
overdue =
  due_date < current business date
  AND status != completed
```

### Pending

A newly generated checklist plan starts as `pending`.

A newly created manual plan also starts as `pending`.

Pending plans may still have incomplete planning fields.

### In progress

Before moving a plan to `in_progress`, require:

- non-empty improvement point;
- non-empty action / what to do;
- non-empty how-to;
- non-empty responsible party;
- due date;
- non-empty effectiveness criterion;
- non-empty expected evidence.

If monitoring dates are used:

- both start and end must be present;
- start <= end.

### Completed

Moving to `completed` requires the same planning completeness as `in_progress`.

Persist completion actor/time through a trusted operation.

Completed does **not** automatically mean effective.

The UI must distinguish:

- completed, effectiveness pending;
- completed and verified effective;
- completed and verified partially effective;
- completed and verified ineffective.

## Effectiveness verification

Verification is a separate business capability protected by:

`action_plan.verify`

Allowed values:

- `effective` — Eficaz
- `partially_effective` — Parcialmente eficaz
- `ineffective` — Ineficaz

Verification requires:

- plan status = `completed`;
- effectiveness criterion present;
- expected evidence present;
- verification date;
- effectiveness result;
- non-empty verification analysis/notes;
- expected optimistic version.

Persist:

- result;
- verification date;
- notes/analysis;
- verified_by;
- verified_at.

The verifier is always the authenticated Core user performing the trusted verification operation.

Do not allow an ordinary client to forge `verified_by` or `verified_at`.

### After verification

Once effectiveness has been recorded:

- ordinary `action_plan.write` must not silently change the execution/planning facts in a way that invalidates the verification;
- verification fields may only be changed through the trusted `action_plan.verify` path;
- if re-verification is permitted by the implementation, it must require `action_plan.verify`, expected version and a new audit-log entry.

Do not add a generalized verification-history subsystem in v1. The Core system audit log preserves before/after mutation history.

## Expected evidence vs evidence attachments

These are different concepts.

### Expected evidence — IN SCOPE

Text describing how the organization will know the action worked.

Examples:

- “Após reinstalação das telas, acompanhar por 5 dias e não registrar novo incidente.”
- “Apresentar checklist diário preenchido durante o período de acompanhamento.”
- “Validar ausência de reincidência no próximo ciclo.”

Store this as business text in the plan.

### Binary evidence — OUT OF SCOPE

Actual:

- photos;
- PDFs;
- spreadsheets;
- Word files;
- CSV/TXT;
- other uploaded evidence.

Do not implement file upload in this brief.

Do not create fake attachment buttons or local-only file persistence.

A later Evidence/Storage brief will implement attachments through the approved Supabase Storage / R2 architecture.

The Action Plan UI must remain useful without binary evidence by showing:

- effectiveness criterion;
- monitoring period;
- expected evidence;
- verification analysis.

## Checklist integration contract

Checklist-origin plans must be synchronized automatically and transactionally from Audit answer changes.

The current Audit implementation writes answers directly through PostgREST with optimistic version checks.

For Action Plans v1, the approved cross-module integration is:

- Action Plans owns the synchronization logic;
- the synchronization function lives in `action_plans_private`;
- a narrowly scoped database trigger may be attached to `audit.inspection_answers`;
- the trigger may read the parent inspection and canonical checklist item;
- it writes only to `action_plans`;
- it must not mutate Audit rows;
- it must not bypass Audit RLS for user-initiated answer updates; Audit remains authoritative for whether the answer update is allowed.

This trigger is an explicit cross-module contract, not permission for Action Plans to reach into arbitrary Audit internals.

### When response becomes AP or NAT

Ensure exactly one checklist-origin plan exists for the inspection item.

If none exists:

- create it;
- `source_active = true`;
- copy current AP/NAT source response;
- initialize improvement point from the exact canonical criterion text;
- copy the current Audit observation as source context;
- status = pending;
- preserve the actor as the authenticated user that changed the answer.

If it already exists:

- do not create a duplicate;
- set/update source response;
- set `source_active = true`;
- refresh source observation/context;
- preserve all user-entered plan fields;
- preserve current status and any verification.

### When observation changes while source is AP/NAT

Refresh the plan's source observation/context.

Do not overwrite:

- action;
- how-to;
- responsible;
- due date;
- effectiveness criterion;
- expected evidence;
- verification fields.

### When response stops being AP/NAT

If the answer becomes:

- AT;
- NAP;
- unanswered/null;

then:

- do not delete the plan;
- set `source_active = false`;
- preserve the plan and its history;
- preserve all execution and verification data.

The normal operational list hides inactive checklist-source plans by default, but they remain retrievable in history/detail.

### When AP/NAT returns

Reactivate the same plan:

- `source_active = true`;
- update source response/observation;
- do not create a duplicate;
- do not silently erase a prior verification.

If a previously verified source reactivates, surface a clear warning in the plan detail/list that the source condition is active again after prior verification. Do not automatically delete or rewrite the prior verification.

### Migration backfill

When the Action Plans migration is first applied:

- create checklist-origin plans for all existing Audit answers currently marked AP/NAT;
- create no plans for AT/NAP/null;
- enforce the same uniqueness/invariants as live synchronization.

This must be deterministic.

## Manual plan creation

Manual creation requires:

`action_plan.create_manual`

The trusted create operation must:

1. validate active Core profile;
2. validate permission covering the selected unit/sector;
3. validate active unit;
4. when sector is supplied:
   - validate active sector;
   - validate the `core.unit_sectors` association;
5. create source_type = manual;
6. create status = pending;
7. reject any attempt to forge checklist source references;
8. set actor/timestamps server-side;
9. record a trusted Core system audit event.

Minimum create fields:

- unit;
- optional sector;
- improvement point/topic.

The remaining planning fields may be filled before the plan moves to `in_progress`.

Do not require the user to complete every field simply to save a new pending manual plan.

## Plan editing

`action_plan.write` protects normal planning/execution changes.

Use trusted RPC(s) or an equivalently narrow server/database contract rather than granting broad direct UPDATE over sensitive columns.

Editable through normal write before verification:

- improvement point where source_type=manual;
- action / what to do;
- how-to;
- responsible;
- due date;
- status subject to lifecycle rules;
- effectiveness criterion;
- monitoring dates;
- expected evidence.

For checklist-origin plans:

- source type;
- source inspection;
- source item;
- source response;
- source observation/context;
- source_active;
- unit;

are not editable by the client.

Checklist-origin improvement point is the canonical criterion and should not be freely rewritten. If additional interpretation is needed, use the action/how-to fields.

For manual plans:

- unit/sector may be editable only if authorization is revalidated for both old and new scope and history remains auditable;
- if this introduces unnecessary complexity, keep unit/sector immutable after creation in v1. Prefer the simpler safe choice.

No hard delete in v1.

## Authorization and RLS

Every table/function reachable through the Data API must use explicit grants and default-deny RLS/EXECUTE policy.

### Scope semantics

A plan with:

`sector_id IS NULL`

is a **unit-wide** resource.

Use semantics equivalent to:

`private.has_unit_permission(permission, unit_id)`

A plan with:

`sector_id IS NOT NULL`

is a **sector-scoped** resource.

Use semantics equivalent to:

`private.has_scoped_permission(permission, unit_id, sector_id)`

Therefore:

- global assignment covers all;
- matching unit assignment covers unit-wide and sector plans in that unit;
- matching sector assignment covers only plans for that exact sector;
- sector-only assignment must not read/write unit-wide plans.

### Read

Requires:

`action_plan.read`

Knowing a plan UUID must not bypass RLS.

### Manual create

Requires:

`action_plan.create_manual`

for the requested unit/sector.

### Write

Requires:

`action_plan.write`

for the plan scope.

### Verify

Requires:

`action_plan.verify`

for the plan scope.

`action_plan.write` alone must not grant verification authority.

`action_plan.verify` alone must not grant general planning/edit authority.

### Automatic checklist creation

Automatic checklist-origin creation is a trusted consequence of a valid Audit answer update.

It does not require `action_plan.create_manual`.

The plan still remains unreadable/uneditable to a user who lacks the relevant Action Plan permissions.

Anonymous and inactive-profile access is denied.

## Grants

Prefer:

- SELECT under RLS;
- no arbitrary client INSERT/DELETE;
- no broad direct UPDATE;
- narrowly granted trusted RPCs;
- private trigger functions not directly executable by clients.

Clients must not directly write:

- source linkage/context;
- source_active;
- verification actor/time;
- completion actor/time;
- created/updated actor metadata;
- version;
- system audit events.

SECURITY DEFINER functions, where used:

- fixed/empty `search_path`;
- fully qualified relations;
- least EXECUTE grant;
- internal authorization checks;
- no generic privilege bypass.

## Concurrency

Concurrency is required.

### Plan row

Use optimistic `version`.

Every user mutation that depends on current state receives expected version.

If stale:

- fail visibly;
- return/recognize a conflict;
- reload latest server state;
- never silently last-write-wins.

### Audit synchronization

Checklist source synchronization must serialize safely with user Action Plan writes.

The trigger must not reset or overwrite user-entered fields.

Two answer changes must not create duplicate plans.

### Verification

Verification requires expected version.

A stale verification must fail.

## Core system audit log

Sensitive Action Plan mutations write trusted events to `core.system_audit_log` with module value equivalent to:

`action_plans`

At minimum log:

- manual plan creation;
- automatic checklist plan creation;
- source activation/deactivation when AP/NAT eligibility changes;
- plan planning/execution update;
- status transition;
- effectiveness verification/re-verification.

Include:

- actor;
- entity;
- unit;
- sector when present;
- relevant before/after data.

Do not put secrets or binary data in audit log payloads.

Do not create a second generic system-audit table.

## Public module/data contracts

Keep Action Plans data access inside its module boundary.

A reasonable frontend structure is:

```text
apps/web/src/modules/action-plans/
├── ActionPlansModule.tsx
├── ActionPlansOverview.tsx
├── ActionPlanPage.tsx
├── NewActionPlan.tsx
├── api.ts
├── types.ts
└── ...
```

Exact filenames may follow current conventions.

Raw Supabase queries/RPCs must not be scattered through presentation components.

### Cross-link from Audit

Expose a stable user-facing route contract:

`/action-plans?inspection=<inspectionId>`

Audit may add a simple link such as:

`Planos de ação desta auditoria`

only when the current user has `action_plan.read` covering that unit.

The Action Plans module applies all authorization itself.

If the user has Action Plan permission but not Audit read permission, Action Plan source context must still be usable from the plan record itself; do not depend on Audit screen access.

A link back to the Audit inspection may be shown only when the user also has `audit.inspection.read` for that unit.

Do not add an Audit “Plano de Ação” implementation inside the Audit module. The canonical UI is the transversal Action Plans module.

## UI / routes

Add permission-driven destination:

`Qualidade > Planos de Ação`

Suggested route contract:

```text
/action-plans
/action-plans/:planId
```

Manual creation may use a modal/sheet or a dedicated nested route consistent with existing UI.

### Action Plans overview

This is an operational work queue, not a decorative dashboard.

At minimum show authorized data with:

- total active/open plans;
- overdue plans;
- completed plans awaiting effectiveness verification;
- verified ineffective/partially effective plans when useful;
- `Novo plano` when the user has manual-create permission;
- unit filter;
- sector filter when relevant;
- status filter;
- origin filter;
- overdue filter;
- search by improvement point/responsible;
- source filter from `?inspection=<id>` when provided.

Default operational scope:

- show manual plans;
- show checklist plans with `source_active = true`;
- hide inactive checklist-source history unless explicitly requested.

Sort operationally:

1. overdue open plans;
2. checklist NAT plans;
3. other open plans;
4. completed awaiting verification;
5. verified/completed history.

Do not rely on color alone.

### Plan list/card/table

Show at minimum:

- improvement point;
- origin;
- unit;
- sector when present;
- source response AP/NAT when checklist-generated;
- responsible;
- due date;
- status;
- overdue indicator;
- effectiveness state;
- open/detail action.

On mobile, use cards or a responsive representation without mandatory horizontal scrolling.

### Plan detail

Group information clearly:

#### Origem

- Manual or Checklist;
- unit;
- optional sector;
- for checklist:
  - inspection application date where available;
  - item number/criterion;
  - current source AP/NAT when active;
  - source observation;
  - source-active/inactive state;
  - warning if a verified source is active again.

#### Planejamento / execução

- improvement point;
- action / what to do;
- how to do;
- responsible;
- due date;
- status.

#### Verificação planejada

- effectiveness criterion;
- monitoring start/end;
- expected evidence.

#### Verificação realizada

- effectiveness result;
- verification date;
- analysis/notes;
- verifier;
- verification timestamp.

Do not render a binary-evidence upload section in this brief.

### Manual plan form

Must support:

- unit;
- optional sector;
- improvement point;
- action;
- how-to;
- responsible;
- due date;
- effectiveness criterion;
- optional monitoring period;
- expected evidence.

Only unit + improvement point are required to create a pending plan.

The form should make it clear which fields are still required before moving to `Em andamento`.

### Status actions

Use explicit application dialogs/confirmation where the transition has material consequences.

No native:

- `alert()`
- `confirm()`
- `prompt()`

### Effectiveness verification UI

Only show/enable verification action when:

- user has `action_plan.verify`;
- plan is completed.

Require:

- Eficaz / Parcialmente eficaz / Ineficaz;
- verification date;
- analysis.

Show the planned criterion and expected evidence next to the verification form so the verifier evaluates against the agreed criterion rather than by memory.

## Mobile and accessibility

The Action Plans module must be usable at 375px and normal desktop widths.

Requirements:

- no mandatory horizontal scrolling for normal operation;
- touch targets appropriate for mobile;
- long improvement/action text wraps;
- forms use proper labels;
- native keyboard opens only after user interaction;
- dialogs fit viewport/dvh and safe areas using existing conventions;
- visible focus;
- semantic status text;
- color is supplementary only;
- loading/saving states are announced appropriately;
- no autofocusing a text field in a way that forces the mobile keyboard open on screen load.

Reuse existing shared UI/dialog patterns before adding new primitives.

## Loading / empty / error / conflict states

Implement explicit states for:

- loading overview;
- no authorized plans;
- no plans matching filters;
- failed list/detail fetch;
- unauthorized direct route;
- failed save;
- stale/concurrent save;
- completed but effectiveness pending;
- inactive checklist source;
- verified source that became active again.

Do not show fake zero-count metrics while data is still loading.

## Out of scope

Do not implement in this brief:

- binary evidence/file uploads;
- Supabase Storage buckets;
- Cloudflare R2;
- signed object URLs;
- upload malware scanning;
- Realtime;
- notifications/email;
- reminders/automations;
- occurrence module;
- nonconformity module;
- meeting module;
- ISO;
- Satisfaction;
- ABC;
- Planned vs Actual;
- Contracts;
- Room Booking;
- Sales;
- Fleet;
- Action Plan Excel/PDF export;
- deleting Action Plans;
- follow-up-plan graph/parent-child workflow;
- custom user directory;
- production infrastructure;
- Cloudflare configuration;
- Envoy;
- Supavisor configuration;
- ML350/server configuration;
- deployment;
- production secrets.

Do not create placeholders for out-of-scope features.

## Automated tests

Add/extend tests covering at minimum:

### Schema / source

1. Action Plans schema is exposed and private helper schema is not exposed;
2. plan source values accepted in v1 are exactly checklist/manual;
3. checklist source shape requires inspection + item;
4. manual source cannot forge Audit source linkage;
5. checklist source uniqueness prevents duplicates;
6. sector must belong to the selected unit for manual creation;
7. checklist plan unit matches parent Audit inspection.

### Automatic checklist integration

8. AT -> AP creates exactly one pending plan;
9. AT -> NAT creates exactly one pending plan;
10. AP -> NAT updates the same plan, no duplicate;
11. AP/NAT observation change refreshes source context without overwriting plan fields;
12. AP/NAT -> AT marks source inactive and preserves plan;
13. AP/NAT -> NAP marks source inactive and preserves plan;
14. AP/NAT -> null marks source inactive and preserves plan;
15. returning to AP/NAT reactivates the same plan;
16. user-entered action/how/responsible/effectiveness data survives source sync;
17. a verified plan reactivated by source keeps verification and is flagged;
18. migration backfill creates plans only for current AP/NAT answers;
19. concurrent source updates do not create duplicates.

### Manual creation

20. user without `create_manual` denied;
21. valid global permission can create;
22. valid unit permission can create only in covered unit;
23. sector-scoped permission can create only in exact sector;
24. sector-scoped permission cannot create unit-wide manual plan;
25. inactive unit rejected;
26. inactive/invalid sector rejected;
27. pending manual creation requires only unit + improvement point;
28. created actor/time are server-controlled.

### Authorization

29. anon denied;
30. inactive Core profile denied;
31. no Action Plan permission denied;
32. global read succeeds;
33. matching unit read succeeds;
34. different unit denied;
35. matching sector read succeeds for sector plan;
36. sector-only assignment cannot read unit-wide plan;
37. guessed plan UUID cannot bypass RLS;
38. `write` does not imply `verify`;
39. `verify` does not imply general `write`;
40. checklist automatic generation does not grant plan read access.

### Lifecycle / completeness

41. new plan is pending;
42. in_progress rejects missing action;
43. in_progress rejects missing how-to;
44. in_progress rejects missing responsible;
45. in_progress rejects missing due date;
46. in_progress rejects missing effectiveness criterion;
47. in_progress rejects missing expected evidence;
48. invalid monitoring date range rejected;
49. valid plan can move pending -> in_progress;
50. valid plan can move to completed;
51. completion actor/time are server-controlled;
52. overdue is computed correctly and not persisted as mutable status.

### Verification

53. non-completed plan cannot be verified;
54. `action_plan.verify` required;
55. verification requires result/date/analysis;
56. allowed effectiveness values are exact;
57. verifier/timestamp are server-controlled;
58. verification uses expected version;
59. stale verification rejected;
60. normal write cannot mutate verification fields;
61. post-verification planning mutation that invalidates verification is blocked;
62. authorized re-verification, if supported, is audited.

### Concurrency / audit log

63. stale plan update rejected;
64. two sessions do not silently overwrite;
65. manual create logs system event;
66. automatic checklist creation logs system event;
67. source activate/deactivate logs meaningful event;
68. status/update logs system event;
69. verification logs system event.

### Frontend

70. permission-aware navigation shows Planos de Ação correctly;
71. overview hides unauthorized plans;
72. overdue/open/verification-pending states render correctly;
73. manual creation honors permissions;
74. checklist source context renders;
75. inactive checklist source renders as historical/inactive;
76. verification form only appears when allowed;
77. `?inspection=<id>` filters the work queue;
78. 375px layout has no mandatory horizontal scrolling;
79. no native alert/confirm/prompt;
80. critical loading/error/conflict states are covered where practical.

## Real Supabase validation

When local Supabase/Docker is available, validate with real:

- PostgreSQL migrations from zero;
- Auth;
- JWT;
- PostgREST;
- RLS;
- global/unit/sector scope;
- manual creation;
- checklist AP/NAT synchronization;
- guessed plan ID denial;
- separate `write` vs `verify` users;
- two concurrent sessions;
- stale version rejection.

Do not claim these passed unless actually executed.

## Validation commands

Before completion:

- `npm ci`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run verify:build`

The real application bundle must still pass the CI bundle verification.

If the new module is tree-shaken out of the CI bundle, update the build verification markers appropriately without weakening secret detection.

## Migration rules

- only new incremental migrations;
- preserve all Platform Foundation and Audit migrations unchanged;
- do not rewrite shared migration history;
- no destructive Audit/Core changes;
- backfill must preserve existing Audit data;
- RLS/grants/functions/triggers must be delivered with the domain slice;
- no production migration execution.

A reasonable migration split is:

1. Action Plans domain/schema/RLS/RPCs/integration trigger;
2. deterministic backfill/hardening if separation is materially clearer.

Do not split just to create more commits.

## Git

Use focused atomic commits.

A reasonable grouping:

1. Action Plans schema/RLS/integration;
2. data access/domain lifecycle;
3. overview/detail/manual-create UI;
4. verification UI;
5. tests/hardening.

Do not force this exact split when a smaller coherent grouping is better.

Do not force-push.

## Acceptance criteria

This brief is complete when:

- `Qualidade > Planos de Ação` exists and is permission-driven;
- AP/NAT answers automatically produce one checklist-origin plan;
- source changes never delete plan history;
- manual plans can be created for authorized scope;
- unit/sector RLS is correct;
- sector-only users cannot see unit-wide plans;
- status lifecycle and overdue behavior work;
- effectiveness criterion + expected evidence are part of planning;
- completed plans can be independently verified for effectiveness;
- verification is permission-separated from ordinary writes;
- optimistic concurrency prevents silent overwrite;
- central overview is operationally useful;
- Audit can link into the central Action Plans view;
- mobile operation is usable;
- system audit events cover sensitive mutations;
- no binary evidence/storage/infrastructure work was introduced;
- all required automated and real-Supabase validations pass.

## Completion report

Return only:

1. main files changed;
2. migrations created;
3. tests/validation executed;
4. real pending issues;
5. commits.
