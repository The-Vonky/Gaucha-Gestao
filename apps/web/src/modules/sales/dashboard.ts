import { money, today, validDate } from "./format";
import type { DashboardFilters, SalesMonth } from "./types";

export type DashboardSelection = { from: string; to: string; unit: string; scope: "stone" | "combined";
  daily: string; day: string; baseFrom: string; baseTo: string };
export function defaultSelection(): DashboardSelection {
  const month = today().slice(0, 7);
  return { from: `${month.slice(0, 4)}-01`, to: month, unit: "", scope: "stone", daily: "", day: "",
    baseFrom: `${month.slice(0, 4)}-01`, baseTo: month };
}
export function readSelection(params: URLSearchParams): DashboardSelection {
  const defaults = defaultSelection();
  defaults.baseFrom = params.get("from") ?? defaults.from;
  defaults.baseTo = params.get("to") ?? defaults.to;
  return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, params.get(key) ?? value])) as DashboardSelection;
}
const monthValid = (v: string) => /^\d{4}-\d{2}$/.test(v) && validDate(`${v}-01`);
const monthIndex = (v: string) => Number(v.slice(0, 4)) * 12 + Number(v.slice(5, 7));
export function selectionError(s: DashboardSelection): string {
  if (![s.from, s.to, s.baseFrom, s.baseTo].every(monthValid) || s.from > s.to || s.baseFrom > s.baseTo)
    return "Informe competências válidas e uma janela em ordem crescente.";
  if (monthIndex(s.to) - monthIndex(s.from) >= 24 || monthIndex(s.baseTo) - monthIndex(s.baseFrom) >= 24)
    return "Selecione até 24 competências calendárias, incluindo as lacunas.";
  if (s.daily && (!monthValid(s.daily) || s.daily < s.from || s.daily > s.to))
    return "A competência diária deve pertencer ao período selecionado.";
  if (s.scope !== "stone" && s.scope !== "combined") return "Selecione Stone ou Stone + PIX.";
  if (s.unit && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.unit))
    return "Unidade indisponível para este acesso. Confira o recorte da URL.";
  if (s.day && (!s.daily || !/^([1-9]|[12][0-9]|3[01])$/.test(s.day)
    || !validDate(`${s.daily}-${s.day.padStart(2, "0")}`))) return "Dia de foco incompatível com a competência diária.";
  return "";
}
export function dashboardFilters(s: DashboardSelection): DashboardFilters {
  return { from: `${s.from}-01`, to: `${s.to}-01`, scope: s.scope,
    ...(s.unit ? { unit_ids: [s.unit] } : {}), ...(s.daily ? { daily_month: `${s.daily}-01` } : {}) };
}
export function selectionParams(s: DashboardSelection) {
  return new URLSearchParams(Object.entries(s).filter(([, value]) => value !== ""));
}
export const competency = (v: string | null | undefined) => v ? `${v.slice(5, 7)}/${v.slice(0, 4)}` : "Indisponível";
/** Mantém inclusive centavos além de MAX_SAFE_INTEGER; sinal não passa por float. */
export const dashboardMoney = (v: string | null | undefined) => v == null ? "Indisponível" : v.startsWith("-") ? `−${money(v.slice(1))}` : money(v);
export const percent = (v: string | null | undefined) => v == null ? "Sem comparação" : `${v.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "").replace(".", ",")}%`;
export function monthStatus(m: SalesMonth) {
  if (m.status_basis === "historical_unavailable" || m.partial === null)
    return "Status histórico indisponível para este acesso";
  const basis = m.status_basis === "derived" ? " · derivado" : m.status_basis === "scoped_dates" ? " · datas do recorte" : "";
  if (m.partial) return `Parcial até dia ${m.last_day_with_data}${basis}`;
  return `${m.is_closed ? "Fechado confirmado" : "Completo sem fechamento confirmado"}${basis}`;
}
export function comparisonLabel(m: SalesMonth | null) {
  if (!m?.comparison.reference_month) return "Sem competência anterior disponível";
  return `Referência ${competency(m.comparison.reference_month)}${m.comparison.cutoff_day !== null ? ` · corte até dia ${m.comparison.cutoff_day}` : ""}`;
}

const cents = (v: string) => BigInt(v.replace(".", ""));
const absolute = (v: bigint) => v < 0n ? -v : v;
/** Somente geometria. BigInt limita a razão antes de Number; nunca produz total/rótulo financeiro.
 * Resolução visual 1 ppm, segura mesmo para strings que excederiam Number.MAX_VALUE. */
export function visualRatio(value: string, maximum: string): number {
  const max = absolute(cents(maximum));
  return max === 0n ? 0 : Number(cents(value) * 1_000_000n / max) / 1_000_000;
}
export function visualMaximum(values: string[]) {
  return values.reduce((max, value) => absolute(cents(value)) > absolute(cents(max)) ? value : max, "0.00");
}
/** Intensidade já calculada no SQL; não recalcula escala financeira do heatmap. */
export const intensity = (v: string) => Math.max(0, Math.min(1, Number(v)));
