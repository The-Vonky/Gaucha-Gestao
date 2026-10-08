# Brief — Unit Access Review UI v1

Read AGENTS.md, docs/briefs/CORE_ADMIN_UI_WAVE3.md, docs/modules/core/ACCESS_GOVERNANCE_READ_V1.md, and existing OrganizationPage.

Create a SELF-CONTAINED, exportable UnitAccessReview React component, ready for subsequent mounting by integration coordinator, which:
- consumes core.unit_access_summary and core.unit_access_assignments through its own unit-access-review-api.ts;
- shows unit context, user counts and assignments when allowed, global/unit/sector origins, active/revoked, readable labels and safe scoped sector filter;
- distinguishes unit visibility from authorization to list people; restricted people counts must not appear as zero;
- properly treats null/restricted permission composition, inactive users/roles and overlapping grants;
- provides pagination, loading/error/denied/empty states, responsive accessible PT-BR UI.
Important: DO NOT modify OrganizationPage.tsx, SectorUnits.tsx, shared admin api/types/admin.css, App.tsx or other owners' files. Coordinator will mount after both branches are merged. New feature-specific CSS and tests allowed.
No schema/migrations, no access expansion, no mutation. Explicitly report that unit UI is developed but not mounted until coordinator step. Test negative privacy cases.
Push normal, open PR to integration/core-foundation-v2-wave2; no merge.