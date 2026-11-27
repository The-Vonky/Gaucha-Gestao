import { useEffect, useId, useRef, useState } from "react";
import type { Assignee, Plan, PlanValues } from "./types";
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
      {plan?.responsible && <p className="muted ap-period-hint">Responsável legado: {plan.responsible}</p>}
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
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [active, setActive] = useState(-1);
  const [selected, setSelected] = useState<Assignee | undefined>(() =>
    plan?.responsible_id ? { id: plan.responsible_id, name: assigneeName ?? "Responsável atual" } : undefined,
  );
  const [result, setResult] = useState<{ query: string; retry: number; rows?: Assignee[] }>();
  const unit = scope?.unit;
  const sector = scope?.sector ?? null;
  const planId = plan?.id;
  const query = search?.trim() ?? "";
  useEffect(() => {
    if (!open || !unit) return;
    let current = true;
    const timer = window.setTimeout(async () => {
      try {
        const rows = await searchAssignees(unit, sector, query, planId);
        if (current) setResult({ query, retry, rows });
      } catch {
        if (current) setResult({ query, retry });
      }
    }, query ? 200 : 0);
    return () => { current = false; window.clearTimeout(timer); };
  }, [open, unit, sector, planId, query, retry]);

  const matching = result?.query === query && result.retry === retry ? result : undefined;
  const choices = matching?.rows ?? [];
  const clearable = !!selected && (!plan || plan.status === "pending") && !query;
  const options = clearable ? [{ id: "", name: "Sem responsável cadastrado" }, ...choices] : choices;
  const close = () => {
    setOpen(false);
    setSearch(null);
    setResult(undefined);
    setActive(-1);
  };
  const choose = (option: Assignee) => {
    setSelected(option.id ? option : undefined);
    close();
    input.current?.focus();
  };
  useEffect(() => {
    if (!open || active < 0) return;
    const option = document.getElementById(`${id}-${active}`);
    const panel = popup.current;
    if (!option || !panel) return;
    const item = option.getBoundingClientRect();
    const frame = panel.getBoundingClientRect();
    panel.scrollTop += item.top < frame.top ? item.top - frame.top : Math.max(0, item.bottom - frame.bottom);
  }, [id, open, active]);

  return (
    <div className="ap-assignee" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) close();
    }}>
      <label htmlFor={id}>Responsável</label>
      <input type="hidden" name="responsible_id" value={selected?.id ?? ""} />
      <input
        id={id}
        ref={input}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? `${id}-results` : undefined}
        aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined}
        autoComplete="off"
        placeholder={unit ? "Buscar funcionário" : "Selecione a unidade e o setor"}
        disabled={!unit}
        value={search ?? selected?.name ?? ""}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(event) => { setSearch(event.target.value); setActive(-1); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            const direction = event.key === "ArrowDown" ? 1 : -1;
            setActive(options.length ? (active < 0 && direction < 0 ? options.length - 1 :
              Math.max(0, Math.min(options.length - 1, active + direction))) : -1);
          } else if (open && event.key === "Enter") {
            event.preventDefault();
            if (options[active]) choose(options[active]);
          } else if (open && event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
      />
      {open && unit && <div ref={popup} className="ap-assignee-popup">
        <ul id={`${id}-results`} role="listbox" aria-label="Funcionários elegíveis" aria-busy={!matching}>
          {options.map((option, index) => (
            <li
              id={`${id}-${index}`}
              key={option.id}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              {option.name}
            </li>
          ))}
        </ul>
        {!matching && <p role="status">Buscando funcionários…</p>}
        {matching && !matching.rows && <p role="alert">
          Não foi possível buscar funcionários.{" "}
          <button type="button" onClick={() => { setRetry(retry + 1); input.current?.focus(); }}>
            Tentar novamente
          </button>
        </p>}
        {matching?.rows?.length === 0 && <p role="status">Nenhum funcionário elegível encontrado.</p>}
      </div>}
    </div>
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
