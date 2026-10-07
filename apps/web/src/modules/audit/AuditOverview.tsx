import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../core/auth/AuthProvider";
import { hasAnyScope } from "../../core/auth/permissions";
import { useResource } from "../../shared/useResource";
import { Badge, Metric, Notice, PageTitle, Status } from "../../shared/ui";
import * as api from "./api";
import { NewInspection } from "./NewInspection";
import { Delta, formatDate, Progress, Result } from "./Result";
import { formatScore } from "./scoring";
import type { AuditUnit, InspectionSummary } from "./types";
import { UnitCover } from "./UnitIdentity";
import {
  SITUATION_LABELS,
  SITUATION_ORDER,
  situationTone,
  unitState,
  type Situation,
  type UnitState,
} from "./unitSituation";
type Filter = "all" | Situation;
const FILTER_LABELS: Record<Filter, string> = {
  all: "Todas",
  attention: "Em atenção",
  in_progress: "Em andamento",
  adequate: "Adequadas",
  no_data: "Sem dados",
};
/** Recent events shown (the overview contract holds drafts + 2 finalized per unit). */
const RECENT = 8;
/** Auditorias — visão geral: monitored units first (Audit UX v2 §6.1). */
export function AuditOverview() {
  const auth = useAuth();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const r = useResource(
    useCallback(async () => {
      const [units, rows] = await Promise.all([
        api.units(),
        api.summaries({ p_overview: true }),
      ]);
      return { units, rows };
    }, []),
  );
  const canCreate = hasAnyScope(
    !!auth.profile?.active,
    auth.grants,
    "audit.inspection.create",
  );
  const monitored = useMemo(() => {
    const byUnit = new Map<string, InspectionSummary[]>();
    for (const row of r.data?.rows ?? [])
      byUnit.set(row.unit_id, [...(byUnit.get(row.unit_id) ?? []), row]);
    return (r.data?.units ?? [])
      .filter((u) => u.active || byUnit.has(u.id))
      .map((unit) => ({ unit, state: unitState(byUnit.get(unit.id) ?? []) }))
      // D6: attention, in progress, adequate, no data; alphabetical within each group.
      .sort(
        (a, b) =>
          SITUATION_ORDER.indexOf(a.state.situation) -
            SITUATION_ORDER.indexOf(b.state.situation) ||
          a.unit.name.localeCompare(b.unit.name, "pt-BR"),
      );
  }, [r.data]);
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const searched = monitored.filter(({ unit }) =>
    `${unit.code} ${unit.name}`.toLocaleLowerCase("pt-BR").includes(term),
  );
  const shown = searched.filter(
    ({ state }) => filter === "all" || state.situation === filter,
  );
  const count = (f: Filter) =>
    f === "all" ? searched.length : searched.filter(({ state }) => state.situation === f).length;
  // Indicators (§4.2): derived from the same overview load, no new contract.
  const withResult = monitored.filter(({ state }) => state.current);
  const average = withResult.length
    ? withResult.reduce((sum, { state }) => sum + state.current!.final_score!, 0) /
      withResult.length
    : null;
  const attention = monitored.filter(({ state }) => state.situation === "attention");
  const inadequate = attention.filter(
    ({ state }) => state.current?.final_classification === "inadequate",
  ).length;
  const drafts = (r.data?.rows ?? []).filter((x) => x.status === "draft");
  const draftUnits = new Set(drafts.map((d) => d.unit_id)).size;
  const withoutAudit = monitored.filter(({ state }) => !state.latest).length;
  const activity = recentActivity(r.data?.rows ?? []);
  return (
    <>
      <PageTitle
        eyebrow="Qualidade"
        title="Auditorias"
        description="Unidades monitoradas, conformidade e auditorias em andamento."
      >
        {canCreate && (
          <button className="primary" onClick={() => setCreating(true)}>
            Nova auditoria
          </button>
        )}
      </PageTitle>
      {r.loading && <Notice>Carregando auditorias…</Notice>}
      {r.error && (
        <Notice error>
          {r.error} <button onClick={r.reload}>Tentar novamente</button>
        </Notice>
      )}
      {r.data && !r.data.units.length && (
        <Notice>
          Nenhuma unidade disponível para Auditoria no seu acesso. Solicite uma
          atribuição por unidade à administração.
        </Notice>
      )}
      {r.data && r.data.units.length > 0 && (
        <div className="audit-dashboard">
          {/* One strip, four readings (not four floating cards). */}
          <section className="audit-kpis" aria-label="Indicadores da Auditoria">
            <Metric
              label="Unidades monitoradas"
              value={monitored.length}
              hint={withoutAudit ? `${withoutAudit} sem auditoria` : "Todas com auditoria"}
            />
            {/* D3: an aggregate stays neutral; bands belong to one inspection's result. */}
            <Metric
              label="Conformidade média"
              value={formatScore(average)}
              hint={
                withResult.length
                  ? `Última auditoria finalizada de ${withResult.length} unidade${withResult.length === 1 ? "" : "s"}`
                  : "Sem resultados finais"
              }
            />
            <Metric
              label="Em atenção"
              value={attention.length}
              hint={
                attention.length
                  ? `${inadequate} inadequada${inadequate === 1 ? "" : "s"} · ${attention.length - inadequate} parcia${attention.length - inadequate === 1 ? "l" : "is"}`
                  : "Nenhuma unidade em atenção"
              }
            />
            <Metric
              label="Em andamento"
              value={drafts.length}
              hint={
                drafts.length
                  ? `Em ${draftUnits} unidade${draftUnits === 1 ? "" : "s"}`
                  : "Nenhuma auditoria em andamento"
              }
            />
          </section>
          <div className="audit-home">
            <section className="audit-units-section" aria-labelledby="audit-units-title">
              <div className="audit-units-head">
                <div>
                  <h2 id="audit-units-title">Unidades monitoradas</h2>
                  <p>Resultado final atual, auditoria em andamento e última visita.</p>
                </div>
                <label className="audit-search">
                  <span className="visually-hidden">Buscar unidade</span>
                  <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14m9 2-4-4" />
                  </svg>
                  <input
                    type="search"
                    placeholder="Buscar unidade"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              <div className="unit-filters" role="group" aria-label="Filtrar por situação">
                {(["all", ...SITUATION_ORDER] as Filter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                  >
                    {FILTER_LABELS[f]} <span className="numeric">{count(f)}</span>
                  </button>
                ))}
              </div>
              {!shown.length ? (
                <Notice>
                  Nenhuma unidade encontrada.{" "}
                  {(term || filter !== "all") && (
                    <button
                      onClick={() => {
                        setSearch("");
                        setFilter("all");
                      }}
                    >
                      Limpar filtros
                    </button>
                  )}
                </Notice>
              ) : (
                <ul className="unit-cards">
                  {shown.map(({ unit, state }) => (
                    <li key={unit.id}>
                      <UnitCard unit={unit} state={state} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="audit-activity" aria-labelledby="audit-activity-title">
              <div className="audit-activity-head">
                <h2 id="audit-activity-title">Atividade recente</h2>
                <p>
                  Auditorias iniciadas e finalizadas, entre as em andamento e as duas
                  últimas finalizadas de cada unidade.
                </p>
              </div>
              {!activity.length ? (
                <p className="muted">Nenhuma auditoria registrada.</p>
              ) : (
                <ul className="audit-recent-list">
                  {activity.map(({ kind, at, row }) => (
                    <li key={`${kind}-${row.id}`} data-kind={kind}>
                      <span className="audit-recent-event">
                        {kind === "finalized" ? "Auditoria finalizada" : "Auditoria iniciada"}
                        {" · "}
                        <time className="numeric" dateTime={at}>
                          {formatTimestamp(at)}
                        </time>
                      </span>
                      <Link to={`/audit/inspections/${row.id}`}>{row.unit_name}</Link>
                      <span className="audit-recent-meta">
                        Data da auditoria {formatDate(row.applied_on)} · {row.responsible_name}
                      </span>
                      <span className="audit-recent-result">
                        {kind === "finalized" ? (
                          <Result summary={row} />
                        ) : (
                          row.status === "draft" && (
                            <span className="numeric">
                              {row.answered}/{row.total_items} respondidos
                            </span>
                          )
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
      {creating && r.data && (
        <NewInspection
          units={r.data.units}
          // Rows are newest first by application date, so `latest` is each unit's last visit.
          lastApplied={Object.fromEntries(
            monitored.flatMap(({ unit, state }) =>
              state.latest ? [[unit.id, state.latest.applied_on]] : [],
            ),
          )}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}
/**
 * Only the events the overview contract represents with confidence: an
 * inspection started (`created_at`) and finalized (`finalized_at`). Uploads,
 * edits, reopenings or plans are never inferred.
 */
function recentActivity(rows: InspectionSummary[]) {
  return rows
    .flatMap((row) => [
      { kind: "started" as const, at: row.created_at, row },
      ...(row.finalized_at ? [{ kind: "finalized" as const, at: row.finalized_at, row }] : []),
    ])
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, RECENT);
}
function formatTimestamp(at: string) {
  return new Date(at).toLocaleDateString("pt-BR");
}
/** One monitored unit: cover, current result, open draft and last visit. */
function UnitCard({ unit, state }: { unit: AuditUnit; state: UnitState }) {
  const draft = state.drafts[0];
  return (
    <article className="unit-card" data-situation={state.situation}>
      <UnitCover unit={unit}>
        <span className="unit-cover-code">{unit.code}</span>
        <h3>
          {/* The whole card opens the unit through this single link. */}
          <Link className="unit-card-link" to={`/audit/units/${unit.id}`}>
            {unit.name}
          </Link>
        </h3>
      </UnitCover>
      <div className="unit-card-body">
        <div className="unit-card-score">
          <div className="unit-card-result">
            <span className="unit-card-caption">Conformidade</span>
            {state.current ? (
              <Result summary={state.current} />
            ) : (
              <span className="unit-card-empty">Sem resultado final</span>
            )}
          </div>
          <p className="unit-card-badges">
            <Badge tone={situationTone(state)}>{SITUATION_LABELS[state.situation]}</Badge>
            {!unit.active && <Status active={false} />}
          </p>
        </div>
        {state.current && (
          <p className="unit-card-trend">
            {state.previous ? (
              <Delta
                current={state.current.final_score}
                previous={state.previous.final_score}
              />
            ) : (
              <span className="audit-delta">Primeira auditoria finalizada</span>
            )}
          </p>
        )}
        {draft && (
          <div className="unit-card-draft">
            <div>
              <span className="unit-card-caption">Auditoria em andamento</span>
              <Progress answered={draft.answered} total={draft.total_items} />
            </div>
            <Link className="button-link unit-card-continue" to={`/audit/inspections/${draft.id}/checklist`}>
              Continuar
            </Link>
          </div>
        )}
        <p className="unit-card-foot">
          <span>
            {state.latest
              ? `Última auditoria ${formatDate(state.latest.applied_on)} · ${state.latest.responsible_name}`
              : "Nenhuma auditoria registrada"}
          </span>
          <span className="unit-card-open" aria-hidden="true">
            Ver unidade →
          </span>
        </p>
      </div>
    </article>
  );
}
