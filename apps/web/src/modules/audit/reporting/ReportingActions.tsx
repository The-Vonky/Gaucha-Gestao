import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../core/auth/AuthProvider";
import { message } from "../../../shared/errors";
import { download, filename } from "./download";
import { historyExport, inspectionExport } from "./api";
import { PrintSurface } from "./PrintSurface";
import type { AuditReport } from "./types";
import { workbookBlob } from "./workbook";

type Props = { kind: "inspection"; inspectionId: string; unitId: string; blocked?: boolean } |
  { kind: "unit_history"; unitId: string; from: string; to: string; blocked?: boolean };
export function ReportingActions(props: Props) {
  const auth = useAuth();
  const allowed = !!auth.session && auth.can("audit.inspection.read", { unit_id: props.unitId }) &&
    auth.can("audit.inspection.export", { unit_id: props.unitId });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retryOutput, setRetryOutput] = useState<"excel" | "print">("excel");
  const [preview, setPreview] = useState<AuditReport | null>(null);
  const generation = useRef(0);
  const running = useRef(false);
  const printButton = useRef<HTMLButtonElement>(null);
  const userId = auth.session?.user.id;
  useEffect(() => {
    setPreview(null);
    setBusy(false);
    setError("");
    running.current = false;
    return () => { ++generation.current; };
  }, [userId, allowed, props.unitId, props.kind,
    props.kind === "inspection" ? props.inspectionId : props.from,
    props.kind === "unit_history" ? props.to : ""]);
  useEffect(() => {
    if (!allowed) { setPreview(null); setBusy(false); setError(""); }
  }, [allowed, userId]);
  const close = useCallback(() => { setPreview(null); queueMicrotask(() => printButton.current?.focus()); }, []);
  if (!allowed) return null;
  async function prepare(output: "excel" | "print") {
    if (running.current || props.blocked) return;
    running.current = true;
    const ticket = ++generation.current;
    setBusy(true);
    setRetryOutput(output);
    setError("");
    try {
      const report = props.kind === "inspection" ? await inspectionExport(props.inspectionId) :
        await historyExport(props.unitId, props.from || null, props.to || null);
      if (ticket !== generation.current) return;
      if (output === "print") { setPreview(report); return; }
      const blob = await workbookBlob(report);
      if (ticket === generation.current) download(blob, filename(report));
    } catch (e) {
      if (ticket === generation.current) {
        const detail = message(e);
        setError(/Narrow the date range/.test(detail) ? "Mais de 5.000 auditorias. Reduza o intervalo de datas e tente novamente." : detail);
      }
    } finally {
      if (ticket === generation.current) { running.current = false; setBusy(false); }
    }
  }
  return <div className="report-controls">
    <div className="actions">
      <button type="button" disabled={busy || props.blocked} onClick={() => void prepare("excel")}>{props.kind === "inspection" ? "Exportar Excel" : "Exportar histórico"}</button>
      <button ref={printButton} type="button" disabled={busy || props.blocked} onClick={() => void prepare("print")}>Imprimir / PDF</button>
    </div>
    {props.blocked && <p className="muted">Aguarde o salvamento das respostas antes de gerar o relatório. O relatório inclui somente dados já salvos.</p>}
    <p role="status" aria-live="polite">{busy ? "Preparando relatório…" : error ? `Erro ao gerar relatório: ${error}` : ""}</p>
    {error && <button type="button" onClick={() => void prepare(retryOutput)} disabled={busy || props.blocked}>Tentar novamente</button>}
    {preview && <PrintSurface report={preview} onClose={close} />}
  </div>;
}
