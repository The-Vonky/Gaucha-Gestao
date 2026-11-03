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

/** Arredondamento apenas de apresentação; o percentual exato continua no detalhe. */
export function compactPercent(value: string | null | undefined) {
  if (value == null) return "Sem comparação";
  const negative = value.startsWith("-"), [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const tenths = BigInt(whole) * 10n + BigInt((fraction + "0")[0]) + ((fraction + "00")[1] >= "5" ? 1n : 0n);
  if (tenths === 0n && /[1-9]/.test(value)) return negative ? ">-0,1%" : "<0,1%";
  return `${negative && tenths !== 0n ? "-" : ""}${tenths / 10n}${tenths % 10n ? `,${tenths % 10n}` : ""}%`;
}

const decimalFromCents = (value: bigint) => `${value < 0n ? "-" : ""}${absolute(value) / 100n}.${String(absolute(value) % 100n).padStart(2, "0")}`;
/** Rótulo abreviado de eixo, nunca substitui o valor exato em tooltip/tabela. */
export function compactMoney(value: string) {
  const amount = absolute(cents(value)), sign = value.startsWith("-") ? "−" : "";
  const units = [[100_000_000_000_000n, "tri"], [100_000_000_000n, "bi"], [100_000_000n, "mi"], [100_000n, "mil"]] as const;
  if (amount >= 100_000_000_000_000_000n) {
    const digits = (amount / 100n).toString();
    return `${sign}R$ ${digits[0]},${digits.slice(1, 3)} ×10^${digits.length - 1}`;
  }
  for (const [divisor, suffix] of units) if (amount >= divisor) {
    const rounded = (amount * 10n + divisor / 2n) / divisor;
    return `${sign}R$ ${rounded / 10n}${rounded % 10n ? `,${rounded % 10n}` : ""} ${suffix}`;
  }
  return dashboardMoney(value);
}

/** Escala monetária exclusivamente visual, inclusive sinais e headroom, sem float financeiro. */
export function chartScale(values: string[], top = 32, bottom = 258) {
  const amounts = values.map(cents);
  const lower = amounts.reduce((a, b) => b < a ? b : a, 0n);
  const upper = amounts.reduce((a, b) => b > a ? b : a, 0n);
  const span = upper - lower || 100n;
  const target = (span * 112n / 100n + 3n) / 4n || 1n;
  const power = 10n ** BigInt(Math.max(0, target.toString().length - 1));
  const step = [1n, 2n, 5n, 10n].map(v => v * power).find(v => v >= target)!;
  const min = lower < 0n ? -((-lower + step - 1n) / step) * step : 0n;
  const max = upper > 0n ? ((upper + step - 1n) / step) * step : lower === 0n ? step * 4n : 0n;
  const extent = max - min;
  const y = (value: string) => bottom - Number((cents(value) - min) * 1_000_000n / extent) / 1_000_000 * (bottom - top);
  const ticks: string[] = [];
  for (let v = min; v <= max; v += step) ticks.push(decimalFromCents(v));
  return { y, ticks };
}

/** Estável por UUID, independente da ordem, seleção e número de unidades do payload. */
export function unitColor(id: string) {
  const palette = ["var(--brand-green-700)", "var(--brand-orange-700)", "#386aaa", "#80549a", "#217a80", "#96604d", "#65752c", "#626b98"];
  let hash = 0;
  for (const char of id.toLowerCase()) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

/** Acúmulo só para coordenadas de empilhamento/eixo; não produz indicadores financeiros. */
export function stackCoordinates(values: string[]) {
  let positive = 0n, negative = 0n;
  return values.map(value => {
    const amount = cents(value), start = amount < 0n ? negative : positive;
    if (amount < 0n) negative += amount; else positive += amount;
    return { start: decimalFromCents(start), end: decimalFromCents(start + amount) };
  });
}
