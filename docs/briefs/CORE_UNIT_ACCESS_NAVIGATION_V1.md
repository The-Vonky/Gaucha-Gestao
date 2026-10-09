# Core v2 — Connect Unit Access Review to Admin navigation

Status: Implementation requested; no merge or deploy approved.
Base: integration/core-foundation-v2-wave2 at 8ff39631a93ad21ab8f259e31327c15433022cb4.

## Scope
`UnitAccessReview({unitId})` already exists, is tested, and is deliberately unmounted. Make this read-only review reachable from each visible unit row on `OrganizationPage` (kind='units' only). Reuse the existing design system, `Modal` pattern and responsive conventions. No new routes unless justified. Opening and closing the review must not mutate unit data or change filters/pagination.

## Acceptance
- Visible, keyboard-accessible action "Acessos de <unit name>" for eligible unit rows; available independent of `admin.unit.manage` because read visibility and manage permissions are separate. Do not infer permission by access to unit catalog; let Core RPC/RLS make the decision and render its restricted/not-found state.
- Clicking opens read-only `UnitAccessReview unitId={row.id}` with clear unit context; on close restore focus to trigger and existing filtered/paginated list.
- `kind='sectors'` remains unchanged; unit editing, deactivation and covers unchanged.
- Unit row changing or closing must not leak prior unit data. No mutation RPC or auth/RLS changes.
- Add tests to existing admin UI suite for granted, restricted, management-denied, keyboard/close, and sector regression. Keep E2E integration test in sync if modal changes accessible selectors. Run full CI and browser integration against isolated/disposable stack; report unrun checks honestly.
- For `UnitAccessReview` pagination: review whether reading `total_count` from first returned row and converting empty pages to total zero can cause incorrect display. If confirmed, fix in the owned adapter with a focused test; do not change database security contracts.
- No shared DB reset, force push, production or main changes.

## Deliverables
Implement on this branch; normal push; PR targeting `integration/core-foundation-v2-wave2`; no merge until review. Report HEAD, touched files, checks and remaining risks.
