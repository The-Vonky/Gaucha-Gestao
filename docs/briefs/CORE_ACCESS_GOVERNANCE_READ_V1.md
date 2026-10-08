# Implementation Brief — Core Access Governance Read v1

Status: READY FOR IMPLEMENTATION
Base: `integration/core-foundation-v2-wave2`
Target integration branch: `integration/core-foundation-v2-wave2`

## Objective

Implement read-only Core contracts that let Administration answer who has access, to what, through which profile/scope, who granted it and what users are affected by a profile or unit.

No mutation redesign and no frontend in this branch.

## Required reading

- `AGENTS.md`
- `docs/architecture/ACCESS_GOVERNANCE_V1.md`
- `docs/architecture/CORE_FOUNDATION_V2.md`
- `docs/architecture/AUTHORIZATION.md`
- `docs/architecture/SECURITY.md`
- current Core migrations and admin integration tests.

## In scope

Implement narrowly typed RPCs/read models for the approved v1 read side, including:
- user access summary;
- assignment history with role, scope, unit/sector, active/revoked state, granted_by and timestamps;
- unit access summary: users/assignments that actually cover that unit, with authorization-safe counts/details;
- profile impact: count and, when authorized, identities of users holding the role/assignments that would be affected;
- profile membership/read view suitable for future “usuários com este perfil”;
- deterministic pagination/order and explicit totals where needed.

Use the current source tables as authority. Do not create a duplicate access ledger.

## Authorization

Preserve existing admin permission semantics.

Do not infer that `admin.unit.read/manage` alone grants visibility of people. Where nominative user information requires `admin.user.read/manage`, enforce it.

A caller with only role permissions may receive only information allowed by the current role/user visibility rules.

Do not broaden existing RLS just because a report is convenient.

## Historical behavior

- revoked assignments stay visible where authorized;
- inactive users/roles/units/sectors remain representable in history;
- no cascade cleanup;
- use current names unless the event/audit contract already provides historical snapshots;
- do not fabricate old names.

## Database rules

- additive migration only;
- narrow functions/views;
- fixed search_path for SECURITY DEFINER;
- explicit grants;
- bounded pagination;
- avoid N+1 server logic;
- indexes only when justified by actual query path and tested.

## Tests

Cover:
- global user admin;
- read-only user admin;
- role-only admin;
- unit-only admin;
- unauthorized/anonymous/inactive caller;
- active vs revoked assignment;
- global/unit/sector scope;
- role inactive;
- user inactive;
- profile impact with overlapping assignments;
- no identity leakage when caller lacks user-directory authority;
- guessed IDs do not enumerate hidden data.

Run full repository validation.

## Explicitly out of scope

- changing role composition or save_role;
- confirmation-before-mutation;
- unlink mutation redesign;
- UI pages;
- CSV/XLSX export;
- logs read model;
- account lifecycle;
- Quality changes.

## Completion

Focused commits only. Do not merge. PR target: `integration/core-foundation-v2-wave2`.
