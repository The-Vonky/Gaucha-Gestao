import { useCallback, useEffect, useId, useState } from "react";
import type { Assignee, Plan, PlanValues } from "./types";
import { useResource } from "../../shared/useResource";
import { searchAssignees } from "./api";
import { monitoringDuration, planningDateBounds, planningDateError } from "./planningDates";
const text = (data: FormData, name: string) =>
  String(data.get(name) ?? "").trim();
const date = (data: FormData, name: string) => text(data, name) || null;
export function readPlanValues(data: FormData, plan?: Plan): PlanValues {
  for (const key of ["due_date", "monitoring_start", "monitoring_end"] as const) {
    const error = planningDateError(text(data, key), plan?.[key] ?? "");
    if (error) throw new Error(error);
  }
  const start = text(data, "monitoring_start"), end = text(data, "monitoring_end");
  if (!!start !== !!end) throw new Error("Informe o início e o fim do acompanhamento, ou deixe os dois em branco.");
  if (start > end) throw new Error("O início do acompanhamento não pode ser posterior ao fim.");
  return {
    // Checklist plans keep the canonical criterion as improvement point.
    improvement_point:
      plan?.source_type === "checklist"
        ? plan.improvement_point
        : text(data, "improvement_point"),
    action: text(data, "action"),
    how_to: text(data, "how_to"),
    responsible_id: text(data, "responsible_id") || null,
    due_date: date(data, "due_date"),
    effectiveness_criterion: text(data, "effectiveness_criterion"),
    monitoring_start: date(data, "monitoring_start"),
    monitoring_end: date(data, "monitoring_end"),
    expected_evidence: text(data, "expected_evidence"),
  };
}
/** Planning fields. Only the improvement point is required to save a pending plan. */
export function PlanFields({ plan, assigneeName, scope }: {
  plan?: Plan;
  assigneeName?: string | null;
  scope?: { unit: string; sector: string | null };
}) {
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
      <AssigneeField
        key={scope ? JSON.stringify([scope.unit, scope.sector]) : ""}
        scope={scope}
        plan={plan}
        assigneeName={assigneeName}
      />
      <label>
        Prazo
        <PlanningDate name="due_date" original={plan?.due_date} />
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
function AssigneeField({ scope, plan, assigneeName }: {
  scope?: { unit: string; sector: string | null };
  plan?: Plan;
  assigneeName?: string | null;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Assignee | undefined>(() =>
    plan?.responsible_id ? { id: plan.responsible_id, name: assigneeName ?? "Responsável atual" } : undefined,
  );
  const unit = scope?.unit;
  const sector = scope?.sector ?? null;
  const planId = plan?.id;
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [search]);
  const results = useResource(useCallback(
    () => unit ? searchAssignees(unit, sector, query, planId) : Promise.resolve([]),
    [unit, sector, query, planId],
  ));
  const candidates = results.data ?? [];
  const selectedOutsideSearch = selected && !candidates.some((candidate) => candidate.id === selected.id);
  return (
    <fieldset className="ap-period">
      <legend>Responsável</legend>
      <label>
        Buscar funcionário
        <input
          type="search"
          value={search}
          disabled={!unit}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <input type="hidden" name="responsible_id" value={selected?.id ?? ""} />
      <label>
        Funcionário responsável
        <select
          disabled={!unit}
          value={selected?.id ?? ""}
          onChange={(event) => setSelected(candidates.find((candidate) => candidate.id === event.target.value))}
        >
          <option value="" disabled={!!plan && plan.status !== "pending" && !!selected}>Sem responsável cadastrado</option>
          {selectedOutsideSearch && <option value={selected.id} disabled>{selected.name}</option>}
          {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
        </select>
      </label>
      {!unit && <p className="muted ap-period-hint">Selecione a unidade e o setor do plano.</p>}
      {unit && results.loading && <p className="muted ap-period-hint" role="status">Buscando funcionários…</p>}
      {unit && results.error && <p className="ap-period-hint" role="alert">
        Não foi possível buscar funcionários. <button type="button" onClick={results.reload}>Tentar novamente</button>
      </p>}
      {unit && !results.loading && !results.error && candidates.length === 0 && (
        <p className="muted ap-period-hint" role="status">Nenhum funcionário elegível encontrado.</p>
      )}
      {plan?.responsible && <p className="muted ap-period-hint">Responsável legado: {plan.responsible}</p>}
    </fieldset>
  );
}
function PlanningDate({ name, original, value, onChange, min, max, required }: {
  name: string; original?: string | null; value?: string; onChange?: (value: string) => void;
  min?: string; max?: string; required?: boolean;
}) {
  const [local, setLocal] = useState(original ?? "");
  const current = value ?? local;
  const id = useId();
  const bounds = planningDateBounds();
  const unchanged = !!original && current === original;
  const lower = unchanged ? min : min && min > bounds.min ? min : bounds.min;
  const upper = unchanged ? max : max && max < bounds.max ? max : bounds.max;
  const error = planningDateError(current, original ?? "") || (min && current && current < min || max && current && current > max
    ? "O início do acompanhamento não pode ser posterior ao fim." : "");
  return <>
    <input type="date" name={name} value={current} required={required}
      min={lower} max={upper}
      aria-invalid={!!error} aria-describedby={error ? id : undefined}
      onChange={e => { setLocal(e.target.value); onChange?.(e.target.value); }} />
    {error && <span id={id} role="status">{error}</span>}
  </>;
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
        <PlanningDate
          name="monitoring_start"
          original={plan?.monitoring_start}
          value={start}
          max={end || undefined}
          required={!!end}
          onChange={setStart}
        />
      </label>
      <label>
        Fim
        <PlanningDate
          name="monitoring_end"
          original={plan?.monitoring_end}
          value={end}
          min={start || undefined}
          required={!!start}
          onChange={setEnd}
        />
      </label>
      {monitoringDuration(start, end) && <p className="muted ap-period-hint" role="status">Duração do acompanhamento: {monitoringDuration(start, end)}.</p>}
      {partial && (
        <p className="muted ap-period-hint">
          Informe o início e o fim, ou deixe os dois em branco.
        </p>
      )}
    </fieldset>
  );
}
