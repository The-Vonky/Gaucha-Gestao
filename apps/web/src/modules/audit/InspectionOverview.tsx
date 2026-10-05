import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, type BadgeTone } from "../../shared/ui";
import { isOverdue, STATUS_LABELS, type PlanStatus } from "../action-plans/public";
import { Download } from "./ChecklistEvidence";
import { useInspection } from "./InspectionContext";
import { formatDate } from "./Result";
import {
  CLASSIFICATION_LABELS,
  formatScore,
  RESPONSE_LABELS,
  RESPONSES,
  type Classification,
  type Result,
} from "./scoring";
const BAND_TONE: Record<Classification, BadgeTone> = {
  adequate: "success",
  partial: "warning",
  inadequate: "danger",
};
/** Points of attention shown before "Mostrar todos". */
const ATTENTION_PREVIEW = 6;
const dateTime = (value: string | null) =>
  value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString("pt-BR") : "—";
/** Section status text: classification only for a complete section (scoring rule). */
function sectionStatus(result: Result) {
  if (result.classification) return CLASSIFICATION_LABELS[result.classification];
  if (result.complete) return "Sem critérios aplicáveis";
  if (result.score !== null) return "Parcial";
  return "Sem respostas";
}
/** Overview tab: operational summary of one inspection (data already loaded by the shell). */
export function InspectionOverview() {
  const { summary, sections, items, answers, results, editable, evidence, select, plans } =
    useInspection();
  const navigate = useNavigate();
  const [allAttention, setAllAttention] = useState(false);
  const base = `/audit/inspections/${summary.id}`;
  const { tally } = results.overall;
  const counts = { AT: tally.at, AP: tally.ap, NAT: tally.nat, NAP: tally.nap };
  const unanswered = tally.total - tally.answered;
  const draft = summary.status === "draft";
  const band = summary.final_classification;
  const openSection = (key: string) => {
    select(key);
    navigate(`${base}/checklist`);
  };
  const sectionOf = new Map(sections.map((s) => [s.key, s]));
  const itemOf = new Map(items.map((i) => [i.key, i]));
  // Points of attention: AP/NAT criteria, in checklist order, with their observation.
  const attention = items.filter((i) => {
    const r = answers[i.key]?.response;
    return r === "AP" || r === "NAT";
  });
  const evidenceByItem = new Map<string, typeof evidence.rows>();
  for (const row of evidence.rows)
    evidenceByItem.set(row.item_key, [...(evidenceByItem.get(row.item_key) ?? []), row]);
  const evidenceItems = items.filter((i) => evidenceByItem.has(i.key));
  // Counts only after a successful read: loading/error is "unavailable", never zero.
  const plansRead = !plans.loading && !plans.error;
  const evidenceRead = !evidence.loading && !evidence.error;
  return (
    <div className="audit-overview">
      <div className="audit-overview-main">
        <section className="audit-panel audit-result-panel" aria-labelledby="audit-result-title">
          <div className="audit-panel-head">
            <h2 id="audit-result-title">{draft ? "Conformidade parcial" : "Resultado final"}</h2>
            <Link className="button-link" to={`${base}/checklist`}>
              {draft && editable ? "Continuar checklist" : "Abrir checklist"}
            </Link>
          </div>
          {draft ? (
            <p className="audit-result-line">
              <strong className="audit-result-value info numeric">
                {formatScore(results.overall.score)}
              </strong>
              <span>
                {results.overall.score === null
                  ? "Sem dados de conformidade"
                  : "Parcial · em andamento"}{" "}
                · {tally.answered}/{tally.total} respondidos
              </span>
            </p>
          ) : summary.final_score === null || !band ? (
            <p className="audit-result-line">
              <strong className="audit-result-value numeric">—</strong>
              <span>Sem critérios aplicáveis</span>
            </p>
          ) : (
            <p className="audit-result-line">
              <strong className={`audit-result-value ${band} numeric`}>
                {formatScore(summary.final_score)}
              </strong>
              <Badge tone={BAND_TONE[band]}>{CLASSIFICATION_LABELS[band]}</Badge>
            </p>
          )}
          <h3 className="audit-subhead">Respostas</h3>
          <dl className="audit-counts">
            {RESPONSES.map((r) => (
              <div key={r} className={`audit-count ${r.toLowerCase()}`}>
                <dt>
                  <abbr title={RESPONSE_LABELS[r]}>{r}</abbr>{" "}
                  <span>{RESPONSE_LABELS[r]}</span>
                </dt>
                <dd className="numeric">{counts[r]}</dd>
              </div>
            ))}
            <div className="audit-count none">
              <dt>Não respondidos</dt>
              <dd className="numeric">{unanswered}</dd>
            </div>
          </dl>
        </section>

        <section className="audit-panel" aria-labelledby="audit-sections-title">
          <div className="audit-panel-head">
            <h2 id="audit-sections-title">Resultado por seção</h2>
          </div>
          <ol className="audit-section-results">
            {sections.map((s) => {
              const result = results.sections[s.key];
              return (
                <li key={s.key}>
                  <span className="audit-sr-pos numeric">{s.position}</span>
                  <span className="audit-sr-name">{s.name}</span>
                  <span className="audit-sr-meta">
                    <span className="audit-sr-count numeric">
                      {result.tally.answered}/{result.tally.total}
                    </span>
                    <span className="audit-sr-score numeric">{formatScore(result.score)}</span>
                    <span className="audit-sr-status">{sectionStatus(result)}</span>
                  </span>
                  <button
                    type="button"
                    className="small"
                    aria-label={`Abrir seção ${s.position}: ${s.name} no checklist`}
                    onClick={() => openSection(s.key)}
                  >
                    Abrir
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

      </div>
      <div className="audit-overview-side">
        <section className="audit-panel" aria-labelledby="audit-attention-title">
          <div className="audit-panel-head">
            <h2 id="audit-attention-title">
              Pontos de atenção <span className="audit-tab-count numeric">{attention.length}</span>
            </h2>
          </div>
          {!attention.length ? (
            <p className="muted">Nenhum critério respondido como AP ou NAT.</p>
          ) : (
            <ul className="audit-attention">
              {(allAttention ? attention : attention.slice(0, ATTENTION_PREVIEW)).map((item) => {
                const row = answers[item.key];
                const section = sectionOf.get(item.section_key);
                return (
                  <li key={item.key}>
                    <span className={`audit-attention-tag ${row.response!.toLowerCase()}`}>
                      {row.response}
                    </span>
                    <div className="audit-attention-body">
                      <p>
                        <span className="audit-number">{item.number}.</span> {item.text}
                      </p>
                      <p className="audit-attention-obs">
                        {row.observation ? row.observation : "Sem observação registrada."}
                      </p>
                    </div>
                    {section && (
                      <button
                        type="button"
                        className="small"
                        aria-label={`Abrir critério ${item.number} na seção ${section.position}: ${section.name}`}
                        onClick={() => openSection(section.key)}
                      >
                        Abrir
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {attention.length > ATTENTION_PREVIEW && (
            <button
              type="button"
              className="audit-show-all"
              aria-expanded={allAttention}
              onClick={() => setAllAttention((v) => !v)}
            >
              {allAttention ? "Mostrar menos" : `Mostrar todos (${attention.length})`}
            </button>
          )}
        </section>

        {plans.enabled && (
          <section className="audit-panel" aria-labelledby="audit-plans-summary-title">
            <div className="audit-panel-head">
              <h2 id="audit-plans-summary-title">
                Planos de ação{plansRead && <> <span className="audit-tab-count numeric">{plans.rows.length}</span></>}
              </h2>
              <Link className="button-link" to={`${base}/plano`}>Ver planos</Link>
            </div>
            {plans.loading && <p role="status">Carregando planos de ação…</p>}
            {plans.error && (
              <p role="alert">
                Não foi possível carregar os planos.{" "}
                <button type="button" onClick={plans.reload}>Tentar novamente</button>
              </p>
            )}
            {plansRead && (
              <dl className="audit-plan-counts">
                {(["pending", "in_progress", "completed"] as PlanStatus[]).map((st) => (
                  <div key={st}>
                    <dt>{STATUS_LABELS[st]}</dt>
                    <dd className="numeric">{plans.rows.filter((x) => x.plan.status === st).length}</dd>
                  </div>
                ))}
                <div>
                  <dt>Atrasados</dt>
                  <dd className="numeric">{plans.rows.filter((x) => isOverdue(x.plan)).length}</dd>
                </div>
              </dl>
            )}
          </section>
        )}

        <section className="audit-panel" aria-labelledby="audit-evidence-title">
          <div className="audit-panel-head">
            <h2 id="audit-evidence-title">
              Evidências{evidenceRead && <> <span className="audit-tab-count numeric">{evidence.rows.length}</span></>}
            </h2>
          </div>
          {evidence.loading && <p role="status">Carregando evidências…</p>}
          {evidence.error && (
            <p role="alert">
              Não foi possível carregar evidências.{" "}
              <button type="button" onClick={evidence.reload}>Tentar novamente</button>
            </p>
          )}
          {evidenceRead && !evidence.rows.length && (
            <p className="muted">Nenhuma evidência anexada a esta auditoria.</p>
          )}
          {evidenceItems.length > 0 && (
            <ul className="audit-evidence-groups">
              {evidenceItems.map((item) => (
                <li key={item.key}>
                  <p className="audit-evidence-group-title">
                    Critério <span className="numeric">{itemOf.get(item.key)?.number}</span>
                  </p>
                  <ul className="audit-evidence-list">
                    {evidenceByItem.get(item.key)!.map((e) => (
                      <li key={e.id} className="file-item">
                        <div className="file-body">
                          <strong className="audit-evidence-name">{e.original_name}</strong>
                          <p className="file-meta">
                            {e.uploaded_by_name} · {dateTime(e.uploaded_at)}
                          </p>
                        </div>
                        <div className="file-actions">
                          <Download row={e} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="audit-panel" aria-labelledby="audit-info-title">
          <div className="audit-panel-head">
            <h2 id="audit-info-title">Informações</h2>
          </div>
          <dl className="audit-info">
            <div>
              <dt>Unidade</dt>
              <dd>{summary.unit_name}</dd>
            </div>
            <div>
              <dt>Aplicação</dt>
              <dd className="numeric">{formatDate(summary.applied_on)}</dd>
            </div>
            <div>
              <dt>Visita anterior</dt>
              <dd className="numeric">{summary.previous_visit_on ? formatDate(summary.previous_visit_on) : "—"}</dd>
            </div>
            <div>
              <dt>Responsável</dt>
              <dd>{summary.responsible_name}</dd>
            </div>
            <div>
              <dt>Criada em</dt>
              <dd className="numeric">{dateTime(summary.created_at)}</dd>
            </div>
            <div>
              <dt>Finalizada em</dt>
              <dd className="numeric">{dateTime(summary.finalized_at)}</dd>
            </div>
            <div>
              <dt>Checklist</dt>
              <dd>{summary.template_version}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
