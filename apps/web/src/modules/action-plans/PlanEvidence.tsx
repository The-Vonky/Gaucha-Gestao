import { useRef, useState } from "react";
import { Notice } from "../../shared/ui";
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
      <button disabled={busy} onClick={() => void open()}>
        {busy ? "Abrindo…" : "Baixar"}
      </button>
      {error && <span role="alert">Arquivo indisponível.</span>}
    </>
  );
}
export function EvidenceList({
  rows,
  onRemove,
  empty = "Nenhuma evidência anexada.",
}: {
  rows: Evidence[];
  onRemove?: (e: Evidence) => void;
  empty?: string;
}) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  return (
    <ul className="record-list evidence-list">
      {rows.map((e) => (
        <li key={e.id}>
          <div>
            <strong>{e.original_name}</strong>
            <p>
              {typeLabel(e.content_type)} · {formatSize(e.size_bytes)} ·{" "}
              {e.uploaded_by_name} ·{" "}
              {new Date(e.uploaded_at).toLocaleString("pt-BR")}
            </p>
          </div>
          <div className="row-actions">
            <Download evidence={e} />
            {onRemove && (
              <button
                aria-label={`Remover ${e.original_name}`}
                onClick={() => onRemove(e)}
              >
                Remover
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
/** One file per action; keeps the attempt after a network failure so it can be retried. */
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState<Attempt>();
  async function run(start: () => Promise<Attempt>) {
    setBusy(true);
    setError("");
    let current: Attempt | undefined;
    try {
      current = await start();
      await finishUpload(current);
      setAttempt(undefined);
      onUploaded();
    } catch (e) {
      setAttempt(current && retryable(e) ? current : undefined);
      setError(evidenceMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  const label =
    kind === "execution"
      ? "Anexar evidência da execução"
      : "Anexar evidência da verificação";
  return (
    <div className="evidence-upload">
      <input
        ref={input}
        className="file-input"
        type="file"
        accept={ACCEPT}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void run(() => beginUpload(planId, kind, file));
        }}
      />
      <div className="row-actions">
        <button disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Enviando…" : label}
        </button>
        {attempt && !busy && (
          <button onClick={() => void run(async () => attempt)}>
            Tentar novamente
          </button>
        )}
      </div>
      <p className="muted">{FORMATS_HINT}</p>
      {busy && (
        <p className="visually-hidden" role="status">
          Enviando arquivo…
        </p>
      )}
      {error && <Notice error>{error}</Notice>}
    </div>
  );
}
