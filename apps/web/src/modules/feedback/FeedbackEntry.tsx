import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Modal, Notice } from "../../shared/ui";
import { feedbackLabel, kinds, modules, originModule, submitFeedback, validateAttachment, type Kind, type Module, type Submission } from "./api";
import "./feedback.css";

const FeedbackContext = createContext<(() => void) | null>(null);

export function FeedbackEntry({ children }: {
  children: (open: () => void) => ReactNode;
}) {
  const location = useLocation();
  const [origin, setOrigin] = useState<Module | null>(null);
  const open = () => setOrigin(originModule(location.pathname));
  return <FeedbackContext.Provider value={open}>
    {children(open)}
    {origin && <FeedbackForm origin={origin} onClose={() => setOrigin(null)} />}
  </FeedbackContext.Provider>;
}

export function FeedbackButton() {
  const open = useContext(FeedbackContext);
  return open && <button type="button" className="feedback-launch" aria-label={feedbackLabel} aria-haspopup="dialog" onClick={open}>Relatar</button>;
}

function FeedbackForm({ origin, onClose }: { origin: Module; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>("problem");
  const [module, setModule] = useState(origin);
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState("");
  const [attempted, setAttempted] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const submission = useRef<Submission | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      if (!submission.current) {
        if (description.trim().length < 10) throw new Error("Descreva o problema ou a sugestão com pelo menos 10 caracteres.");
        const attachment = file ? await validateAttachment(file) : null;
        controller.signal.throwIfAborted();
        submission.current = { id: crypto.randomUUID(), kind, module, description: description.trim(), origin, attachment };
        setAttempted(true);
      }
      const id = await submitFeedback(submission.current, controller.signal);
      if (!controller.signal.aborted) setReceipt(id);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(submission.current
        ? "O recebimento ainda não foi confirmado. Tente novamente neste formulário para evitar duplicidade."
        : failure instanceof Error ? failure.message : "Confira os dados e tente novamente.");
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <Modal title={feedbackLabel} onClose={onClose} busy={busy}>
    {receipt ? <>
      <Notice tone="success">Relato recebido.</Notice>
      <p className="feedback-detail-text">Identificador <strong>{receipt}</strong></p>
      <button type="button" className="primary" onClick={onClose}>Concluir</button>
    </> : <form onSubmit={event => void submit(event)}>
      {error && <Notice error>{error}</Notice>}
      <fieldset disabled={busy || attempted}>
        <legend>Dados do relato</legend>
        <label>Tipo<select value={kind} onChange={event => setKind(event.target.value as Kind)}>
          {Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label>Módulo ou tela<select value={module} onChange={event => setModule(event.target.value as Module)}>
          {Object.entries(modules).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label>Descrição detalhada<textarea required minLength={10} maxLength={4000} rows={5} value={description} onChange={event => setDescription(event.target.value)} /></label>
        <label>Anexo opcional<input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg"
          aria-describedby="feedback-attachment-help" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
        <p id="feedback-attachment-help">Uma imagem PNG ou JPEG de até 5 MiB. Oculte informações pessoais ou confidenciais antes de anexar.</p>
      </fieldset>
      <div className="actions feedback-actions">
        <button className="primary" type="submit" disabled={busy}>{busy ? "Enviando…" : attempted ? "Tentar novamente" : "Enviar relato"}</button>
        <button type="button" disabled={busy} onClick={onClose}>Cancelar</button>
      </div>
    </form>}
  </Modal>;
}
