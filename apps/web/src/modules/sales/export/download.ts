import type { SalesExport } from "./types";

export function exportFilename(report: SalesExport) {
  const dates = [report.entry_from, report.entry_to, report.adjustment_from,
    report.adjustment_to ? monthEnd(report.adjustment_to) : null].filter((date): date is string => !!date).sort();
  // Sem dados não há download na UI; o helper ainda produz nome válido e determinístico.
  const generated = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date(report.checked_at));
  const from = (report.mode === "filtered" ? report.filters.from : null) ?? dates[0] ?? generated;
  const to = (report.mode === "filtered" ? report.filters.to : null) ?? dates.at(-1) ?? generated;
  const brazilian = (date: string) => date.split("-").reverse().join("-");
  return `historico-${report.mode === "full" ? "completo" : "filtrado"}-${brazilian(from)}-${brazilian(to)}-${report.entry_count}total.xlsx`;
}
function monthEnd(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + 1, 0);
  return value.toISOString().slice(0, 10);
}
export function downloadExport(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = filename; document.body.append(link);
  try { link.click(); }
  finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000); }
}
