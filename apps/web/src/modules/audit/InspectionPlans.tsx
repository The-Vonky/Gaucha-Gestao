import { Link } from "react-router-dom";
import { Notice } from "../../shared/ui";
import {
  PlanBadges,
  queueRank,
  STATUS_LABELS,
  type PlanStatus,
} from "../action-plans/public";
import { useInspection } from "./InspectionContext";
import { formatDate } from "./Result";
const STATUSES: PlanStatus[] = ["pending", "in_progress", "completed"];
/** Action plan tab: read-only view of this inspection's plans through the public contract. */
export function InspectionPlans() {
  const { summary, plans } = useInspection();
  const rows = [...plans.rows].sort(
    (a, b) =>
      queueRank(a.plan) - queueRank(b.plan) ||
      (a.item_number ?? 0) - (b.item_number ?? 0),
  );
  const read = !plans.loading && !plans.error;
  const count = (status: PlanStatus) => rows.filter((x) => x.plan.status === status).length;
  return (
    <section className="audit-panel" aria-labelledby="audit-plans-title">
      <div className="audit-panel-head">
        <h2 id="audit-plans-title">
          Planos de ação
          {/* Counted only after a successful read: loading/error is not zero plans. */}
          {read && <> <span className="audit-tab-count numeric">{rows.length}</span></>}
        </h2>
        <Link className="button-link" to={`/action-plans?inspection=${summary.id}`}>
          Abrir na fila de Planos de Ação
        </Link>
      </div>
      <p className="muted">
        Planos gerados pelas respostas AP e NAT desta auditoria. A execução e a
        verificação acontecem em Planos de Ação.
      </p>
      {plans.loading && <p role="status">Carregando planos de ação…</p>}
      {plans.error && (
        <Notice error>
          {plans.error} <button onClick={plans.reload}>Tentar novamente</button>
        </Notice>
      )}
      {read && (
        <>
          <dl className="audit-plan-counts">
            {STATUSES.map((s) => (
              <div key={s}>
                <dt>{STATUS_LABELS[s]}</dt>
                <dd className="numeric">{count(s)}</dd>
              </div>
            ))}
          </dl>
          {!rows.length ? (
            <p className="muted">Nenhum plano de ação para esta auditoria.</p>
          ) : (
            <ul className="audit-plans">
              {rows.map(({ plan, item_number }) => (
                <li key={plan.id}>
                  <div className="audit-plan-main">
                    <Link to={`/action-plans/${plan.id}`}>
                      {item_number ? `${item_number}. ` : ""}
                      {plan.improvement_point}
                    </Link>
                    <PlanBadges plan={plan} />
                  </div>
                  <p className="audit-plan-meta">
                    <span>
                      {plan.source_type === "manual" ? "Manual" : `Origem ${plan.source_response}`}
                    </span>
                    <span>Responsável: {plan.responsible || "—"}</span>
                    <span>
                      Prazo: <span className="numeric">{formatDate(plan.due_date)}</span>
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
