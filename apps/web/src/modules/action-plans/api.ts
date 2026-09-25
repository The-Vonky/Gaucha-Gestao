import type { SupabaseClient } from "@supabase/supabase-js";
import { client } from "../../core/client";
import type {
  ActionPlansDatabase,
  CreationScope,
  Effectiveness,
  Plan,
  PlanStatus,
  PlanSummary,
  PlanValues,
} from "./types";
export function db() {
  if (!client) throw new Error("Configuração de desenvolvimento indisponível.");
  return (
    client as unknown as SupabaseClient<ActionPlansDatabase, "action_plans">
  ).schema("action_plans");
}
function args(v: PlanValues) {
  return {
    p_improvement_point: v.improvement_point,
    p_action: v.action,
    p_how_to: v.how_to,
    p_responsible: v.responsible,
    p_due_date: v.due_date,
    p_effectiveness_criterion: v.effectiveness_criterion,
    p_monitoring_start: v.monitoring_start,
    p_monitoring_end: v.monitoring_end,
    p_expected_evidence: v.expected_evidence,
  };
}
export async function summaries(
  filter: { p_plan?: string; p_inspection?: string } = {},
): Promise<PlanSummary[]> {
  // Newest first and never deleted: a plan created between pages only shifts
  // earlier rows forward, so a repeated row is dropped and none is lost.
  const rows = new Map<string, PlanSummary>();
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db()
      .rpc("plan_summaries", filter)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    for (const row of data ?? [])
      if (!rows.has(row.plan.id)) rows.set(row.plan.id, row);
    if (!data || data.length < pageSize) return [...rows.values()];
  }
}
export async function plan(id: string) {
  const [row] = await summaries({ p_plan: id });
  return row ?? null;
}
export async function creationScopes(): Promise<CreationScope[]> {
  const rows: CreationScope[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db()
      .rpc("creation_scopes")
      // Display order by name, with ids making each page boundary unique.
      .order("unit_name")
      .order("unit_id")
      .order("sector_name", { nullsFirst: true })
      .order("sector_id", { nullsFirst: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}
export async function createManual(
  unit: string,
  sector: string | null,
  values: PlanValues,
) {
  const { data, error } = await db().rpc("create_manual_plan", {
    p_unit: unit,
    p_sector: sector,
    ...args(values),
  });
  if (error) throw error;
  return data;
}
export async function update(row: Plan, values: PlanValues) {
  const { error } = await db().rpc("update_plan", {
    p_id: row.id,
    p_version: row.version,
    ...args(values),
  });
  if (error) throw error;
}
export async function setStatus(row: Plan, status: PlanStatus) {
  const { error } = await db().rpc("set_plan_status", {
    p_id: row.id,
    p_version: row.version,
    p_status: status,
  });
  if (error) throw error;
}
export async function verify(
  row: Plan,
  values: { effectiveness: Effectiveness; verified_on: string; notes: string },
  /** Ids of the evidence shown as this verification's basis; the database rejects a mismatch. */
  evidenceIds: string[],
) {
  const { error } = await db().rpc("verify_plan", {
    p_id: row.id,
    p_version: row.version,
    p_effectiveness: values.effectiveness,
    p_verified_on: values.verified_on,
    p_notes: values.notes,
    p_expected_evidence_ids: evidenceIds,
  });
  if (error) throw error;
}
