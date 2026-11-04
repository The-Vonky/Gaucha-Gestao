import { salesRpc, salesMessage } from "../api";
import { validDate } from "../format";
import type { ExportFilters, ExportMode, ExportPage, ExportRow, SalesExport } from "./types";

export class ExportError extends Error {}
const incompatible = () => new ExportError("Resposta incompatível com o contrato de exportação.");
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const uuid = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x);
const decimal = (x: unknown): x is string => typeof x === "string" && /^(0|[1-9][0-9]{0,27})\.[0-9]{2}$/.test(x);
const civil = (x: unknown) => x === null || (typeof x === "string" && validDate(x));
export function cents(value: string): bigint {
  if (!decimal(value)) throw incompatible();
  return BigInt(value.replace(".", ""));
}
export function parseExportPage(value: unknown): ExportPage {
  if (!object(value) || value.contract_version !== 1 || !["filtered", "full"].includes(String(value.mode))
    || typeof value.token !== "string" || !/^[0-9a-f]{64}$/.test(value.token)
    || !object(value.filters) || !civil(value.filters.from) || !civil(value.filters.to)
    || (value.filters.method !== null && value.filters.method !== "Stone" && value.filters.method !== "PIX")
    || typeof value.checked_at !== "string" || !Number.isFinite(Date.parse(value.checked_at))) throw incompatible();
  for (const key of ["record_count", "entry_count", "adjustment_count", "offset", "next_offset"])
    if (!Number.isInteger(value[key]) || (value[key] as number) < 0 || (value[key] as number) > 20000) throw incompatible();
  for (const key of ["entry_total", "adjustment_total", "total"]) if (!decimal(value[key])) throw incompatible();
  for (const key of ["entry_from", "entry_to", "adjustment_from", "adjustment_to"]) if (!civil(value[key])) throw incompatible();
  if (!Array.isArray(value.units) || value.units.length > 1000 || value.units.some(u => !object(u)
    || !uuid(u.id) || typeof u.name !== "string" || typeof u.code !== "string"
    || typeof u.active !== "boolean" || typeof u.adjustments_authorized !== "boolean")) throw incompatible();
  const units = new Map(value.units.map(u => [u.id, u]));
  if (units.size !== value.units.length || !Array.isArray(value.rows) || value.rows.length > 500) throw incompatible();
  for (const row of value.rows) {
    if (!object(row) || !["entry", "adjustment"].includes(String(row.kind)) || !uuid(row.id)
      || typeof row.date !== "string" || !validDate(row.date) || !uuid(row.unit_id) || !units.has(row.unit_id)
      || !["Stone", "PIX"].includes(String(row.payment_method)) || !decimal(row.amount)
      || cents(row.amount) === 0n || cents(row.amount) > 99999999999999n
      || (row.kind === "entry" && (typeof row.updated_at !== "string" || !Number.isFinite(Date.parse(row.updated_at))
        || (row.created_by_name != null && typeof row.created_by_name !== "string")
        || !Number.isInteger(row.version) || (row.version as number) < 1))
      || (row.kind === "adjustment" && (typeof row.reason !== "string" || !row.date.endsWith("-01")
        || !units.get(row.unit_id)!.adjustments_authorized))) throw incompatible();
  }
  const page = value as unknown as ExportPage;
  if (page.entry_count + page.adjustment_count !== page.record_count || page.next_offset !== page.offset + page.rows.length
    || page.next_offset > page.record_count || cents(page.entry_total) + cents(page.adjustment_total) !== cents(page.total)) throw incompatible();
  return page;
}
export async function exportPage(mode: ExportMode, filters: ExportFilters, offset = 0, token: string | null = null): Promise<ExportPage> {
  return parseExportPage(await salesRpc("sales_export_page", {
    p_mode: mode, p_from: filters.from ?? null, p_to: filters.to ?? null,
    p_units: filters.unit_ids ?? null, p_method: filters.method ?? null,
    p_offset: offset, p_limit: 500, p_token: token,
  }));
}
const order = (r: ExportRow) => `${r.kind === "entry" ? "0" : "1"}/${r.date}/${r.id}`;
/** Cancela sem reter dados nem iniciar download se a tela/identidade ficar obsoleta. */
export async function collectExport(mode: ExportMode, filters: ExportFilters, cancelled: () => boolean): Promise<SalesExport> {
  let first: ExportPage | undefined, offset = 0, previous = "";
  const rows: ExportRow[] = [], ids = new Set<string>();
  for (;;) {
    if (cancelled()) throw new ExportError("Exportação cancelada.");
    const page = await exportPage(mode, filters, offset, first?.token ?? null);
    if (cancelled()) throw new ExportError("Exportação cancelada.");
    if (page.offset !== offset || page.mode !== mode || (first && (page.token !== first.token
      || page.record_count !== first.record_count))) throw incompatible();
    first ??= page;
    for (const row of page.rows) {
      const key = order(row), id = `${row.kind}/${row.id}`;
      if (key <= previous || ids.has(id)) throw incompatible();
      previous = key; ids.add(id); rows.push(row);
    }
    offset = page.next_offset;
    if (offset === page.record_count) break;
    if (!page.rows.length) throw incompatible();
  }
  const report = { ...first, rows };
  reconcile(report);
  return report;
}
export function reconcile(report: SalesExport) {
  let entries = 0n, adjustments = 0n, entryCount = 0, adjustmentCount = 0;
  for (const row of report.rows) {
    if (row.kind === "entry") { entries += cents(row.amount); entryCount++; }
    else { adjustments += cents(row.amount); adjustmentCount++; }
  }
  if (report.rows.length !== report.record_count || entryCount !== report.entry_count || adjustmentCount !== report.adjustment_count
    || entries !== cents(report.entry_total) || adjustments !== cents(report.adjustment_total)
    || entries + adjustments !== cents(report.total)) throw new ExportError("Falha na reconciliação em centavos. Nenhum arquivo foi baixado.");
}
/** Chamar após gerar o Blob e imediatamente antes do download; reautoriza no banco. */
export async function validateExport(report: SalesExport, filters: ExportFilters) {
  const final = await exportPage(report.mode, filters, report.record_count, report.token);
  if (final.token !== report.token || final.rows.length || final.record_count !== report.record_count) throw incompatible();
}
export function exportMessage(error: unknown) {
  const code = object(error) ? error.code : "";
  if (code === "PGRST202" || code === "42883")
    return "A exportação Excel ainda não está disponível neste ambiente. Solicite ao responsável a atualização do ambiente e tente novamente após a liberação do recurso.";
  if (code === "54000") return "Limite de volume atingido (20.000 registros, 1.000 unidades ou 8 MiB de dados). Reduza o recorte. O histórico completo não foi exportado parcialmente.";
  if (code === "40001") return "Dados ou permissões mudaram durante a exportação. Tente novamente para consultar a versão atual.";
  if (code === "23514") return "Confira os filtros e a modalidade de exportação.";
  if (error instanceof ExportError) return error.message;
  return salesMessage(error);
}
