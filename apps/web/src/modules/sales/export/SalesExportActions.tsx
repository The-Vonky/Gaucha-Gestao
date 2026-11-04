import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../../../core/auth/AuthProvider";
import { collectExport, exportMessage, validateExport } from "./api";
import { downloadExport, exportFilename } from "./download";
import { exportBlob } from "./workbook";
import type { ExportFilters, ExportMode } from "./types";

export function SalesExportActions({ filters, blocked = false, endAction }: { filters: ExportFilters; blocked?: boolean; endAction?: ReactNode }) {
  const auth = useAuth();
  const active = !!auth.session && !!auth.profile?.active && !auth.loading && !auth.error;
  const canUnit = (permission: string, id: string) => auth.can(permission, { unit_id: id });
  const canExport = (mode: ExportMode) => {
    if (!active) return false;
    const permission = `sales.export.${mode}`;
    if (mode === "filtered" && filters.unit_ids?.length)
      return filters.unit_ids.every(id => canUnit(permission, id) && canUnit("sales.entry.read", id));
    return auth.grants.some(g => g.permission === permission && g.scope_type !== "sector" &&
      (g.scope_type === "global" ? auth.grants.some(r => r.permission === "sales.entry.read" && r.scope_type !== "sector") : !!g.unit_id && canUnit("sales.entry.read", g.unit_id)))
      && auth.grants.some(r => r.permission === "sales.entry.read" && r.scope_type !== "sector" &&
        (r.scope_type === "global" || !!r.unit_id && canUnit(permission, r.unit_id)));
  };
  const filtered = canExport("filtered"), full = canExport("full");
  const context = JSON.stringify([auth.session?.user.id, active, auth.grants, filters, blocked]);
  const generation = useRef(0), running = useRef(false);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(""), [error, setError] = useState("");
  const [retry, setRetry] = useState<ExportMode>("filtered");
  useEffect(() => {
    ++generation.current; running.current = false; setBusy(false); setStatus(""); setError("");
    return () => { ++generation.current; };
  }, [context]);
  async function prepare(mode: ExportMode) {
    if (running.current || (blocked && mode === "filtered") || !canExport(mode)) return;
    running.current = true; const ticket = ++generation.current;
    const cancelled = () => ticket !== generation.current;
    const applied = mode === "full" ? {} : structuredClone(filters);
    setBusy(true); setStatus("Preparando exportação…"); setError(""); setRetry(mode);
    try {
      const report = await collectExport(mode, applied, cancelled);
      if (cancelled()) return;
      if (!report.record_count) { setStatus("Nenhum dado disponível para esta exportação."); return; }
      const blob = await exportBlob(report);
      if (cancelled()) return;
      await validateExport(report, applied);
      if (cancelled()) return;
      downloadExport(blob, exportFilename(report)); setStatus("Download iniciado.");
    } catch (err) { if (!cancelled()) { setStatus(""); setError(exportMessage(err)); } }
    finally { if (!cancelled()) { running.current = false; setBusy(false); } }
  }
  const available = filtered || full;
  if (!available && !endAction) return null;
  return <div className="sales-export">
    <div className="sales-entry-toolbar">
      {available && <div className="sales-export-buttons" role="group" aria-label="Exportação Excel de Vendas">
        {filtered && <button type="button" disabled={busy || blocked} onClick={() => void prepare("filtered")}>Exportar período filtrado</button>}
        {full && <button type="button" disabled={busy} onClick={() => void prepare("full")}>Exportar histórico completo autorizado</button>}
      </div>}
      {endAction && <div className="sales-create-actions" role="group" aria-label="Cadastro de lançamento">{endAction}</div>}
    </div>
    {available && <>
      <p className="muted">O período filtrado usa os filtros aplicados. O histórico completo abrange todas as datas, unidades e formas autorizadas para exportação e leitura de lançamentos. Ajustes exigem também leitura gerencial e competências inteiras no período.</p>
      <p role="status" aria-live="polite">{busy ? "Preparando exportação…" : status}</p>
      {error && <><p role="alert">{error}</p><button type="button" disabled={busy || !canExport(retry) || (blocked && retry === "filtered")} onClick={() => void prepare(retry)}>Tentar exportar novamente</button></>}
    </>}
  </div>;
}
