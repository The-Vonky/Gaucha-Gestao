import type { SalesDashboard } from "./types";

const moneyFields = new Set(["stone", "pix", "total", "daily_total", "adjustment_total",
  "daily_average", "monthly_average", "projection", "reconciliation_difference",
  "current_amount", "reference_amount", "cumulative", "cumulative_stone", "cumulative_pix"]);
const nullableMoney = new Set(["daily_average", "monthly_average", "projection", "reference_amount"]);
const ratioFields = new Set(["variation_pct", "share_pct", "top_two_share_pct", "intensity",
  "stone_share_pct", "pix_share_pct", "projected_variation_pct"]);

/** Guarda de transporte: nenhuma conversão monetária para ponto flutuante. */
export function parseSalesDashboard(data: unknown): SalesDashboard {
  function fail(): never { throw new Error("Resposta analítica incompatível com o contrato de Vendas."); }
  function visit(value: unknown): void {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, field] of Object.entries(value)) {
      if (moneyFields.has(key)) {
        if (field === null && nullableMoney.has(key)) continue;
        if (typeof field !== "string" || !/^-?(0|[1-9][0-9]*)\.[0-9]{2}$/.test(field)) fail();
      } else if (ratioFields.has(key)) {
        if (field !== null && (typeof field !== "string" || !/^-?(0|[1-9][0-9]*)\.[0-9]{6}$/.test(field))) fail();
      } else visit(field);
    }
  }
  if (!data || typeof data !== "object" || !("contract_version" in data) || data.contract_version !== 1
    || !("summary" in data) || !data.summary || typeof data.summary !== "object"
    || !("total" in data.summary)
    || !["months", "units", "ranking", "unit_months"].every(key => key in data && Array.isArray(Reflect.get(data, key)))) fail();
  visit(data);
  return data as SalesDashboard;
}
