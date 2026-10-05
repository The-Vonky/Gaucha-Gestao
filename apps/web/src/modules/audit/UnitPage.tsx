import { useCallback, useState } from "react";
import { Link, Navigate, NavLink, useParams } from "react-router-dom";
import { useAuth } from "../../core/auth/AuthProvider";
import { useResource } from "../../shared/useResource";
import { Badge, Notice, PageTitle, Status } from "../../shared/ui";
import * as api from "./api";
import { NewInspection } from "./NewInspection";
import { Delta, formatDate, Progress, Result, StatusBadge } from "./Result";
import { ReportingActions } from "./reporting/ReportingActions";
import { ScoreTrend, trendPoints } from "./ScoreTrend";
import type { AuditUnit, InspectionSummary } from "./types";
import { UnitMedia } from "./UnitIdentity";
import { SITUATION_LABELS, situationTone, unitState, type UnitState } from "./unitSituation";
/** Routed unit tabs (D4): Resumo is the index, Histórico lives at /historico. */
const TABS: Record<string, "summary" | "history"> = { "": "summary", historico: "history" };
export function UnitPage() {
  const { unitId = "", "*": tabPath = "" } = useParams();
  const tab = TABS[tabPath];
  const auth = useAuth();
  const [creating, setCreating] = useState(false);
  const r = useResource(
    useCallback(async () => {
      const [units, rows] = await Promise.all([
        api.units(),
        api.summaries({ p_unit: unitId }),
      ]);
      return { units, unit: units.find((u) => u.id === unitId), rows };
    }, [unitId]),
  );
  const unit = r.data?.unit;
  const base = `/audit/units/${unitId}`;
  if (!tab) return <Navigate to={base} replace />;
  const state = r.data ? unitState(r.data.rows) : undefined;
  const canCreate =
    !!unit?.active && auth.can("audit.inspection.create", { unit_id: unitId });
  return (
    <>
      <nav className="breadcrumb" aria-label="Trilha">
        <Link to="/audit">Auditorias</Link> /{" "}
        <span>{unit?.name ?? "Unidade"}</span>
      </nav>
      {r.loading && <Notice>Carregando unidade…</Notice>}
      {r.error && (
        <Notice error>
          {r.error} <button onClick={r.reload}>Tentar novamente</button>
        </Notice>
      )}
      {r.data && !unit && (
        <Notice error>Unidade não encontrada ou sem acesso de Auditoria.</Notice>
      )}
      {r.data && unit && state && (
        <>
          <PageTitle
            eyebrow={`Auditorias · ${unit.code}`}
            title={unit.name}
            description="Situação, evolução e auditorias da unidade"
          >
            {canCreate && (
              <button className="primary" onClick={() => setCreating(true)}>
                Nova auditoria
              </button>
            )}
          </PageTitle>
          <div className="unit-identity">
            <UnitMedia unit={unit} size="lg" />
            <div>
              <Badge tone={situationTone(state)}>{SITUATION_LABELS[state.situation]}</Badge>{" "}
              {!unit.active && <Status active={false} />}
              <p className="muted">
                {state.latest
                  ? `Última auditoria em ${formatDate(state.latest.applied_on)} · ${state.latest.responsible_name}`
                  : "Nenhuma auditoria registrada."}
              </p>
            </div>
          </div>
          <nav className="audit-tabs" aria-label="Unidade">
            <NavLink end to={base}>Resumo</NavLink>
            <NavLink to={`${base}/historico`}>
              Histórico <span className="audit-tab-count numeric">{r.data.rows.length}</span>
            </NavLink>
          </nav>
          {tab === "summary" ? (
            <UnitSummary unit={unit} state={state} rows={r.data.rows} canCreate={canCreate} onCreate={() => setCreating(true)} />
          ) : (
            <UnitHistoryTab unit={unit} rows={r.data.rows} />
          )}
        </>
      )}
      {creating && r.data && (
        <NewInspection
          units={r.data.units}
          unitId={unitId}
          lastApplied={state?.latest ? { [unitId]: state.latest.applied_on } : {}}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}
/** Resumo: the unit's current managerial reading. */
function UnitSummary({
  unit,
  state,
  rows,
  canCreate,
  onCreate,
}: {
  unit: AuditUnit;
  state: UnitState;
  rows: InspectionSummary[];
  canCreate: boolean;
  onCreate: () => void;
}) {
  const recent = trendPoints(rows).slice(-6);
  if (!rows.length)
    return (
      <section className="audit-panel">
        <p className="muted">Nenhuma auditoria registrada para esta unidade.</p>
        {canCreate && (
          <button className="primary" onClick={onCreate}>
            Nova auditoria
          </button>
        )}
      </section>
    );
  return (
    <div className="unit-summary">
      <section className="audit-panel" aria-labelledby="unit-current-title">
        <div className="audit-panel-head">
          <h2 id="unit-current-title">Situação atual</h2>
          {state.current && (
            <Link className="button-link" to={`/audit/inspections/${state.current.id}`}>
              Abrir auditoria
            </Link>
          )}
        </div>
        {state.current ? (
          <>
            <p className="unit-current">
              <Result summary={state.current} />{" "}
              <Delta current={state.current.final_score} previous={state.previous?.final_score ?? null} />
            </p>
            <p className="muted">
              Auditoria finalizada de {formatDate(state.current.applied_on)} · Responsável:{" "}
              {state.current.responsible_name}
            </p>
          </>
        ) : (
          <p className="muted">
            {state.finalized.length
              ? "A última auditoria finalizada não tem critérios aplicáveis."
              : "Nenhuma auditoria finalizada."}
          </p>
        )}
      </section>
      <section className="audit-panel" aria-labelledby="unit-drafts-title">
        <div className="audit-panel-head">
          <h2 id="unit-drafts-title">
            Em andamento <span className="audit-tab-count numeric">{state.drafts.length}</span>
          </h2>
        </div>
        {!state.drafts.length ? (
          <p className="muted">Nenhuma auditoria em andamento.</p>
        ) : (
          <ul className="record-list">
            {state.drafts.map((d) => (
              <li key={d.id}>
                <div>
                  <strong>{formatDate(d.applied_on)}</strong> <StatusBadge status={d.status} />
                  <p>Responsável: {d.responsible_name}</p>
                  <Progress answered={d.answered} total={d.total_items} />
                  <p>
                    <Result summary={d} />
                  </p>
                </div>
                <Link className="button-link" to={`/audit/inspections/${d.id}/checklist`}>
                  Continuar
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="audit-panel unit-figures" aria-label={`Indicadores de ${unit.name}`}>
        <dl>
          <div>
            <dt>Auditorias</dt>
            <dd className="numeric">{rows.length}</dd>
          </div>
          <div>
            <dt>Finalizadas</dt>
            <dd className="numeric">{state.finalized.length}</dd>
          </div>
          <div>
            <dt>Última auditoria</dt>
            <dd className="numeric">{state.latest ? formatDate(state.latest.applied_on) : "—"}</dd>
          </div>
        </dl>
      </section>
      <section className="audit-panel unit-trend-panel" aria-labelledby="unit-trend-title">
        <div className="audit-panel-head">
          <h2 id="unit-trend-title">Evolução recente</h2>
          <Link className="button-link" to={`/audit/units/${unit.id}/historico`}>
            Ver histórico
          </Link>
        </div>
        {recent.length < 2 ? (
          <p className="muted">A evolução fica disponível a partir de 2 auditorias finalizadas.</p>
        ) : (
          <ScoreTrend points={recent} height={160} label={`Resultado final das últimas ${recent.length} auditorias finalizadas de ${unit.name}`} />
        )}
      </section>
    </div>
  );
}
/** Histórico: evolution over time, every inspection and the history report. */
function UnitHistoryTab({ unit, rows }: { unit: AuditUnit; rows: InspectionSummary[] }) {
  const auth = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const finalized = rows.filter((x) => x.status === "finalized");
  const points = trendPoints(rows);
  return (
    <div className="unit-history">
      <section className="audit-panel" aria-labelledby="unit-evolution-title">
        <div className="audit-panel-head">
          <h2 id="unit-evolution-title">Evolução</h2>
        </div>
        {points.length < 2 ? (
          <p className="muted">A evolução fica disponível a partir de 2 auditorias finalizadas.</p>
        ) : (
          <ScoreTrend points={points} label={`Resultado final das auditorias finalizadas de ${unit.name}`} />
        )}
      </section>
      <section className="audit-panel" aria-labelledby="unit-list-title">
        <div className="audit-panel-head">
          <h2 id="unit-list-title">Auditorias</h2>
        </div>
        {!rows.length && <p className="muted">Nenhuma auditoria registrada para esta unidade.</p>}
        <ul className="record-list">
          {rows.map((row) => {
            const previous =
              row.status === "finalized" ? finalized[finalized.indexOf(row) + 1] : undefined;
            return (
              <li key={row.id}>
                <div>
                  <strong>{formatDate(row.applied_on)}</strong> <StatusBadge status={row.status} />
                  <p>Responsável: {row.responsible_name}</p>
                  {row.status === "draft" && (
                    <Progress answered={row.answered} total={row.total_items} />
                  )}
                  <p>
                    <Result summary={row} />{" "}
                    {previous && (
                      <Delta current={row.final_score} previous={previous.final_score} />
                    )}
                  </p>
                </div>
                <Link className="button-link" to={`/audit/inspections/${row.id}`}>
                  Abrir
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      {auth.can("audit.inspection.read", { unit_id: unit.id }) &&
        auth.can("audit.inspection.export", { unit_id: unit.id }) && (
          <section className="audit-panel audit-report-filters" aria-labelledby="unit-report-title">
            <div className="audit-panel-head">
              <h2 id="unit-report-title">Relatório do histórico</h2>
            </div>
            <p>Filtre pela data de aplicação (limites inclusivos, até 5.000 registros). Sem datas, o relatório inclui todo o histórico.</p>
            <div className="actions">
              <label>De <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
              <label>Até <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
            </div>
            {from && to && from > to ? (
              <Notice error>A data inicial deve ser anterior ou igual à final.</Notice>
            ) : (
              <ReportingActions kind="unit_history" unitId={unit.id} from={from} to={to} />
            )}
          </section>
        )}
    </div>
  );
}
