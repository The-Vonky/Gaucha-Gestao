import type { SupabaseClient } from "@supabase/supabase-js";
import { client } from "../../core/client";
import type { Response } from "./scoring";
import type {
  Answer,
  AuditDatabase,
  AuditUnit,
  InspectionSummary,
  Item,
  Section,
} from "./types";
export function db() {
  if (!client) throw new Error("Configuração de desenvolvimento indisponível.");
  return (client as unknown as SupabaseClient<AuditDatabase, "audit">).schema(
    "audit",
  );
}
function numeric(row: InspectionSummary): InspectionSummary {
  // PostgREST may serialize numeric as string.
  return {
    ...row,
    final_score: row.final_score === null ? null : Number(row.final_score),
  };
}
export async function units(): Promise<AuditUnit[]> {
  const { data, error } = await db().rpc("units");
  if (error) throw error;
  return data ?? [];
}
export async function summaries(
  args: { p_unit?: string; p_inspection?: string; p_overview?: boolean } = {},
): Promise<InspectionSummary[]> {
  const { data, error } = await db().rpc("inspection_summaries", args);
  if (error) throw error;
  return (data ?? []).map(numeric);
}
export async function inspection(id: string) {
  const [summary] = await summaries({ p_inspection: id });
  return summary ?? null;
}
export async function checklist(templateVersion: string) {
  const [sections, items] = await Promise.all([
    db()
      .from("checklist_sections")
      .select("*")
      .eq("template_version", templateVersion)
      .order("position"),
    db()
      .from("checklist_items")
      .select("*")
      .eq("template_version", templateVersion)
      .order("position"),
  ]);
  if (sections.error) throw sections.error;
  if (items.error) throw items.error;
  return {
    sections: (sections.data ?? []) as Section[],
    items: (items.data ?? []) as Item[],
  };
}
export async function answers(inspectionId: string): Promise<Answer[]> {
  const { data, error } = await db()
    .from("inspection_answers")
    .select("*")
    .eq("inspection_id", inspectionId);
  if (error) throw error;
  return data ?? [];
}
export async function answer(inspectionId: string, itemKey: string) {
  const { data, error } = await db()
    .from("inspection_answers")
    .select("*")
    .eq("inspection_id", inspectionId)
    .eq("item_key", itemKey)
    .single();
  if (error) throw error;
  return data;
}
/** Optimistic update: fails with PGRST116 when the row changed or is no longer editable. */
export async function saveAnswer(
  row: Answer,
  values: { response: Response | null; observation: string },
): Promise<Answer> {
  const { data, error } = await db()
    .from("inspection_answers")
    .update(values)
    .eq("inspection_id", row.inspection_id)
    .eq("item_key", row.item_key)
    .eq("version", row.version)
    .select()
    .single();
  if (error) throw error;
  return data;
}
export async function createInspection(
  unit: string,
  appliedOn: string,
  previousVisitOn: string | null,
) {
  const { data, error } = await db().rpc("create_inspection", {
    p_unit: unit,
    p_applied_on: appliedOn,
    p_previous_visit_on: previousVisitOn,
  });
  if (error) throw error;
  return data;
}
export async function finalize(id: string, version: number, evidenceIds: string[]) {
  const { error } = await db().rpc("finalize_inspection", {
    p_id: id,
    p_version: version,
    p_expected_evidence_ids: evidenceIds,
  });
  if (error) throw error;
}
export async function reopen(id: string, version: number) {
  const { error } = await db().rpc("reopen_inspection", {
    p_id: id,
    p_version: version,
  });
  if (error) throw error;
}
