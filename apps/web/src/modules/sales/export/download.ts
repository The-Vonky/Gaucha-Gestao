import type { SalesExport } from "./types";

export function exportFilename(report: SalesExport) {
  const stamp = report.checked_at.replace(/[^0-9]/g, "").slice(0, 14);
  return `vendas-${report.mode === "full" ? "historico-autorizado" : "periodo-filtrado"}-${stamp}.xlsx`;
}
export function downloadExport(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = filename; document.body.append(link);
  try { link.click(); }
  finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000); }
}
