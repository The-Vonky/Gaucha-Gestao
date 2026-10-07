import { useState } from "react";
import type { Plan, PlanValues } from "./types";
const text = (data: FormData, name: string) =>
  String(data.get(name) ?? "").trim();
const date = (data: FormData, name: string) => text(data, name) || null;
export function readPlanValues(data: FormData, plan?: Plan): PlanValues {
  return {
    // Checklist plans keep the canonical criterion as improvement point.
    improvement_point:
      plan?.source_type === "checklist"
        ? plan.improvement_point
        : text(data, "improvement_point"),
    action: text(data, "action"),
    how_to: text(data, "how_to"),
    responsible: text(data, "responsible"),
    due_date: date(data, "due_date"),
    effectiveness_criterion: text(data, "effectiveness_criterion"),
    monitoring_start: date(data, "monitoring_start"),
    monitoring_end: date(data, "monitoring_end"),
    expected_evidence: text(data, "expected_evidence"),
  };
}
/** Planning fields. Only the improvement point is required to save a pending plan. */
export function PlanFields({ plan }: { plan?: Plan }) {
  return (
    <>
      {plan?.source_type !== "checklist" && (
        <label>
          Ponto de melhoria (obrigatório)
          <textarea
            name="improvement_point"
            required
            maxLength={1000}
            defaultValue={plan?.improvement_point}
          />
        </label>
      )}
      <p className="muted">
        Os campos abaixo podem ser completados depois, mas são exigidos para
        iniciar a execução.
      </p>
      <label>
        O que fazer
        <textarea name="action" maxLength={2000} defaultValue={plan?.action} />
      </label>
      <label>
        Como fazer
        <textarea name="how_to" maxLength={2000} defaultValue={plan?.how_to} />
      </label>
      <label>
        Responsável
        <input
          name="responsible"
          maxLength={200}
          placeholder="Ex.: Gestora da Unidade, Equipe de Manutenção"
          defaultValue={plan?.responsible}
        />
      </label>
      <label>
        Prazo
        <input
          type="date"
          name="due_date"
          defaultValue={plan?.due_date ?? ""}
        />
      </label>
      <label>
        Critério de eficácia
        <textarea
          name="effectiveness_criterion"
          maxLength={1000}
          defaultValue={plan?.effectiveness_criterion}
        />
      </label>
      <MonitoringPeriod plan={plan} />
      <label>
        Evidência esperada
        <textarea
          name="expected_evidence"
          maxLength={1000}
          placeholder="Como a organização saberá que a ação funcionou"
          defaultValue={plan?.expected_evidence}
        />
      </label>
    </>
  );
}
/**
 * Optional, but complete when used: the database accepts both dates or none, with
 * start ≤ end. The form enforces the same rule before submitting.
 */
function MonitoringPeriod({ plan }: { plan?: Plan }) {
  const [start, setStart] = useState(plan?.monitoring_start ?? "");
  const [end, setEnd] = useState(plan?.monitoring_end ?? "");
  const partial = !!start !== !!end;
  return (
    <fieldset className="ap-period">
      <legend>Período de acompanhamento (opcional)</legend>
      <label>
        Início
        <input
          type="date"
          name="monitoring_start"
          value={start}
          max={end || undefined}
          required={!!end}
          onChange={(e) => setStart(e.target.value)}
        />
      </label>
      <label>
        Fim
        <input
          type="date"
          name="monitoring_end"
          value={end}
          min={start || undefined}
          required={!!start}
          onChange={(e) => setEnd(e.target.value)}
        />
      </label>
      {partial && (
        <p className="muted ap-period-hint">
          Informe o início e o fim, ou deixe os dois em branco.
        </p>
      )}
    </fieldset>
  );
}
