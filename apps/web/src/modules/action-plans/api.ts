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
function db() {
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
  const { data, error } = await db().rpc("plan_summaries", filter);
  if (error) throw error;
  return data ?? [];
}
export async function plan(id: string) {
  const [row] = await summaries({ p_plan: id });
  return row ?? null;
}
export async function creationScopes(): Promise<CreationScope[]> {
  const { data, error } = await db().rpc("creation_scopes");
  if (error) throw error;
  return data ?? [];
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
) {
  const { error } = await db().rpc("verify_plan", {
    p_id: row.id,
    p_version: row.version,
    p_effectiveness: values.effectiveness,
    p_verified_on: values.verified_on,
    p_notes: values.notes,
  });
  if (error) throw error;
}
