import type { SupabaseClient } from "@supabase/supabase-js";
import { client } from "../../core/client";
import { parseSalesDashboard } from "./analytics";
import { message } from "../../shared/errors";
import type { DashboardFilters, EntryFilters, EntryInput, SalesDashboard, SalesEntry, SalesUnit } from "./types";

/** Validação de transporte; a autorização e as regras definitivas ficam no SQL. */
function amount(value: unknown): string {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$/.test(value)
    || /^0(\.0{1,2})?$/.test(value)) {
    throw new Error("Informe valor decimal positivo com até duas casas.");
  }
  return value;
}

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (!client) throw new Error("Ambiente indisponível.");
  const { data, error } = await (client as unknown as SupabaseClient)
    .schema("public").rpc(name, args);
  if (error) throw error;
  return data;
}

function entry(data: unknown): SalesEntry {
  if (!data || typeof data !== "object" || !("amount" in data)
    || typeof data.amount !== "string" || !/^(0|[1-9][0-9]{0,11})\.[0-9]{2}$/.test(data.amount)) {
    throw new Error("Resposta monetária incompatível com o contrato de Vendas.");
  }
  return data as SalesEntry;
}

function inputArgs(input: EntryInput) {
  return { p_date: input.sale_date, p_unit: input.unit_id,
    p_method: input.payment_method, p_amount: amount(input.amount) };
}

export async function listEntries(filters: EntryFilters = {}): Promise<SalesEntry[]> {
  const data = await rpc("sales_entries_list", {
    p_from: filters.from ?? null, p_to: filters.to ?? null,
    p_unit: filters.unit_id ?? null, p_method: filters.payment_method ?? null,
    p_limit: filters.limit ?? 50, p_offset: filters.offset ?? 0,
  });
  if (!Array.isArray(data)) throw new Error("Listagem incompatível com o contrato de Vendas.");
  return data.map(entry);
}

export async function entryDetail(id: string): Promise<SalesEntry> {
  return entry(await rpc("sales_entry_detail", { p_id: id }));
}

export async function createEntry(input: EntryInput): Promise<SalesEntry> {
  return entry(await rpc("sales_entry_create", inputArgs(input)));
}

export async function updateEntry(id: string, expectedVersion: number, input: EntryInput): Promise<SalesEntry> {
  return entry(await rpc("sales_entry_update", {
    p_id: id, p_expected_version: expectedVersion, ...inputArgs(input),
  }));
}

export async function deleteEntry(id: string, expectedVersion: number): Promise<SalesEntry> {
  return entry(await rpc("sales_entry_delete", { p_id: id, p_expected_version: expectedVersion }));
}

export function salesMessage(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code === "23505") return "Já existe lançamento ativo para esta data, unidade e forma de pagamento.";
  if (code === "40001") return "O lançamento mudou. Consulte a versão atual antes de confirmar outra alteração.";
  if (["PGRST301", "PGRST302", "PGRST303"].includes(code)) return "Sua sessão expirou. Entre novamente para continuar.";
  if (code === "P0002") return "Lançamento indisponível. Atualize a consulta e confira seu acesso.";
  if (["23514", "22007", "22008", "22P02"].includes(code))
    return "Confira a data, a unidade, a forma de pagamento e o valor decimal com até duas casas.";
  return message(error);
}

/** Catálogo operacional autorizado; nunca usa admin.unit.read ou sales.dashboard.read. */
export async function listSalesUnits(): Promise<SalesUnit[]> {
  const units: SalesUnit[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await rpc("sales_operation_units", { p_limit: 100, p_offset: offset });
    if (!Array.isArray(page) || page.some(u => !u || typeof u.id !== "string"
      || typeof u.code !== "string" || typeof u.name !== "string"
      || [u.active, u.can_read, u.can_create, u.can_edit, u.can_delete].some(v => typeof v !== "boolean")))
      throw new Error("Catálogo operacional incompatível.");
    units.push(...page);
    if (page.length < 100) return units;
  }
}

/** Read-model único; limites e escopos são verificados novamente no banco. */
export async function salesDashboard(filters: DashboardFilters): Promise<SalesDashboard> {
  return parseSalesDashboard(await rpc("sales_dashboard", {
    p_from: filters.from, p_to: filters.to, p_units: filters.unit_ids ?? null,
    p_scope: filters.scope ?? "stone", p_daily_month: filters.daily_month ?? null,
  }));
}
