import type { AuditReport } from "./types";

export function filename(report: AuditReport) {
  const prefix = report.kind === "inspection" ? "auditoria" : "historico-auditoria";
  const id = report.kind === "inspection" ? report.inspection.id : report.unit.id;
  // Identifiers and timestamps come from the server, but never interpolate a name.
  const safeId = /^[a-f0-9-]{36}$/i.test(id) ? id.toLowerCase() : "id-invalido";
  const stamp = report.generated_at.replace(/[^0-9]/g, "").slice(0, 14);
  return `${prefix}-${safeId}-${stamp}.xlsx`;
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  try { link.click(); } finally {
    link.remove();
    // Keep the URL alive through the browser's download handoff, then release it.
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
