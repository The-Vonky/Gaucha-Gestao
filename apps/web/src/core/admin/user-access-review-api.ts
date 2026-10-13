import { database } from "../client";
// Read-only adapter for the Access Governance Read v1 user contracts
// (docs/modules/core/ACCESS_GOVERNANCE_READ_V1.md). The RPCs and RLS decide what
// is returned; nothing here widens or infers access.
export const REVIEW_PAGE_SIZE = 10;
/** core.user_access_summary: no row when the caller lacks the user audience or the user is unreadable. */
export type UserAccessSummary = {
  user_id: string;
  display_name: string;
  user_active: boolean;
  user_version: number;
  active_assignment_count: number;
  revoked_assignment_count: number;
  /** null when part of the composition is restricted: unknown, never zero. */
  effective_assignment_count: number | null;
  composition_coverage: "complete" | "partial" | "restricted";
  evaluated_at: string;
};
type LabelSource = "current" | "restricted" | null;
/** core.access_assignment_row, one per assignment. */
export type AccessAssignment = {
  assignment_id: string;
  assignment_version: number;
  assignment_active: boolean;
  user_id: string;
  user_display_name: string;
  user_active: boolean;
  role_id: string;
  role_key: string;
  role_name: string;
  role_active: boolean;
  role_system: boolean;
  scope_type: "global" | "unit" | "sector";
  unit_id: string | null;
  unit_code: string | null;
  unit_name: string | null;
  unit_active: boolean | null;
  unit_label_source: LabelSource;
  sector_id: string | null;
  sector_code: string | null;
  sector_name: string | null;
  sector_active: boolean | null;
  sector_label_source: LabelSource;
  granted_by: string | null;
  granted_by_name: string | null;
  granted_at: string;
  updated_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revoked_by_name: string | null;
  /** null while active; "unavailable" when the revoke event is not readable by the caller. */
  revocation_evidence: "audit_event" | "unavailable" | null;
  composition_visibility: "available" | "restricted";
  /** null when the composition is restricted. */
  effective: boolean | null;
  active_permission_keys: string[] | null;
  inactive_permission_keys: string[] | null;
  total_count: number;
  people_count: number;
};
// These RPCs are not part of the shared generated Database type, which this
// feature does not own; the call is typed locally instead.
type Rpc = {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};
async function call<T>(fn: string, args: Record<string, unknown>) {
  const { data, error } = await (database() as unknown as Rpc).rpc(fn, args);
  if (error) throw error;
  return (data ?? []) as T[];
}
// bigint columns may arrive as strings.
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
/** The user's access summary, or null when it is denied or the user is not readable. */
export async function userAccessSummary(
  user: string,
): Promise<UserAccessSummary | null> {
  const [row] = await call<UserAccessSummary>("user_access_summary", {
    p_user: user,
  });
  if (!row) return null;
  return {
    ...row,
    active_assignment_count: Number(row.active_assignment_count),
    revoked_assignment_count: Number(row.revoked_assignment_count),
    effective_assignment_count: num(row.effective_assignment_count),
  };
}
/** A page of the user's assignments (active first, newest first), revoked ones on request. */
export async function userAccessAssignments(
  user: string,
  includeRevoked: boolean,
  page: number,
) {
  const rows = await call<AccessAssignment>("user_access_assignments", {
    p_user: user,
    p_include_revoked: includeRevoked,
    p_limit: REVIEW_PAGE_SIZE,
    p_offset: page * REVIEW_PAGE_SIZE,
  });
  return { rows, count: rows.length ? Number(rows[0].total_count) : 0 };
}
