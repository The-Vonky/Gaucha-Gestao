import { useId, useRef, useState, type DragEvent } from "react";
import { Icon } from "../../shared/icons";
import {
  ACCEPT,
  beginUpload,
  downloadUrl,
  evidenceMessage,
  finishUpload,
  FORMATS_HINT,
  formatSize,
  openDownload,
  retryable,
  typeLabel,
  type Attempt,
} from "./evidence";
import type { Evidence, EvidenceKind } from "./types";
/**
 * Long names keep their start and extension visible: the start truncates with an
 * ellipsis, the tail never does. Screen readers read the spans as one name.
 */
function FileName({ name }: { name: string }) {
  const chars = Array.from(name);
  if (chars.length <= 28) return <strong className="file-name">{name}</strong>;
  return (
    <strong className="file-name split" title={name}>
      <span className="file-name-start">{chars.slice(0, -12).join("")}</span>
      <span className="file-name-end">{chars.slice(-12).join("")}</span>
    </strong>
  );
}
function Download({ evidence }: { evidence: Evidence }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function open() {
    setBusy(true);
    setError(false);
    try {
      openDownload(await downloadUrl(evidence));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="small"
        disabled={busy}
        aria-label={`Baixar ${evidence.original_name}`}
        onClick={() => void open()}
      >
        <Icon name="download" />
        {busy ? "Abrindo…" : "Baixar"}
      </button>
      {error && (
        <span className="file-error" role="alert">
          Arquivo indisponível.
        </span>
      )}
    </>
  );
}
/** Confirmed (available) evidence; actions name the file they act on. */
export function EvidenceList({
  rows,
  onRemove,
  empty = "Nenhuma evidência anexada.",
}: {
  rows: Evidence[];
  onRemove?: (e: Evidence) => void;
  empty?: string;
}) {
  if (!rows.length) return <p className="muted file-empty">{empty}</p>;
  return (
    <ul className="file-list">
      {rows.map((e) => (
        <li key={e.id} className="file-item">
          <span className="file-icon">
            <Icon name="file" />
          </span>
          <div className="file-body">
            <FileName name={e.original_name} />
            <p className="file-meta">
              {typeLabel(e.content_type)} · {formatSize(e.size_bytes)} ·{" "}
              {e.uploaded_by_name} ·{" "}
              {new Date(e.uploaded_at).toLocaleString("pt-BR")}
            </p>
          </div>
          <div className="file-actions">
            <Download evidence={e} />
            {onRemove && (
              <button
                className="small ghost file-remove"
                aria-label={`Remover ${e.original_name}`}
                onClick={() => onRemove(e)}
              >
                <Icon name="trash" />
                Remover
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
type Pending = {
  name: string;
  size: number;
  phase: "sending" | "confirming" | "error";
  error?: string;
  /** Kept after a network failure so the same upload can be retried. */
  attempt?: Attempt;
};
/** One file per action: upload zone plus the state of the file being sent. */
export function EvidenceUpload({
  planId,
  kind,
  onUploaded,
}: {
  planId: string;
  kind: EvidenceKind;
  onUploaded: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending>();
  const [dragging, setDragging] = useState(false);
  const hint = useId();
  const busy = !!pending && pending.phase !== "error";
  async function run(
    file: { name: string; size: number },
    start: () => Promise<Attempt>,
    stored = false,
  ) {
    setPending({ ...file, phase: stored ? "confirming" : "sending" });
    let current: Attempt | undefined;
    try {
      current = await start();
      await finishUpload(current, () =>
        setPending({ ...file, phase: "confirming" }),
      );
      setPending(undefined);
      onUploaded();
    } catch (e) {
      setPending({
        ...file,
        phase: "error",
        error: evidenceMessage(e),
        attempt: current && retryable(e) ? current : undefined,
      });
    } finally {
      if (input.current) input.current.value = "";
    }
  }
  function send(file: File | undefined) {
    // File name/size are prototype getters: copy them, never spread the File.
    if (file && !busy)
      void run({ name: file.name, size: file.size }, () =>
        beginUpload(planId, kind, file),
      );
  }
  const label =
    kind === "execution"
      ? "Anexar evidência da execução"
      : "Anexar evidência da verificação";
  const drag = (over: boolean) => (e: DragEvent) => {
    e.preventDefault();
    if (!busy) setDragging(over);
  };
  return (
    <div className="evidence-upload">
      <div
        className="upload-zone"
        data-dragging={dragging || undefined}
        onDragOver={drag(true)}
        onDragLeave={drag(false)}
        onDrop={(e) => {
          drag(false)(e);
          send(e.dataTransfer.files[0]);
        }}
      >
        <input
          ref={input}
          className="file-input"
          type="file"
          accept={ACCEPT}
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => send(e.target.files?.[0])}
        />
        <span className="upload-icon">
          <Icon name="upload" />
        </span>
        <div className="upload-text">
          <button
            type="button"
            disabled={busy}
            aria-describedby={hint}
            onClick={() => input.current?.click()}
          >
            {label}
          </button>
          <p className="upload-hint" id={hint}>
            {FORMATS_HINT} Um arquivo por vez; também é possível arrastá-lo para
            cá.
          </p>
        </div>
      </div>
      {pending && (
        <div className="file-item pending" data-state={pending.phase}>
          <span className="file-icon">
            <Icon name={pending.phase === "error" ? "error" : "upload"} />
          </span>
          <div className="file-body">
            <FileName name={pending.name} />
            {pending.phase === "error" ? (
              <p className="file-error" role="alert">
                {pending.error}
              </p>
            ) : (
              <>
                <p className="file-meta" role="status">
                  {pending.phase === "sending"
                    ? "Enviando arquivo…"
                    : "Confirmando envio…"}{" "}
                  · {formatSize(pending.size)}
                </p>
                <span className="file-progress" aria-hidden="true" />
              </>
            )}
          </div>
          {pending.phase === "error" && (
            <div className="file-actions">
              {pending.attempt && (
                <button
                  className="small"
                  onClick={() => {
                    const { name, size, attempt } = pending;
                    void run(
                      { name, size },
                      async () => attempt!,
                      attempt!.uploaded,
                    );
                  }}
                >
                  <Icon name="retry" />
                  Tentar novamente
                </button>
              )}
              <button
                className="small ghost"
                aria-label={`Descartar envio de ${pending.name}`}
                onClick={() => setPending(undefined)}
              >
                Descartar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
