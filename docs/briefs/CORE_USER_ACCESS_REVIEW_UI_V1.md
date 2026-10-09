# Brief — User Access Review UI v1

Read AGENTS.md, docs/briefs/CORE_ADMIN_UI_WAVE3.md, docs/modules/core/ACCESS_GOVERNANCE_READ_V1.md, and existing UsersPage/UserAssignments.

Create an operator-facing read-only section/detail on UsersPage showing:
- user access summary via core.user_access_summary;
- active assignments and, on request, revoked history via core.user_access_assignments;
- profile, global/unit/sector scope, granted by/on, revocation evidence when authorized;
- composition_visibility, effective and permission keys only as granted by RPC. Show "informação restrita" for null/restricted, not "sem permissões";
- operator-friendly Portuguese and secondary technical identifiers;
- accessible loading/error/denied/empty states, responsive 375px minimum, pagination and privacy-safe errors.
Keep existing CRUD, role grants and legacy behavior untouched. Never treat an active assignment as proof of effective business permission.
Own only UsersPage.tsx and new user-access-review* files/test. No shared API/types/CSS/parts edits, no migrations.
Test user-only reader, role-only reader, restricted composition, revoked assignment, inactive user/role and pagination using mocked RPC responses; existing UI flows must not regress.
Push normal and open PR against integration/core-foundation-v2-wave2, no merge.