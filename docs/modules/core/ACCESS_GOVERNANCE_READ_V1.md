# Access Governance Read v1 — read contracts

Status: implemented on `feat/core-access-governance-read-v1` (PR #26, target `integration/core-foundation-v2-wave2`). Read-only; no UI, export, logs read model or mutation change. Not production ready.

Brief: `docs/briefs/CORE_ACCESS_GOVERNANCE_READ_V1.md`. Design: `docs/architecture/ACCESS_GOVERNANCE_V1.md`. Integration gate: `docs/briefs/CORE_FOUNDATION_V2_INTEGRATION_REVIEW.md` (decision 2).

## Contracts (migration `20261008130000_core_access_governance_read_v1.sql`)

All functions are `SECURITY INVOKER`, `STABLE`, `search_path=''`, executable by `authenticated` only. Every join stays under the existing RLS of `profiles`, `user_role_assignments`, `roles`, `role_permissions`, `permissions`, `units`, `sectors`, `unit_sectors` and `system_audit_log`; no policy is broadened. Lists use `p_limit` 1–100 (`22023` otherwise), `p_offset ≥ 0`, a deterministic order and `total_count`/`people_count` for the whole filtered set.

| RPC | Question | Gate |
| --- | --- | --- |
| `user_access_summary(user)` | Assignment counts, effective assignment count, composition coverage | U |
| `user_access_assignments(user, include_revoked, limit, offset)` | Assignment history with role, scope, unit/sector, grantor, timestamps, revocation evidence | U |
| `unit_access_summary(unit, sector?)` | People/assignments covering the unit | T; people and counts only with U |
| `unit_access_assignments(unit, sector?, include_revoked, limit, offset)` | Global, unit and (matching) sector assignments covering the unit | U + T |
| `role_impact_summary(role)` | **Potential** impact of changing the role | U or R; holder figures only with U + R |
| `role_holders(role, include_revoked, limit, offset)` | Users holding the role | U + R |

U = global `admin.user.read`/`admin.user.manage`. R = global `admin.role.read`/`admin.role.manage`. T = the unit is readable under `units_read`. `admin.unit.read/manage` alone never yields people or counts. A sector filter requires the unit–sector link to be readable. An absent ID and an unreadable ID both return no rows.

## Interpretation rules

- **An active assignment is not usable access.** `effective` (per assignment) is true only when the assignment, the user and the role are active and the role holds at least one active permission. It then covers only those keys at that assignment's scope: never other domains or scopes, and never a specific business record, whose module rules still apply. Unit/sector activity is reported separately; the Core helpers do not evaluate it.
- **Restricted is not zero.** Without the needed audience a figure is `null` and the section says `restricted` (`composition_visibility`, `holders_visibility`, `people_visibility`) or `composition_coverage` is `partial`/`restricted`. `effective_people_count` is `null` without R or `admin.user.manage`.
- **Keys keep their scope.** Permission keys are returned per assignment only; no flat union per user.
- **History.** Revoked assignments stay listed (`include_revoked`). Grant evidence is the assignment row (`granted_by`, `created_at`). Revocation actor/time come only from a revoke event the caller may read under `logs_read` (`revocation_evidence='audit_event'`); otherwise `unavailable`. Never inferred from `updated_at`. Names are current names (`*_label_source='current'` or `restricted`); no historical name is reconstructed.

## Role impact is potential, not exact

`role_impact_summary` returns `impact_kind='potential'` and `overlap_evaluated=false`. It is a current-state snapshot of who holds the role. It does **not** simulate a proposed permission delta, evaluate overlapping grants or the residual coverage of other roles, or validate a future save, and it must not be presented as an exact preview or mutation confirmation. That requires a separate approved mutation contract.

| Field | Meaning |
| --- | --- |
| `role_grants_capabilities` | Role active and with ≥ 1 active permission; `false` for an inactive role; `null` if composition is unreadable |
| `holder_count` | Distinct users with an active assignment; overlapping assignments of one user count once |
| `inactive_user_holder_count` | Holders whose user is inactive (the assignment grants them nothing) |
| `potentially_affected_user_count` | Active users with an active assignment: their access may change if the role's composition or activation changes |
| `currently_effective_user_count` | Of those, users who derive at least one capability from this role now; `0` for an inactive or permission-less role |
| `holders_with_other_roles_count` | Potentially affected users who also hold another active role and *may* keep equivalent capabilities through it (not evaluated per permission) |
| `active_assignment_count` / `revoked_assignment_count` | Assignments, not people |

An inactive role keeps its active assignments: `currently_effective_user_count=0`, while `potentially_affected_user_count` shows who a reactivation could affect. A deactivated user's assignments are revoked by the existing trigger, so they count as revoked assignments, not as holders.

## Tests

`tests/access-governance-database.test.ts` (PGlite, real grants/RLS) covers:
- callers: global and read-only user admins, role-only, unit-only, user + unit without composition, anonymous, unassigned and inactive;
- scopes: global, unit and sector coverage;
- assignment states: revoked assignments with and without log access, inactive users and roles, a permission-less role;
- overlapping assignments and partial composition;
- leakage and enumeration: no identity leak to callers without user permissions, guessed IDs;
- pagination bounds and determinism, read-only behaviour, and the revoke-lookup index.
