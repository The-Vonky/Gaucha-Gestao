import type { SupabaseClient } from "@supabase/supabase-js";
import { client } from "../client";
// Unit Access Review v1: read-only adapter over core.unit_access_summary and
// core.unit_access_assignments (docs/modules/core/ACCESS_GOVERNANCE_READ_V1.md). The RPCs and
// RLS decide what is visible; null figures mean "restricted/unknown", never zero.
export const UNIT_ACCESS_PAGE_SIZE = 25;
export type Visibility = "available" | "restricted";
export type LabelSource = "current" | "restricted" | null;
export type ScopeType = "global" | "unit" | "sector";
export type UnitAccessSummary = {
  unit_id: string;
  unit_code: string;
  unit_name: string;
  unit_active: boolean;
  unit_version: number;
  sector_id: string | null;
  people_visibility: Visibility;
  people_count: number | null;
  effective_people_count: number | null;
  global_assignment_count: number | null;
  unit_assignment_count: number | null;
  sector_assignment_count: number | null;
  evaluated_at: string;
};
export type UnitAccessAssignment = {
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
  scope_type: ScopeType;
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
  revocation_evidence: "audit_event" | "unavailable" | null;
  composition_visibility: Visibility;
  effective: boolean | null;
  active_permission_keys: string[] | null;
  inactive_permission_keys: string[] | null;
  total_count: number;
  people_count: number;
};
export type UnitSectorOption = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};
type UnitAccessDatabase = {
  core: {
    Tables: {
      unit_sectors: {
        Row: { unit_id: string; sector_id: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sectors: {
        Row: UnitSectorOption;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      unit_access_summary: {
        Args: { p_unit: string; p_sector?: string | null };
        Returns: UnitAccessSummary[];
      };
      unit_access_assignments: {
        Args: {
          p_unit: string;
          p_sector?: string | null;
          p_include_revoked?: boolean;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: UnitAccessAssignment[];
      };
    };
  };
};
function db() {
  if (!client) throw new Error("Configuração de desenvolvimento indisponível.");
  return (
    client as unknown as SupabaseClient<UnitAccessDatabase, "core">
  ).schema("core");
}
// PostgREST may serialize bigint as string; null stays null (restricted, not zero).
const count = (value: number | string | null) =>
  value === null ? null : Number(value);
/** Unit context and counts; null when the unit is absent or unreadable (same answer). */
export async function unitAccessSummary(
  unit: string,
  sector: string | null,
): Promise<UnitAccessSummary | null> {
  const { data, error } = await db().rpc("unit_access_summary", {
    p_unit: unit,
    p_sector: sector,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    ...row,
    people_count: count(row.people_count),
    effective_people_count: count(row.effective_people_count),
    global_assignment_count: count(row.global_assignment_count),
    unit_assignment_count: count(row.unit_assignment_count),
    sector_assignment_count: count(row.sector_assignment_count),
  };
}
export type AssignmentQuery = {
  sector: string | null;
  includeRevoked: boolean;
};
/** A page of assignments covering the unit, with totals of the whole filtered set. */
export async function unitAccessAssignments(
  unit: string,
  page: number,
  query: AssignmentQuery,
) {
  const read = async (limit: number, offset: number) => {
    const { data, error } = await db().rpc("unit_access_assignments", {
      p_unit: unit,
      p_sector: query.sector,
      p_include_revoked: query.includeRevoked,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw error;
    return data ?? [];
  };
  const rows = await read(UNIT_ACCESS_PAGE_SIZE, page * UNIT_ACCESS_PAGE_SIZE);
  // Totals travel on each row. An empty page past the first (the set shrank meanwhile) says
  // nothing about them, so they are read from the first row instead of reported as zero.
  const first = rows[0] ?? (page > 0 ? (await read(1, 0))[0] : undefined);
  return {
    rows,
    count: first ? Number(first.total_count) : 0,
    people: first ? Number(first.people_count) : 0,
  };
}
/**
 * Sectors linked to the unit, as the caller's RLS allows (unit_sectors and sectors). An empty
 * list may mean "no linked sector" or "catalog not readable"; the caller states which.
 */
export async function unitSectors(unit: string): Promise<UnitSectorOption[]> {
  const links = await db()
    .from("unit_sectors")
    .select("sector_id")
    .eq("unit_id", unit);
  if (links.error) throw links.error;
  const ids = (links.data ?? []).map((l) => l.sector_id);
  if (!ids.length) return [];
  const sectors = await db()
    .from("sectors")
    .select("id,code,name,active")
    .in("id", ids)
    .order("name")
    .order("id");
  if (sectors.error) throw sectors.error;
  return sectors.data ?? [];
}
