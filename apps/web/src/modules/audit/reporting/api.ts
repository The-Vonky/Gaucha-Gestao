import type { SupabaseClient } from "@supabase/supabase-js";
import { client } from "../../../core/client";
import type { AuditDatabase } from "../types";
import type { HistoryReport, InspectionReport } from "./types";

function db() {
  if (!client) throw new Error("Configuração de desenvolvimento indisponível.");
  return (client as unknown as SupabaseClient<AuditDatabase, "audit">).schema("audit");
}
function validate<T extends InspectionReport | HistoryReport>(value: unknown, kind: T["kind"]): T {
  const r = value as T | null;
  if (!r || r.schema_version !== 1 || r.kind !== kind || !r.unit || !r.generated_at ||
      (kind === "inspection" && !Array.isArray((r as InspectionReport).sections)) ||
      (kind === "unit_history" && (!Array.isArray((r as HistoryReport).records) ||
       (r as HistoryReport).record_count !== (r as HistoryReport).records.length))) {
    throw new Error("Formato do relatório inesperado. Atualize a página e tente novamente.");
  }
  return r;
}
export async function inspectionExport(id: string): Promise<InspectionReport> {
  const { data, error } = await db().rpc("inspection_export", { p_inspection: id });
  if (error) throw error;
  return validate<InspectionReport>(data, "inspection");
}
export async function historyExport(unit: string, from: string | null, to: string | null): Promise<HistoryReport> {
  const { data, error } = await db().rpc("unit_history_export", { p_unit: unit, p_from: from, p_to: to });
  if (error) throw error;
  return validate<HistoryReport>(data, "unit_history");
}
