import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../core/auth/AuthProvider";
import { message } from "../../../shared/errors";
import { download, filename } from "./download";
import { historyExport, inspectionExport } from "./api";
import { PrintSurface } from "./PrintSurface";
import type { AuditReport } from "./types";
import { workbookBlob } from "./workbook";
import { checkEvidence, prepareEvidence, ReportEvidenceError, type ReportEvidence } from "./evidence";
import { privateImages } from "../../../shared/privateImageCache";

type Props = { kind: "inspection"; inspectionId: string; unitId: string; blocked?: boolean } |
  { kind: "unit_history"; unitId: string; from: string; to: string; blocked?: boolean };
export function ReportingActions(props: Props) {
  const auth = useAuth();
  const allowed = !!auth.session && auth.can("audit.inspection.read", { unit_id: props.unitId }) &&
    auth.can("audit.inspection.export", { unit_id: props.unitId });
  const [evidence, setEvidence] = useState<ReportEvidence[]>([]);
  const [progress, setProgress] = useState("");
  const controller = useRef<AbortController | null>(null);
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
    setEvidence([]);
    setBusy(false);
    setError("");
    running.current = false;
    return () => { ++generation.current; controller.current?.abort(); };
  }, [userId, allowed, props.unitId, props.kind,
    props.kind === "inspection" ? props.inspectionId : props.from,
    props.kind === "unit_history" ? props.to : ""]);
  useEffect(() => {
    const epoch = privateImages.getAccessVersion();
    return privateImages.subscribe(() => {
      if (privateImages.getAccessVersion() !== epoch) {
        ++generation.current; controller.current?.abort(); running.current = false;
        setPreview(null); setEvidence([]); setBusy(false);
      }
    });
  }, [userId, allowed]);
  useEffect(() => {
    if (!allowed) { setPreview(null); setBusy(false); setError(""); }
  }, [allowed, userId]);
  useEffect(() => {
    if (props.blocked) {
      ++generation.current;
      controller.current?.abort(); setEvidence([]);
      running.current = false;
      setBusy(false);
      setPreview(null);
    }
  }, [props.blocked]);
  const close = useCallback(() => { setPreview(null); setEvidence([]); queueMicrotask(() => printButton.current?.focus()); }, []);
  if (!allowed) return null;
  async function prepare(output: "excel" | "print") {
    if (running.current || props.blocked) return;
    running.current = true;
    const ticket = ++generation.current;
    const request = new AbortController();
    controller.current = request;
    setProgress("Preparando relatório…");
    setBusy(true);
    setRetryOutput(output);
    setError("");
    try {
      const report = props.kind === "inspection" ? await inspectionExport(props.inspectionId) :
        await historyExport(props.unitId, props.from || null, props.to || null);
      if (ticket !== generation.current) return;
      const attached = report.kind === "inspection" ? await prepareEvidence(report, request.signal, text => {
        if (ticket === generation.current) setProgress(text);
      }) : [];
      if (ticket !== generation.current) return;
      async function authorize() {
        if (report.kind !== "inspection") return;
        const current = await inspectionExport(report.inspection.id);
        if (current.inspection.version !== report.inspection.version) throw new ReportEvidenceError("A auditoria mudou durante a preparação. Gere o relatório novamente.");
        await checkEvidence(report, attached);
      }
      await authorize();
      if (ticket !== generation.current) return;
      if (output === "print") { setEvidence(attached); setPreview(report); return; }
      setProgress("Montando arquivo Excel com as imagens…");
      await new Promise(resolve => setTimeout(resolve, 0));
      const blob = await workbookBlob(report, attached);
      if (ticket !== generation.current) return;
      await authorize();
      if (ticket === generation.current) download(blob, filename(report));
    } catch (e) {
      if (ticket === generation.current) {
        const rangeLimit = typeof e === "object" && e !== null &&
          "code" in e && e.code === "22023" &&
          "message" in e && e.message === "Narrow the date range";
        setError(rangeLimit ? "Mais de 5.000 auditorias. Reduza o intervalo de datas e tente novamente." : e instanceof ReportEvidenceError ? e.message : message(e));
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
    <p role="status" aria-live="polite">{busy ? progress : error ? `Erro ao gerar relatório: ${error}` : ""}</p>
    {busy && <button type="button" onClick={() => {
      ++generation.current; controller.current?.abort(); running.current = false; setBusy(false); setProgress(""); setEvidence([]);
    }}>Cancelar preparação</button>}
    {error && <button type="button" onClick={() => void prepare(retryOutput)} disabled={busy || props.blocked}>Tentar novamente</button>}
    {preview && <PrintSurface report={preview} evidence={evidence} onClose={close} authorize={preview.kind === "inspection" ? async () => {
      const current = await inspectionExport(preview.inspection.id);
      if (current.inspection.version !== preview.inspection.version) throw new Error("Auditoria alterada.");
      await checkEvidence(preview, evidence);
    } : undefined} />}
  </div>;
}
