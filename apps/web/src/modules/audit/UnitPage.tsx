import { useCallback, useState } from "react";
import { Link, Navigate, NavLink, useParams } from "react-router-dom";
import { useAuth } from "../../core/auth/AuthProvider";
import { useResource } from "../../shared/useResource";
import { Badge, Notice, Status } from "../../shared/ui";
import * as api from "./api";
import { NewInspection } from "./NewInspection";
import { Delta, formatDate, Progress, Result, StatusBadge } from "./Result";
import { ReportingActions } from "./reporting/ReportingActions";
import { RESPONSE_LABELS, RESPONSES } from "./scoring";
import { ScoreTrend, trendPoints } from "./ScoreTrend";
import type { AuditUnit, InspectionSummary } from "./types";
import { UnitCover } from "./UnitIdentity";
import { SITUATION_LABELS, situationTone, unitState, type UnitState } from "./unitSituation";
/** Routed unit tabs (D4): Resumo is the index, Histórico lives at /historico. */
const TABS: Record<string, "summary" | "history"> = { "": "summary", historico: "history" };
/** Why the unit is where it is, stated from the latest final result only. */
const READING = {
  adequate: "O último resultado final é adequado (76% ou mais).",
  partial: "O último resultado final é parcial (entre 51% e 76%).",
  inadequate: "O último resultado final é inadequado (abaixo de 51%).",
} as const;
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
          <UnitHero unit={unit} state={state} rows={r.data.rows} />
          <div className="unit-toolbar">
            <nav className="audit-tabs" aria-label="Unidade">
              <NavLink end to={base}>Resumo</NavLink>
              <NavLink to={`${base}/historico`}>
                Histórico <span className="audit-tab-count numeric">{r.data.rows.length}</span>
              </NavLink>
            </nav>
            {canCreate && (
              <button className="primary" onClick={() => setCreating(true)}>
                Nova auditoria
              </button>
            )}
          </div>
          {tab === "summary" ? (
            <UnitSummary unit={unit} state={state} rows={r.data.rows} />
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
/** Unit dossier header: cover, identity, situation and the headline readings. */
function UnitHero({
  unit,
  state,
  rows,
}: {
  unit: AuditUnit;
  state: UnitState;
  rows: InspectionSummary[];
}) {
  return (
    <header className="unit-hero">
      <UnitCover unit={unit} size="hero">
        <div className="unit-hero-identity">
          <p className="unit-cover-code">Auditorias · {unit.code}</p>
          <h1>{unit.name}</h1>
          <p className="unit-hero-status">
            <Badge tone={situationTone(state)}>{SITUATION_LABELS[state.situation]}</Badge>
            {!unit.active && <Status active={false} />}
            <span>
              {state.latest
                ? `Última auditoria em ${formatDate(state.latest.applied_on)} · ${state.latest.responsible_name}`
                : "Nenhuma auditoria registrada"}
            </span>
          </p>
        </div>
        <dl className="unit-hero-metrics" aria-label={`Indicadores de ${unit.name}`}>
          <div>
            <dt>Conformidade atual</dt>
            <dd>
              {state.current ? (
                <Result summary={state.current} />
              ) : (
                <span className="unit-hero-empty">Sem resultado final</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Tendência</dt>
            <dd className="unit-hero-trend">
              {state.current && state.previous ? (
                <Delta current={state.current.final_score} previous={state.previous.final_score} />
              ) : (
                <span className="unit-hero-empty">
                  {state.current ? "Primeira finalizada" : "—"}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt>Auditorias</dt>
            <dd>
              <strong className="numeric">{rows.length}</strong>{" "}
              <small>{state.finalized.length} finalizada{state.finalized.length === 1 ? "" : "s"}</small>
            </dd>
          </div>
          <div>
            <dt>Em andamento</dt>
            <dd>
              <strong className="numeric">{state.drafts.length}</strong>
            </dd>
          </div>
        </dl>
      </UnitCover>
    </header>
  );
}
/** Resumo: current situation first, then the open audit, then recent evolution. */
function UnitSummary({
  unit,
  state,
  rows,
}: {
  unit: AuditUnit;
  state: UnitState;
  rows: InspectionSummary[];
}) {
  const recent = trendPoints(rows).slice(-6);
  if (!rows.length)
    return (
      <section className="audit-panel unit-empty">
        <p className="muted">Nenhuma auditoria registrada para esta unidade.</p>
      </section>
    );
  const current = state.current;
  return (
    <div className="unit-summary-frame">
      <div className="unit-summary" data-drafts={state.drafts.length > 0}>
        <section className="audit-panel unit-situation" aria-labelledby="unit-current-title">
          <div className="audit-panel-head">
            <h2 id="unit-current-title">Situação atual</h2>
            {current && (
              <Link className="button-link" to={`/audit/inspections/${current.id}`}>
                Abrir auditoria
              </Link>
            )}
          </div>
          {current ? (
            <>
              <p className="unit-situation-lead">{READING[current.final_classification!]}</p>
              <p className="muted">
                Auditoria finalizada de {formatDate(current.applied_on)} · Responsável:{" "}
                {current.responsible_name}
              </p>
              <dl className="audit-counts">
                {RESPONSES.map((r) => (
                  <div key={r} className={`audit-count ${r.toLowerCase()}`}>
                    <dt>
                      <abbr title={RESPONSE_LABELS[r]}>{r}</abbr>{" "}
                      <span>{RESPONSE_LABELS[r]}</span>
                    </dt>
                    <dd className="numeric">
                      {{ AT: current.at_count, AP: current.ap_count, NAT: current.nat_count, NAP: current.nap_count }[r]}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p className="unit-situation-lead">
              {state.finalized.length
                ? "A última auditoria finalizada não tem critérios aplicáveis."
                : "Nenhuma auditoria finalizada."}
            </p>
          )}
          {state.drafts.length > 0 && (
            <p className="muted unit-situation-note">
              Há auditoria em andamento: a situação só muda quando ela for finalizada.
            </p>
          )}
        </section>
        {state.drafts.length > 0 && (
          <section className="audit-panel unit-drafts" aria-labelledby="unit-drafts-title">
            <div className="audit-panel-head">
              <h2 id="unit-drafts-title">
                Em andamento <span className="audit-tab-count numeric">{state.drafts.length}</span>
              </h2>
            </div>
            <ul className="unit-draft-list">
              {state.drafts.map((d) => (
                <li key={d.id}>
                  <p>
                    <strong className="numeric">{formatDate(d.applied_on)}</strong> · {d.responsible_name}
                  </p>
                  <Progress answered={d.answered} total={d.total_items} />
                  <p className="unit-draft-score">
                    <Result summary={d} />
                  </p>
                  <Link className="button-link" to={`/audit/inspections/${d.id}/checklist`}>
                    Continuar
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
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
            <ScoreTrend points={recent} height={180} label={`Resultado final das últimas ${recent.length} auditorias finalizadas de ${unit.name}`} />
          )}
        </section>
      </div>
    </div>
  );
}
/** Histórico: evolution over time, every inspection as a timeline and the history report. */
function UnitHistoryTab({ unit, rows }: { unit: AuditUnit; rows: InspectionSummary[] }) {
  const auth = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const finalized = rows.filter((x) => x.status === "finalized");
  const points = trendPoints(rows);
  return (
    <div className="unit-history">
      <section className="audit-panel unit-evolution" aria-labelledby="unit-evolution-title">
        <div className="audit-panel-head">
          <h2 id="unit-evolution-title">Evolução</h2>
          <p className="unit-evolution-legend">Faixas: adequada ≥ 76% · parcial 51–76% · inadequada &lt; 51%</p>
        </div>
        {points.length < 2 ? (
          <p className="muted">A evolução fica disponível a partir de 2 auditorias finalizadas.</p>
        ) : (
          <ScoreTrend points={points} height={260} label={`Resultado final das auditorias finalizadas de ${unit.name}`} />
        )}
      </section>
      <div className="unit-history-body">
        <section className="unit-timeline-section" aria-labelledby="unit-list-title">
          <h2 id="unit-list-title">Auditorias</h2>
          {!rows.length && <p className="muted">Nenhuma auditoria registrada para esta unidade.</p>}
          <ol className="unit-timeline">
            {rows.map((row) => {
              const previous =
                row.status === "finalized" ? finalized[finalized.indexOf(row) + 1] : undefined;
              return (
                <li
                  key={row.id}
                  data-band={row.status === "finalized" ? row.final_classification ?? "none" : "draft"}
                >
                  <div className="unit-timeline-main">
                    <p className="unit-timeline-date">
                      <time className="numeric" dateTime={row.applied_on}>
                        {formatDate(row.applied_on)}
                      </time>{" "}
                      <StatusBadge status={row.status} />
                    </p>
                    <p className="unit-timeline-meta">Responsável: {row.responsible_name}</p>
                    {row.status === "draft" && (
                      <Progress answered={row.answered} total={row.total_items} />
                    )}
                  </div>
                  <div className="unit-timeline-result">
                    <Result summary={row} />
                    {previous && <Delta current={row.final_score} previous={previous.final_score} />}
                  </div>
                  <Link className="button-link unit-timeline-open" to={`/audit/inspections/${row.id}`}>
                    Abrir
                  </Link>
                </li>
              );
            })}
          </ol>
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
    </div>
  );
}
