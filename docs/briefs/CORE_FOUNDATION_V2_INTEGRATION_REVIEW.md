# Core Foundation v2 — integration review gates (2026-10-08)

Status: REVIEW ACTIONS REQUIRED. No permission to merge to main or deploy.
Base: integration/core-foundation-v2-wave2.

## Recorded decisions for the scoped read phase

1. **Known-reference visibility (PR #25).** Resolving a unit/sector by known UUID may reveal only minimal identity fields (UUID, code, name, active) to an active caller with a CURRENT effective grant covering that organization. It must not enumerate arbitrary catalogs. This is **reference metadata visibility**, not admin-directory visibility or authorization to operate the referenced business record. Business-module operations must independently verify their permission, resource scope and domain rules. This limited policy should be explicitly tested with users holding unrelated permissions in the same organizational scope and with users holding only revoked/inactive grants. Absence and invisibility must remain indistinguishable. A profile may only be resolved through its existing RLS-authorized audience; no broad employee directory is approved.

2. **Potential vs exact role impact (PR #26).** The existing `role_impact_summary` is a *current-state snapshot of holder/assignment counts* and estimates who may be affected. It DOES NOT simulate the proposed permission delta, overlapping grants, or a future save transaction. Expose it as *potential impact* only, never exact preview or mutation confirmation. Exact preview and atomic expected-version confirmation require a separate approved mutation contract in a later wave.

3. **Existing authorization boundaries remain authoritative.** No broadening of profiles, roles, permissions or logs RLS; user nominative counts require global user audience; lack of visibility returns restricted/unknown, not zero.

## Integration order and blocking checks

- **PR #25**: require narrow metadata visibility decision and corresponding negative test coverage; confirm SECURITY DEFINER functions have fully qualified names, empty search_path, grants only where needed, and no unnecessary raw table read.
- **PR #26**: label impact *potential* and document behavior with inactive roles/users and overlapping assignments; add explicit test or contract explanation for active assignments with no effective domain permission. Confirm no interpretation of assignments as rights in all domains.
- **PR #27**: depends on #26. The governance migration and database test included in #27 are byte-for-byte identical to #26; merge #26 first, then update #27 and inspect its new PR diff to ensure only log-specific changes remain. Audit log actor text filter can only search actors readable to the caller; UI must make that limitation clear. No backfill of historical names.
- **PR #24**: ADR-007 remains PROPOSED until explicit architecture acceptance. Implementation of privileged identity API follows a separate reviewed brief; no assumption that CI success proves the future service works.

## Required checks before any further integration

1. Verify repository and PR heads immediately before merges; use expected_head_sha.
2. Check schema migration ordering, collisions, permissions, RLS, and PostgREST exposure on the **combined branch** (not only individual PR CI).
3. Run full foundation CI, reproducible infra CI, and Core reference integration test on combined HEAD.
4. Re-run negative permission tests: anon, inactive, role-only, unit-only, user-only, cross-scope, guessed UUID and revoked grants.
5. Keep SQL migrations immutable once integrated. New corrections must be additive.
6. No production migration, deploy, release, force push, or main merge in this review.

## Deliverables

For each PR agent: submit exact new HEAD, changed files, tests, unresolved risks and target branch. Coordinator reviews before merging into integration.
