import { DefinitiveDeletion } from "../../shared/DefinitiveDeletion";
import type { DeletionResult } from "../../shared/storageDeletion";
import { beginPlanDeletion, planDeleteImpact, resumePlanDeletion } from "./deletion";
import { STATUS_LABELS } from "./lifecycle";
import type { PlanDeleteImpact } from "./types";

function Impact({ data }: { data: PlanDeleteImpact }) {
  const c = data.counts;
  return <>
    <p><strong>{data.title}</strong> · {data.unit}{data.sector && ` / ${data.sector}`}</p>
    <p>{data.source === "checklist" ? "Gerado por auditoria" : "Manual"} · {STATUS_LABELS[data.status]}
      {data.verified && " · Eficácia verificada"}</p>
    <dl className="definitive-delete-counts">
      <dt>Evidências de execução</dt><dd>{c.execution_evidence}</dd>
      <dt>Evidências de verificação</dt><dd>{c.verification_evidence}</dd>
      <dt>Rodadas de verificação realizadas</dt><dd>{data.rounds}</dd>
      <dt>Evidências removidas anteriormente</dt><dd>{c.removed_evidence}</dd>
      <dt>Reservas pendentes</dt><dd>{c.reservations}</dd>
      <dt>Arquivos no catálogo do Storage</dt><dd>{c.objects}</dd>
    </dl>
    <p>A exclusão é irreversível e inclui o planejamento, as verificações e os arquivos de todas as rodadas.
      {data.source === "checklist" && " A auditoria de origem, suas respostas e suas evidências são preservadas."}</p>
  </>;
}

export function DeletePlan(props: {
  id: string;
  pending: boolean;
  onClose: () => void;
  onChange: (feedback: string, result?: DeletionResult) => void;
}) {
  return <DefinitiveDeletion {...props} title="Excluir plano de ação" phrase="excluir plano de ação"
    loadImpact={planDeleteImpact} begin={beginPlanDeletion} resume={resumePlanDeletion}
    completedMessage="Plano de ação excluído definitivamente."
    reconciliationMessage="Exclusão pendente de reconciliação física. Retome após a verificação operacional."
    renderImpact={data => <Impact data={data} />} />;
}
