import { Link } from "react-router-dom";
import { useInspection } from "./InspectionContext";
import { RESPONSE_LABELS, RESPONSES } from "./scoring";
/** Overview tab: operational summary of one inspection (data already loaded by the shell). */
export function InspectionOverview() {
  const { summary, results, editable } = useInspection();
  const { tally } = results.overall;
  const counts = { AT: tally.at, AP: tally.ap, NAT: tally.nat, NAP: tally.nap };
  const unanswered = tally.total - tally.answered;
  const draft = summary.status === "draft";
  return (
    <div className="audit-overview">
      <section className="audit-panel" aria-labelledby="audit-counts-title">
        <div className="audit-panel-head">
          <h2 id="audit-counts-title">Respostas</h2>
          <Link className="button-link" to={`/audit/inspections/${summary.id}/checklist`}>
            {draft && editable ? "Continuar checklist" : "Abrir checklist"}
          </Link>
        </div>
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
    </div>
  );
}
