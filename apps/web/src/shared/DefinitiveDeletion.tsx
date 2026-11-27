import { useCallback, useRef, useState, type ReactNode } from "react";
import type { DeletionResult } from "./storageDeletion";
import { message } from "./errors";
import { LoadingState, Modal, Notice } from "./ui";
import { useResource } from "./useResource";

type Props<T> = {
  id: string;
  pending: boolean;
  title: string;
  phrase: string;
  completedMessage: string;
  reconciliationMessage: string;
  loadImpact: (id: string) => Promise<T>;
  begin: (id: string, snapshot: string, confirmation: string) => Promise<void>;
  resume: (id: string) => Promise<DeletionResult>;
  renderImpact: (data: T) => ReactNode;
  onClose: () => void;
  onChange: (feedback: string, result?: DeletionResult) => void;
};

export function DefinitiveDeletion<T extends { snapshot: string }>({
  id, pending, title, phrase, completedMessage, reconciliationMessage, loadImpact, begin, resume, renderImpact, onClose, onChange,
}: Props<T>) {
  const [confirmation, setConfirmation] = useState("");
  const [started, setStarted] = useState(pending);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const impact = useResource(useCallback(() => pending ? Promise.resolve(null) : loadImpact(id), [id, pending, loadImpact]));
  async function submit() {
    if (running.current || (!started && (!impact.data || confirmation !== phrase))) return;
    running.current = true;
    setBusy(true);
    setError("");
    let committed = started;
    try {
      if (!started && impact.data) {
        await begin(id, impact.data.snapshot, confirmation);
        committed = true;
        setStarted(true);
      }
      const result = await resume(id);
      onChange(result === "completed" ? completedMessage : reconciliationMessage, result);
      onClose();
    } catch (failure) {
      setConfirmation("");
      if (!committed) impact.reload();
      setError(committed ? "A exclusão está pendente. Retome com acesso autorizado para concluir." :
        message(failure) + " Confira a prévia atualizada antes de tentar novamente.");
      onChange("");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return <Modal title={title} onClose={onClose} busy={busy}>
    {started ? <p>A exclusão já foi confirmada. A retomada verifica os arquivos restantes.</p> : <>
      {impact.loading && <LoadingState label="Consultando impacto…" />}
      {impact.error && <Notice error>{impact.error} <button onClick={impact.reload}>Tentar novamente</button></Notice>}
      {impact.data && renderImpact(impact.data)}
      <label>Digite <strong>{phrase}</strong> para confirmar
        <input value={confirmation} disabled={busy || !impact.data} autoComplete="off" spellCheck={false}
          onChange={event => setConfirmation(event.target.value)} />
      </label>
    </>}
    {error && <Notice error>{error}</Notice>}
    {busy && <p role="status">Processando exclusão…</p>}
    <div className="actions">
      <button disabled={busy} onClick={onClose}>{started ? "Fechar" : "Cancelar"}</button>
      <button className="definitive-delete-button" disabled={busy || (!started && (!impact.data || confirmation !== phrase))}
        onClick={() => void submit()}>{started ? "Retomar exclusão" : "Excluir definitivamente"}</button>
    </div>
  </Modal>;
}
