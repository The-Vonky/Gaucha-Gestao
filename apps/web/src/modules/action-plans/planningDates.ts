import { today } from "../../shared/dates";

// Form policy only; pending owner confirmation. Existing unchanged values remain editable.
export const PLANNING_DATE_POLICY = { minimum: "2000-01-01", futureYears: 5 };
export function planningDateBounds(reference = today()) {
  return { min: PLANNING_DATE_POLICY.minimum, max: `${Number(reference.slice(0, 4)) + PLANNING_DATE_POLICY.futureYears}-12-31` };
}
function calendarDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms / 86400000 : null;
}
export function planningDateError(value: string, original = "", reference = today()): string {
  if (!value) return "";
  if (calendarDay(value) === null) return "Informe uma data válida no formato dia/mês/ano.";
  if (value === original) return "";
  const { min, max } = planningDateBounds(reference);
  return value < min || value > max
    ? `Informe uma data entre ${min.split("-").reverse().join("/")} e ${max.split("-").reverse().join("/")}.`
    : "";
}
/** Elapsed calendar days, not 24-hour local-time intervals (DST-safe). */
export function monitoringDuration(start: string, end: string): string {
  const first = calendarDay(start), last = calendarDay(end);
  if (first === null || last === null || first > last) return "";
  const days = last - first;
  const months = (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12
    + Number(end.slice(5, 7)) - Number(start.slice(5, 7)) - (end.slice(8) < start.slice(8) ? 1 : 0);
  const years = Math.floor(months / 12), remainder = months % 12;
  const calendar = [years ? `${years} ${years === 1 ? "ano" : "anos"}` : "", remainder ? `${remainder} ${remainder === 1 ? "mês" : "meses"}` : ""].filter(Boolean).join(" e ");
  return `${days} ${days === 1 ? "dia" : "dias"}${calendar ? ` (${calendar} completos)` : ""}`;
}
