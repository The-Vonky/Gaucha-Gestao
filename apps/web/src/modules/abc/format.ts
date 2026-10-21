import { add, cmp } from "./import/decimal";

/** Display rounding ROUND_HALF_UP on canonical decimal strings, pt-BR separators. */
export function round(value: string, places: number): string {
  const negative = value.startsWith("-");
  const [int, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  if (fraction.length <= places) return value;
  let kept = `${int}${places ? "." + fraction.slice(0, places) : ""}`;
  if (Number(fraction[places]) >= 5) kept = add(kept, places ? `0.${"0".repeat(places - 1)}1` : "1");
  return negative && cmp(kept, "0") !== 0 ? `-${kept}` : kept;
}

export function formatDecimal(value: string | null, places: number): string {
  if (value === null) return "—";
  const r = round(value, places);
  const negative = r.startsWith("-");
  const [int, fraction = ""] = (negative ? r.slice(1) : r).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const padded = places ? `,${fraction.padEnd(places, "0")}` : "";
  return `${negative ? "−" : ""}${grouped}${padded}`;
}

export const money = (value: string | null) => (value === null ? "—" : `R$ ${formatDecimal(value, 2)}`);
export const percent = (value: string | null) => (value === null ? "—" : `${formatDecimal(value, 2)}%`);

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-07-01" → "jul/2026". */
export function competency(date: string): string {
  return `${MONTHS[Number(date.slice(5, 7)) - 1]}/${date.slice(0, 4)}`;
}

export const BASIS_LABEL: Record<string, string> = {
  NET_PERIOD: "Custo médio líquido da época",
  GROSS_PERIOD: "Custo médio bruto da época",
};

/** "+R$ 1.234,50" / "−R$ 10,00" / "R$ 0,00": the sign leads, as in variation columns. */
export function signedMoney(value: string | null): string {
  if (value === null) return "—";
  const r = formatDecimal(value, 2);
  if (r.startsWith("−")) return `−R$ ${r.slice(1)}`;
  return /^[0.,]+$/.test(r) ? `R$ ${r}` : `+R$ ${r}`;
}
export function signedPercent(value: string | null): string {
  if (value === null) return "—";
  const r = formatDecimal(value, 2);
  return r.startsWith("−") || /^[0.,]+$/.test(r) ? `${r}%` : `+${r}%`;
}
export const quantity = (value: string | null) => formatDecimal(value, 3);
export const unitCost = (value: string | null) => (value === null ? "—" : `R$ ${formatDecimal(value, 4)}`);
