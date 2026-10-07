import { useCallback, useId, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../core/auth/AuthProvider";
import { hasAnyScope } from "../../core/auth/permissions";
import { formatDate } from "../../shared/dates";
import { useResource } from "../../shared/useResource";
import { Icon } from "../../shared/icons";
import { plural } from "../../shared/plural";
import {
  EmptyState,
  LoadingState,
  Metric,
  Notice,
  PageTitle,
} from "../../shared/ui";
import * as api from "./api";
import {
  daysUntilDue,
  isDueSoon,
  isInactiveSource,
  isOverdue,
  queueRank,
} from "./lifecycle";
import { NewActionPlan } from "./NewActionPlan";
import { originLabel, PlanBadges } from "./PlanBadges";
import type { PlanSummary } from "./types";
type Filters = {
  unit: string;
  sector: string;
  status: string;
  origin: string;
  overdue: boolean;
  history: boolean;
  search: string;
};
const initial: Filters = {
  unit: "",
  sector: "",
  status: "",
  origin: "",
  overdue: false,
  history: false,
  search: "",
};
export function ActionPlansOverview() {
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const inspection = params.get("inspection") ?? "";
  const [filters, setFilters] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const moreId = useId();
  const canCreate = hasAnyScope(
    !!auth.profile?.active,
    auth.grants,
    "action_plan.create_manual",
  );
  const r = useResource(
    useCallback(async () => {
      const [rows, scopes] = await Promise.all([
        api.summaries(inspection ? { p_inspection: inspection } : {}),
        canCreate ? api.creationScopes() : Promise.resolve([]),
      ]);
      return { rows, scopes };
    }, [inspection, canCreate]),
  );
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({
      ...f,
      [key]: value,
      ...(key === "unit" ? { sector: "" } : {}),
    }));
  const all = r.data?.rows ?? [];
  // Default operational scope hides inactive checklist-source history.
  const operational = all.filter(
    (x) => filters.history || !isInactiveSource(x.plan),
  );
  const term = filters.search.trim().toLocaleLowerCase("pt-BR");
  const visible = operational
    .filter(
      ({ plan }) =>
        (!filters.unit || plan.unit_id === filters.unit) &&
        (!filters.sector || plan.sector_id === filters.sector) &&
        (!filters.status || plan.status === filters.status) &&
        (!filters.origin || plan.source_type === filters.origin) &&
        (!filters.overdue || isOverdue(plan)) &&
        (!term ||
          `${plan.improvement_point} ${plan.responsible}`
            .toLocaleLowerCase("pt-BR")
            .includes(term)),
    )
    .sort(
      (a, b) =>
        queueRank(a.plan) - queueRank(b.plan) ||
        (a.plan.due_date ?? "9999").localeCompare(b.plan.due_date ?? "9999"),
    );
  const units = [...new Map(all.map((x) => [x.plan.unit_id, x.unit_name]))];
  const sectors = [
    ...new Map(
      all
        .filter((x) => x.plan.sector_id && x.plan.unit_id === filters.unit)
        .map((x) => [x.plan.sector_id!, x.sector_name ?? ""]),
    ),
  ];
  const count = (fn: (x: PlanSummary) => boolean) =>
    operational.filter(fn).length;
  const open = count(({ plan }) => plan.status !== "completed");
  const overdue = count(({ plan }) => isOverdue(plan));
  const awaiting = count(
    ({ plan }) => plan.status === "completed" && !plan.effectiveness,
  );
  const ineffective = count(
    ({ plan }) => !!plan.effectiveness && plan.effectiveness !== "effective",
  );
  const refined = [
    filters.unit,
    filters.sector,
    filters.status,
    filters.origin,
    filters.overdue,
    filters.history,
  ].filter(Boolean).length;
  return (
    <>
      <PageTitle
        eyebrow="Qualidade"
        title="Planos de Ação"
        description="Fila operacional: o que precisa da sua atenção primeiro."
      >
        {canCreate && (
          <button className="primary" onClick={() => setCreating(true)}>
            Novo plano
          </button>
        )}
      </PageTitle>
      {inspection && (
        <Notice>
          Exibindo os planos gerados por uma auditoria específica.{" "}
          <button
            onClick={() => {
              params.delete("inspection");
              setParams(params);
            }}
          >
            Remover filtro
          </button>
        </Notice>
      )}
      {r.loading && <LoadingState label="Carregando planos de ação…" />}
      {r.error && (
        <Notice error>
          {r.error} <button onClick={r.reload}>Tentar novamente</button>
        </Notice>
      )}
      {r.data && !all.length && (
        <EmptyState title="Nenhum plano de ação">
          {inspection
            ? "Nenhum plano de ação disponível para esta auditoria no seu acesso."
            : "Nenhum plano de ação disponível no seu acesso."}
        </EmptyState>
      )}
      {r.data && all.length > 0 && (
        <>
          <section className="ap-metrics" aria-label="Indicadores">
            <Metric label="Abertos" value={open} />
            <Metric
              label="Atrasados"
              value={overdue}
              tone={overdue ? "danger" : undefined}
            />
            <Metric
              label="Aguardando verificação"
              value={awaiting}
              tone={awaiting ? "warning" : undefined}
            />
            <Metric
              label="Ineficazes ou parciais"
              value={ineffective}
              tone={ineffective ? "danger" : undefined}
            />
          </section>
          <form
            className="filters ap-filters"
            data-open={filtersOpen}
            onSubmit={(e) => e.preventDefault()}
          >
            <label className="ap-search">
              Buscar
              <input
                type="search"
                placeholder="Ponto de melhoria ou responsável"
                value={filters.search}
                onChange={(e) => set("search", e.target.value)}
              />
            </label>
            <button
              type="button"
              className="ap-filters-toggle"
              aria-expanded={filtersOpen}
              aria-controls={moreId}
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <Icon name="filter" />
              Filtros
              {refined > 0 && (
                <span className="ap-filters-count numeric">
                  {refined}
                  <span className="visually-hidden">
                    {refined === 1 ? " ativo" : " ativos"}
                  </span>
                </span>
              )}
            </button>
            <div className="ap-filters-more" id={moreId}>
              <label>
                Unidade
                <select
                  value={filters.unit}
                  onChange={(e) => set("unit", e.target.value)}
                >
                  <option value="">Todas</option>
                  {units.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              {sectors.length > 0 && (
                <label>
                  Setor
                  <select
                    value={filters.sector}
                    onChange={(e) => set("sector", e.target.value)}
                  >
                    <option value="">Todos</option>
                    {sectors.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Situação
                <select
                  value={filters.status}
                  onChange={(e) => set("status", e.target.value)}
                >
                  <option value="">Todas</option>
                  <option value="pending">Pendente</option>
                  <option value="in_progress">Em andamento</option>
                  <option value="completed">Concluído</option>
                </select>
              </label>
              <label>
                Origem
                <select
                  value={filters.origin}
                  onChange={(e) => set("origin", e.target.value)}
                >
                  <option value="">Todas</option>
                  <option value="checklist">Checklist</option>
                  <option value="manual">Manual</option>
                </select>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={filters.overdue}
                  onChange={(e) => set("overdue", e.target.checked)}
                />
                <span>Somente atrasados</span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={filters.history}
                  onChange={(e) => set("history", e.target.checked)}
                />
                <span>Incluir origens inativas</span>
              </label>
            </div>
          </form>
          {!visible.length ? (
            // Without search or filters, only inactive-source history is hidden.
            <EmptyState
              title="Nenhum plano encontrado"
              actions={
                refined || term ? (
                  <button type="button" onClick={() => setFilters(initial)}>
                    Limpar filtros
                  </button>
                ) : (
                  <button type="button" onClick={() => set("history", true)}>
                    Incluir origens inativas
                  </button>
                )
              }
            >
              {refined || term
                ? "Nenhum plano corresponde à busca e aos filtros aplicados."
                : "Os planos disponíveis são históricos de critérios que deixaram de ser AP/NAT."}
            </EmptyState>
          ) : (
            <p className="ap-queue-head numeric" role="status">
              {plural(visible.length, "plano", "planos")} · em ordem de
              prioridade
            </p>
          )}
          {visible.length > 0 && (
            <ul className="ap-queue">
              {visible.map((x) => (
                <QueueRow key={x.plan.id} summary={x} />
              ))}
            </ul>
          )}
        </>
      )}
      {creating && r.data && (
        <NewActionPlan
          scopes={r.data.scopes}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}
function QueueRow({ summary: x }: { summary: PlanSummary }) {
  const { plan } = x;
  const overdue = isOverdue(plan);
  const soon = isDueSoon(plan);
  const days = plan.due_date ? daysUntilDue(plan.due_date) : null;
  return (
    <li
      className="ap-row"
      data-priority={overdue ? "overdue" : soon ? "soon" : undefined}
    >
      <div className="ap-row-main">
        <Link className="ap-row-title" to={`/action-plans/${plan.id}`}>
          {x.item_number ? `${x.item_number}. ` : ""}
          {plan.improvement_point}
        </Link>
        <PlanBadges plan={plan} />
        <p className="ap-row-meta">
          <span>{originLabel(plan)}</span>
          <span>
            {x.unit_name}
            {x.sector_name ? ` / ${x.sector_name}` : ""}
          </span>
          <span>Responsável: {plan.responsible || "—"}</span>
        </p>
      </div>
      <div className="ap-row-due">
        <span className="ap-due-label">Prazo</span>
        <span className="ap-due-date numeric">{formatDate(plan.due_date)}</span>
        {overdue && days !== null && (
          <span className="ap-due-note danger numeric">
            {plural(-days, "dia", "dias")} de atraso
          </span>
        )}
        {soon && days !== null && (
          <span className="ap-due-note warning numeric">
            <Icon name="clock" />
            {days === 0
              ? "Vence hoje"
              : `Vence em ${plural(days, "dia", "dias")}`}
          </span>
        )}
      </div>
    </li>
  );
}
