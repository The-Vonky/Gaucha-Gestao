# Core Administration UI Wave 3 — implementation coordination

Status: READY FOR DEVELOPMENT, no deploy/merge to main.
Base: integration/core-foundation-v2-wave2, Core contracts through merge 941beda77031e1e8f8a63af15996b2036855c8c4.

## Outcome
Deliver three operator-facing read-only views using integrated Core RPCs; do not redesign RBAC or invent permissions.

## Concurrent ownership / no overlap
- A (User Access): owns `UsersPage.tsx`, NEW `UserAccessReview.tsx`, `user-access-review-api.ts`, `user-access-review.css`, `tests/user-access-review.test.tsx`. Do not touch `UserAssignments.tsx`.
- B (Unit Access): owns NEW `UnitAccessReview.tsx`, `unit-access-review-api.ts`, `unit-access-review.css`, `tests/unit-access-review.test.tsx`. Do NOT touch `OrganizationPage.tsx` or `SectorUnits.tsx` in parallel. Integration coordinator will mount this component after merging.
- C (Readable Logs): owns `LogsPage.tsx`, NEW `audit-log-review-api.ts`, `audit-log-review.css`, `tests/audit-log-review.test.tsx`. Do not touch the shared admin API/types files.

Cross-cutting: NO edits to `apps/web/src/core/admin/api.ts`, `apps/web/src/core/types.ts`, `apps/web/src/core/admin/admin.css`, `apps/web/src/core/admin/parts.tsx`, `apps/web/src/app/App.tsx`, `apps/web/src/shared/**` or shared tests (`tests/admin.test.tsx`, `tests/admin-api.test.ts`) without explicit handoff. New page-specific types and RPC wrappers live in each feature's own adapter; reuse current client and UI kit.

## Security
Read-only UI; RPCs/RLS remain authoritative. Never use service role, never bypass permissions, never expand user listing. Render restricted/unknown, not zero or empty when access is limited. Responsibility, membership and effective capabilities differ. Historic references remain readable only when authorized. Technical UUID/JSON secondary; no business mutation or account lifecycle.

## UX
Follow design system Elo. Portuguese Brazilian plain language. Responsive 375/768/1024/1440px, accessible buttons and labels, loading/empty/denied/error states, stable pagination and filters. Avoid unnecessary abstract UI scaffolding.

## CI + acceptance
Per branch: relevant component tests, typecheck, lint, full npm test (bounded workers where necessary), build, verify:build, audit. Browser/integration if actual disposable stack is available; report blockers rather than pretending checks ran. Normal push and PR to same integration branch, no force/no merge.
Before any UI PR merge, coordinator reviews file collisions and checks combined CI.
