# Implementation Brief — Core Admin Quick Wins v1

Status: READY FOR IMPLEMENTATION
Base: `d2e30774eb7ab354f13edc7968a5b47f1d2a0891`
Target integration branch: `integration/core-foundation-v2`

## Objective

Apply only low-risk Core/Admin improvements already identified during manual review, without redesigning account lifecycle, RBAC, logging contracts or business modules.

## In scope

1. Unit/Sector search must match business code as well as name.
2. Reduce technical noise in day-to-day Administration screens:
   - do not lead with UUIDs/technical keys when they are not needed for the task;
   - retain identifiers where useful for diagnostics/details.
3. Replace product copy that mentions implementation jargon such as “Auth” with administrator-facing language.
4. Remove the unused `role_permissions` fetch/value from `UserAssignments` if it is truly unused.
5. Make the ambiguous stale/authorization client error more honest if this can be done without pretending to know which cause occurred. Do not invent a precise authorization diagnosis from `PGRST116`.

## Explicitly out of scope

- user creation;
- password reset;
- My Account;
- MFA;
- new access-review queries/reports;
- unit dossier;
- log actor directory;
- role-impact queries;
- new migrations/RPCs/policies;
- Quality/Audit/Action Plans behavior;
- production deployment.

## Security / compatibility

Do not weaken RLS or change existing permission semantics.
Do not expose service credentials.
Do not change database schema.
Keep current pagination, optimistic-version behavior and active/inactive semantics.

## Validation

Run at minimum:
- typecheck;
- lint;
- unit/UI tests affected;
- full `npm test`;
- build;
- existing Admin integration when practical.

Add focused tests for code-or-name search and any changed copy/error mapping.

## Completion

Commit focused changes only. Do not merge. Open a PR targeting `integration/core-foundation-v2` only after validation.
