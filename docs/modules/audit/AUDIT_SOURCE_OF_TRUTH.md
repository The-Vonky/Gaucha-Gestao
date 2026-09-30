# Audit Module — Source of Truth

Status: authoritative functional baseline for platform planning  
Last reviewed: 2026-09-24

## Platform status clarification — 2026-09-30

The legacy comparisons below remain pinned to Controle_Auditoria `b916ba8`; they are not claims about current Gaúcha Gestão. Historical platform snapshot `3f158d3` implemented reopen, generalized Action Plans and Action Plan Evidence; at that snapshot, Checklist Evidence and Audit exports were not yet implemented. That statement is superseded for current state: `main` at `fdae41a51af284358aa9dc7804ba03f75f241ac6` includes Audit Export & Reporting (PR #9), Checklist Evidence (PR #11) and the unit-history pagination fix that removes silent Data API truncation above 1.000 rows (PR #13). See [Quality completion matrix](QUALITY_COMPLETION_V1.md).

Reopen and the permission/scope model are resolved by Audit Domain v1 and ADR-005. Product approved all three reporting outputs—inspection Excel, unit-history Excel and print/PDF—implemented under [Audit Export & Reporting v1](../../briefs/AUDIT_EXPORT_REPORTING_V1.md). Checklist attachments are implemented under [Audit Checklist Evidence v1](../../briefs/AUDIT_CHECKLIST_EVIDENCE_V1.md), with the current implementation contract in [CHECKLIST_EVIDENCE_V1.md](CHECKLIST_EVIDENCE_V1.md). Portable archives and Realtime are outside this completion v1; retention remains an operational/business decision. Do not reopen these accepted platform decisions based on the historical planning list below.

## Purpose

This document defines what the Gaúcha Gestão Audit module must preserve from the demonstrated standalone system, what already exists in the current online v3 implementation, and which post-demonstration requirements are still pending.

It is intentionally independent from the final platform technology stack.

## Source lineage

### 1. Demonstrated standalone baseline — v2.9.1

Artifact supplied for this planning cycle:

`Checklist_Qualidade_v2.9.1_Gaucha.zip`

SHA-256:

`f313031f040de917a37fd3f21fd719225ed94196dd23aa22c099f0a02798604e`

Main HTML SHA-256:

`9414af8fbbdb23e3a1b37d77e66291630f55ddad23cd9f88b1507cc47dcaf8d4`

Technical documentation SHA-256:

`22fcc3b0c3796b5895a81cf21cb6f623604959ea4f83d13d15d4adacd5942506`

This is the final offline version that was presented before the subsequent requests discussed with the responsible users.

It is a functional/UX reference, not the architecture to copy.

### 2. Current online implementation — Controle_Auditoria

Repository:

`The-Vonky/Controle_Auditoria`

Current reviewed main commit:

`b916ba86a1a517fb316a3c1160cd7373dd225c89`

The online version already moves the domain to:
- React + Vite + TypeScript;
- Supabase Auth/PostgreSQL/Realtime;
- RLS;
- optimistic concurrency using `version`;
- central/shared data instead of browser-local truth;
- Cloudflare R2 for media through an authenticated gateway.

This implementation is a valuable migration source but does not dictate the final Gaúcha Gestão stack.

### 3. Post-demonstration Action Plan requirements

Current brief:

`Controle_Auditoria/docs/IMPLEMENTATION_BRIEF_ACTION_PLANS_V3.md`

At the reviewed main commit, this brief is documented but its generalized model is not yet implemented in the code/schema.

The platform must therefore distinguish:
- functionality already implemented online;
- requirements approved in the brief but still pending.

## Checklist invariant

The official checklist template contains:
- 9 sections;
- 158 items;
- stable technical IDs in the form `item-NNN`;
- displayed numbering through 161;
- intentionally absent displayed numbers: 32, 117 and 135.

The template identifier in the standalone baseline is:

`checklist-geral-2026-09-22-v1`

The current online repository uses the same template identifier and item model.

The checklist content is domain data and must be versioned deliberately. It must not be silently edited because of UI or platform migrations.

## Answer statuses

Supported states:

- `AT` — Atende;
- `AP` — Atende parcialmente;
- `NAT` — Não atende;
- `NAP` — Não se aplica;
- unanswered/null.

These meanings are domain invariants.

## Conformity calculation

Final business rule:

```text
Conformity = (AT + 0.5 * AP) / (158 - NAP)
```

For an in-progress inspection, the UI may display a partial conformity using only applicable answered items:

```text
Partial conformity = (AT + 0.5 * AP) / (AT + AP + NAT)
```

The UI must clearly distinguish partial progress from a final classification.

Final bands:

- 76%–100%: Adequada;
- 51%–75.99%: Adequada parcialmente / requires analysis;
- 0%–50.99%: Inadequada / requires intervention.

`NAP` is neutral and does not reduce the score.

## Inspection lifecycle

Required behavior already established by the baseline:

- an inspection belongs to one organizational unit;
- it has responsible person and application date;
- the checklist must have 158 persisted answer slots;
- finalization is allowed only when all 158 items have a response;
- after finalization, checklist responses/observations/evidence changes are blocked;
- Action Plans remain followable after inspection finalization.

The standalone v2.9.1 supports explicit reopening for correction.

The reviewed online v3 implementation contains finalization but no reopening flow was found. Reopening is therefore a migration decision that must be explicitly resolved before Audit is declared functionally complete in Gaúcha Gestão.

## Unit experience

Validated/desired UX concepts worth preserving:

- overview by unit;
- cover/banner for a unit;
- latest conformity and inspection history;
- unit detail/hero;
- entry into inspection from the unit context;
- responsive desktop/mobile behavior;
- screen starts at the top when entering a unit;
- menus/modals must not render behind other content;
- native browser `alert()`, `confirm()` and `prompt()` are not acceptable;
- mobile keyboard must not be forced open before explicit field interaction.

### Platform adaptation

The Audit module must not own the canonical unit lifecycle.

In Gaúcha Gestão:
- `Unit` is a Core entity shared by Audit, Fleet, ABC, Satisfaction, PxR and other modules;
- Audit references `unit_id`;
- unit administration belongs under platform Administration/Core;
- Audit may present unit-specific quality views but must not create a private unit source of truth.

The current online behavior that deletes a unit and cascades Audit records/media must **not** be copied into the integrated platform. Unit deactivation/deletion requires platform-wide referential and retention rules.

## Checklist evidence

The standalone baseline supports checklist images and the online implementation supports image/document attachments.

Platform rule:
- binary files live in the approved storage layer, not as arbitrary database blobs;
- metadata is persisted and authorized;
- download/open/delete require permission and scope checks;
- file behavior must survive backup/restore.

Exact storage provider is a platform infrastructure decision, not an Audit invariant.

## Action Plans — current behavior

Both the demonstrated baseline and current online implementation establish that:
- `AP` creates/requires follow-up;
- `NAT` creates/requires follow-up;
- `AT` and `NAP` do not create a new corrective-action requirement;
- duplicate Action Plans for the same checklist item/inspection are not acceptable.

The current online implementation already has:
- action text;
- responsible;
- due date;
- status;
- effectiveness result;
- verification date;
- verification notes;
- attachments/evidence.

## Action Plans — approved pending evolution

The post-demonstration brief adds/generalizes:

- `unit_id`;
- optional `sector_id`;
- `source_type`;
- optional `source_id`;
- optional `inspection_id`;
- optional `item_id`;
- improvement point/problem;
- action;
- how to execute;
- responsible;
- due date;
- status;
- effectiveness criterion;
- monitoring start/end;
- expected evidence;
- effectiveness result;
- verification date;
- verification analysis;
- real attached evidence;
- creation/update/version metadata.

Initial functional source types:
- `checklist`;
- `manual`.

Future source types mentioned by the approved brief:
- `occurrence`;
- `non_conformity`;
- `meeting`.

Those future business modules are not authorized merely because the source types exist.

## Effectiveness lifecycle

The target flow is:

```text
PROBLEM
-> ACTION
-> HOW TO EXECUTE
-> RESPONSIBLE + DEADLINE
-> EFFECTIVENESS CRITERION
-> MONITORING PERIOD
-> EXPECTED EVIDENCE
-> EXECUTION
-> ATTACHED EVIDENCE
-> VERIFICATION
-> EFFECTIVENESS RESULT
```

Important distinction:
- expected evidence = planned textual requirement;
- attached evidence = actual files/records provided after/during execution.

## Export/reporting

The demonstrated standalone baseline provides:
- inspection Excel;
- unit-history Excel;
- browser print/PDF.

The current online v3 provides inspection Excel.

For the integrated platform, exports are product behavior to assess/preserve, but export implementation must respect the same permission and organizational scope as on-screen data.

Unit-history export from v2.9.1 is not present in the reviewed online v3 repository and must be explicitly included or consciously dropped in the Audit migration brief.

## Backup and recovery

Standalone v2.9.1:
- local browser persistence;
- IndexedDB media;
- manual ZIP backup with manifest and binary media;
- local recovery snapshots.

These are necessary because the standalone application has no central backend.

Gaúcha Gestão must not reproduce browser backup as its primary durability strategy.

Platform replacement:
- centralized database backup;
- file/object-storage backup;
- restore procedure;
- tested disaster recovery;
- versioned application/migrations.

A user-facing export/portable archive may still be useful, but it is separate from infrastructure backup.

## Identity and authorization

The online Audit repository currently uses fixed roles:
- `admin`;
- `qualidade`;
- `gestor`;
- `viewer`.

These role checks must not be copied as the platform authorization model.

Gaúcha Gestão uses permissions + organizational scope. Audit-specific permissions will be introduced incrementally, for example capabilities for:
- read inspections;
- create inspections;
- answer/edit checklist;
- finalize/reopen;
- manage Action Plans;
- verify effectiveness;
- export.

Exact permission identifiers belong in the foundation/module implementation brief.

## Audit-owned domain

Audit should own:
- checklist template/version semantics;
- inspections;
- inspection answers;
- Audit-specific observations;
- conformity calculation/classification;
- inspection lifecycle;
- relationships from an inspection/item to corrective action requests.

Audit should not own:
- platform users;
- platform roles/permissions;
- canonical units;
- canonical sectors;
- platform system audit log;
- infrastructure backup;
- global navigation/app shell.

## Functional regression baseline

At minimum, automated tests for the platform Audit module must cover:

1. 9 sections / 158 items and stable IDs.
2. Missing display numbers 32, 117 and 135.
3. 158 AT => 100%.
4. 79 AT + 79 NAT => 50%.
5. NAP excluded from denominator.
6. no answered applicable items => conformity undefined, not 0%.
7. incomplete inspection cannot finalize.
8. finalization locks checklist mutation.
9. AP creates/ensures one checklist Action Plan.
10. NAT creates/ensures one checklist Action Plan.
11. AT/NAP do not create new Action Plan requirements.
12. concurrent updates cannot silently overwrite newer checklist state.
13. attachment access obeys authorization/scope.
14. exported data matches the inspection and user scope.

Reopening, history export and generalized manual Action Plans require acceptance tests once their platform behavior is finalized.

## Explicit non-goal

Do not copy the v2.9.1 single-file HTML architecture into Gaúcha Gestão.

The baseline is the behavioral oracle. The integrated platform receives a new implementation under the platform architecture.

