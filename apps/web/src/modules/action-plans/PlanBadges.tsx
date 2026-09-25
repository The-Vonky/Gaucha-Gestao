import {
  effectivenessState,
  isInactiveSource,
  isOverdue,
  STATUS_LABELS,
} from "./lifecycle";
import type { Plan } from "./types";
/** Textual state badges; color is supplementary. */
export function PlanBadges({ plan }: { plan: Plan }) {
  return (
    <span className="ap-badges">
      <span className={`badge ${plan.status === "completed" ? "active" : ""}`}>
        {STATUS_LABELS[plan.status]}
      </span>
      {isOverdue(plan) && <span className="badge danger">Atrasado</span>}
      {plan.status === "completed" && (
        <span
          className={`badge ${plan.effectiveness === "effective" ? "active" : plan.effectiveness ? "danger" : "warning"}`}
        >
          {effectivenessState(plan)}
        </span>
      )}
      {isInactiveSource(plan) && (
        <span className="badge">Origem inativa (histórico)</span>
      )}
      {plan.source_reactivated_after_verification && (
        <span className="badge warning">Origem reativada após verificação</span>
      )}
    </span>
  );
}
export function originLabel(plan: Plan) {
  return plan.source_type === "manual"
    ? "Manual"
    : `Checklist · ${plan.source_response}`;
}
