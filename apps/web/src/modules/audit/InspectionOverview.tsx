import { useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, type BadgeTone } from "../../shared/ui";
import { isOverdue, STATUS_LABELS, type PlanStatus } from "../action-plans/public";
import { Download } from "./ChecklistEvidence";
import { compareEvidence, evidenceName } from "./evidencePresentation";
import { useInspection } from "./InspectionContext";
import { formatDate } from "./Result";
import {
  CLASSIFICATION_LABELS,
  classify,
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
const EVIDENCE_BATCH_SIZE = 5;
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
  const [criterion, setCriterion] = useState("");
  const [evidenceLimit, setEvidenceLimit] = useState(EVIDENCE_BATCH_SIZE);
  const evidenceListId = useId();
  const base = `/audit/inspections/${summary.id}`;
  const { tally } = results.overall;
  const counts = { AT: tally.at, AP: tally.ap, NAT: tally.nat, NAP: tally.nap };
  const unanswered = tally.total - tally.answered;
  const draft = summary.status === "draft";
  const band = summary.final_classification;
  const openSection = (key: string, item?: string) => {
    select(key, item);
    navigate(`${base}/checklist`);
  };
  const sectionOf = new Map(sections.map((s) => [s.key, s]));
  // Points of attention: AP/NAT criteria, in checklist order, with their observation.
  const attention = items.filter((i) => {
    const r = answers[i.key]?.response;
    return r === "AP" || r === "NAT";
  });
  const evidenceByItem = new Map<string, typeof evidence.rows>();
  for (const row of evidence.rows) {
    const group = evidenceByItem.get(row.item_key);
    if (group) group.push(row);
    else evidenceByItem.set(row.item_key, [row]);
  }
  const evidenceItems = items.filter((item) => evidenceByItem.has(item.key))
    .sort((a, b) => a.number - b.number);
  const selectedCriterion = evidenceByItem.has(criterion) ? criterion : "";
  const resultCount = selectedCriterion ? evidenceByItem.get(selectedCriterion)!.length : evidence.rows.length;
  let remaining = evidenceLimit;
  const visibleGroups = evidenceItems.flatMap((item) => {
    if (remaining <= 0 || (selectedCriterion && selectedCriterion !== item.key)) return [];
    const rows = evidenceByItem.get(item.key)!.sort(compareEvidence).slice(0, remaining);
    remaining -= rows.length;
    return [{ item, rows }];
  });
  const hasMoreEvidence = evidenceLimit < resultCount;
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
              <strong className={`audit-result-value ${classify(results.overall.score) ?? ""} numeric`}>
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
                        onClick={() => openSection(section.key, item.key)}
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
          <section className="audit-panel quiet" aria-labelledby="audit-plans-summary-title">
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

        <section className="audit-panel quiet" aria-labelledby="audit-evidence-title">
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
          {evidenceRead && visibleGroups.length > 0 && (
            <>
              <label className="audit-evidence-filter">
                Filtrar por critério
                <select value={selectedCriterion} onChange={(event) => {
                  setCriterion(event.target.value);
                  setEvidenceLimit(EVIDENCE_BATCH_SIZE);
                }}>
                  <option value="">Todos os critérios</option>
                  {evidenceItems.map((item) => (
                    <option key={item.key} value={item.key}>Critério {item.number}</option>
                  ))}
                </select>
              </label>
              <p className="audit-evidence-count muted" role="status">
                {evidenceLimit < resultCount
                  ? `Exibindo ${evidenceLimit} de ${resultCount} evidências`
                  : resultCount === 1 ? "1 evidência" : `${resultCount} evidências`}
              </p>
              <ul id={evidenceListId} className="audit-evidence-groups">
                {visibleGroups.map(({ item, rows }) => (
                  <li key={item.key}>
                    <h3 className="audit-evidence-group-title">Critério {item.number}</h3>
                    <p className="audit-evidence-question">{item.text}</p>
                    <ul className="audit-overview-files">
                      {rows.map((row, index) => {
                        const name = evidenceName(row.original_name, index);
                        return (
                          <li key={row.id} className="audit-overview-file">
                            <div>
                              <strong className="audit-evidence-name">{name}</strong>
                              <p className="file-meta">
                                {row.uploaded_by_name} · {dateTime(row.uploaded_at)}
                              </p>
                            </div>
                            <div className="audit-overview-file-action">
                              <Download row={row} name={name} filename={row.original_name} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
              {resultCount > EVIDENCE_BATCH_SIZE && (
                <button type="button" className="audit-show-all audit-evidence-more"
                  aria-controls={evidenceListId}
                  onClick={() => setEvidenceLimit((limit) =>
                    hasMoreEvidence ? limit + EVIDENCE_BATCH_SIZE : EVIDENCE_BATCH_SIZE
                  )}>
                  {hasMoreEvidence ? "Ver mais evidências" : "Ver menos evidências"}
                </button>
              )}
            </>
          )}
        </section>

        <section className="audit-panel quiet" aria-labelledby="audit-info-title">
          <div className="audit-panel-head">
            <h2 id="audit-info-title">Informações</h2>
          </div>
          <dl className="audit-info">
            <div>
              <dt>Unidade</dt>
              <dd>{summary.unit_name}</dd>
            </div>
            <div>
              <dt>Data da auditoria</dt>
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
