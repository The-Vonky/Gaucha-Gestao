import { useCallback, useRef, useState } from "react";
import { message } from "../../shared/errors";
import { LoadingState, Modal, Notice } from "../../shared/ui";
import { useResource } from "../../shared/useResource";
import { beginDeletion, deletionImpact, resumeDeletion, type DeleteImpact } from "./deletion";
import { formatDate } from "./Result";

type Props = {
  id: string;
  pending: boolean;
  onClose: () => void;
  onChange: (feedback: string) => void;
};

function Impact({ data }: { data: DeleteImpact }) {
  const c = data.counts;
  return <>
    <p><strong>{data.unit}</strong> · {formatDate(data.date)} · {data.responsible}</p>
    <p>{data.status === "finalized" ? "Finalizada. O resultado oficial será perdido." : "Em andamento."}</p>
    <dl className="inspection-delete-counts">
      <dt>Respostas preenchidas</dt><dd>{c.answered} de {c.criteria} critérios</dd>
      <dt>Observações do checklist</dt><dd>{c.observations}</dd>
      <dt>Evidências do checklist</dt><dd>{c.checklist_evidence} ({c.checklist_reservations} pendentes)</dd>
      <dt>Registros de miniaturas</dt><dd>{c.derivatives}</dd>
      <dt>Planos de ação</dt><dd>{c.plans}</dd>
      <dt>Pendentes / em andamento / concluídos</dt><dd>{c.pending} / {c.in_progress} / {c.completed}</dd>
      <dt>Verificados dentre os concluídos</dt><dd>{c.verified}</dd>
      <dt>Planos com origem inativa</dt><dd>{c.inactive_sources}</dd>
      <dt>Evidências de execução / verificação</dt><dd>{c.execution_evidence} / {c.verification_evidence}</dd>
      <dt>Reservas pendentes nos planos</dt><dd>{c.plan_reservations}</dd>
      <dt>Arquivos no catálogo do Storage</dt><dd>{c.objects}</dd>
    </dl>
    <p>A exclusão é irreversível. Ela remove as respostas, tratamentos, atribuições de responsáveis,
      prazos, verificações e evidências de todas as rodadas. Os cadastros dos usuários são preservados.</p>
  </>;
}

export function DeleteInspection({ id, pending, onClose, onChange }: Props) {
  const [confirmation, setConfirmation] = useState("");
  const [started, setStarted] = useState(pending);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const impact = useResource(useCallback(() => pending ? Promise.resolve(null) : deletionImpact(id), [id, pending]));
  async function submit() {
    if (running.current || (!started && (!impact.data || confirmation !== "excluir auditoria"))) return;
    running.current = true;
    setBusy(true);
    setError("");
    let committed = started;
    try {
      if (!started && impact.data) {
        await beginDeletion(id, impact.data.snapshot, confirmation);
        committed = true;
        setStarted(true);
      }
      const result = await resumeDeletion(id);
      onChange(result === "completed" ? "Auditoria excluída definitivamente." :
        "Exclusão pendente de reconciliação física. Após a verificação operacional, retome a operação neste histórico.");
      onClose();
    } catch (failure) {
      setConfirmation("");
      if (!committed) impact.reload();
      setError(committed ? "A exclusão está pendente. Retome com acesso autorizado para concluir." :
        message(failure) + " Confira o histórico e o levantamento atualizado antes de tentar novamente.");
      onChange("");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return <Modal title="Excluir auditoria" onClose={onClose} busy={busy}>
    {started ? <p>A exclusão já foi confirmada. A retomada verifica os arquivos restantes.</p> : <>
      {impact.loading && <LoadingState label="Consultando impacto…" />}
      {impact.error && <Notice error>{impact.error} <button onClick={impact.reload}>Tentar novamente</button></Notice>}
      {impact.data && <Impact data={impact.data} />}
      <label>Digite <strong>excluir auditoria</strong> para confirmar
        <input value={confirmation} disabled={busy || !impact.data} autoComplete="off" spellCheck={false}
          onChange={event => setConfirmation(event.target.value)} />
      </label>
    </>}
    {error && <Notice error>{error}</Notice>}
    {busy && <p role="status">Processando exclusão…</p>}
    <div className="actions">
      <button disabled={busy} onClick={onClose}>{started ? "Fechar" : "Cancelar"}</button>
      <button className="inspection-delete-button" disabled={busy || (!started && (!impact.data || confirmation !== "excluir auditoria"))}
        onClick={() => void submit()}>{started ? "Retomar exclusão" : "Excluir definitivamente"}</button>
    </div>
  </Modal>;
}
