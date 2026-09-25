import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../core/auth/AuthProvider";
import { hasAnyScope } from "../../core/auth/permissions";
import { formatDate } from "../../shared/dates";
import { useResource } from "../../shared/useResource";
import { Notice, PageTitle } from "../../shared/ui";
import * as api from "./api";
import { isInactiveSource, isOverdue, queueRank } from "./lifecycle";
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
  return (
    <>
      <PageTitle
        title="Planos de Ação"
        description="Qualidade · Fila operacional de planos de ação"
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
      {r.loading && <Notice>Carregando planos de ação…</Notice>}
      {r.error && (
        <Notice error>
          {r.error} <button onClick={r.reload}>Tentar novamente</button>
        </Notice>
      )}
      {r.data && !all.length && (
        <Notice>
          {inspection
            ? "Nenhum plano de ação disponível para esta auditoria no seu acesso."
            : "Nenhum plano de ação disponível no seu acesso."}
        </Notice>
      )}
      {r.data && all.length > 0 && (
        <>
          <section className="ap-metrics" aria-label="Indicadores">
            <div>
              <strong>
                {count(({ plan }) => plan.status !== "completed")}
              </strong>
              Abertos
            </div>
            <div>
              <strong>{count(({ plan }) => isOverdue(plan))}</strong>
              Atrasados
            </div>
            <div>
              <strong>
                {count(
                  ({ plan }) =>
                    plan.status === "completed" && !plan.effectiveness,
                )}
              </strong>
              Aguardando verificação
            </div>
            <div>
              <strong>
                {count(
                  ({ plan }) =>
                    !!plan.effectiveness && plan.effectiveness !== "effective",
                )}
              </strong>
              Ineficazes ou parciais
            </div>
          </section>
          <form className="filters" onSubmit={(e) => e.preventDefault()}>
            <label>
              Buscar
              <input
                type="search"
                placeholder="Ponto de melhoria ou responsável"
                value={filters.search}
                onChange={(e) => set("search", e.target.value)}
              />
            </label>
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
          </form>
          {!visible.length && (
            <Notice>Nenhum plano corresponde aos filtros.</Notice>
          )}
          <ul className="ap-list">
            {visible.map((x) => (
              <li key={x.plan.id} className="ap-card">
                <Link to={`/action-plans/${x.plan.id}`}>
                  {x.item_number ? `${x.item_number}. ` : ""}
                  {x.plan.improvement_point}
                </Link>
                <p>
                  {originLabel(x.plan)} · {x.unit_name}
                  {x.sector_name ? ` / ${x.sector_name}` : ""}
                </p>
                <p>
                  Responsável: {x.plan.responsible || "—"} · Prazo:{" "}
                  {formatDate(x.plan.due_date)}
                </p>
                <PlanBadges plan={x.plan} />
              </li>
            ))}
          </ul>
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
