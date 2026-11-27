import { DefinitiveDeletion } from "../../shared/DefinitiveDeletion";
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
    <dl className="definitive-delete-counts">
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

export function DeleteInspection(props: Props) {
  return <DefinitiveDeletion {...props} title="Excluir auditoria" phrase="excluir auditoria"
    loadImpact={deletionImpact} begin={beginDeletion} resume={resumeDeletion}
    completedMessage="Auditoria excluída definitivamente."
    reconciliationMessage="Exclusão pendente de reconciliação física. Após a verificação operacional, retome a operação neste histórico."
    renderImpact={data => <Impact data={data} />} />;
}
