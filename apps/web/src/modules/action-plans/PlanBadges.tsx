import { Badge, type BadgeTone } from "../../shared/ui";
import {
  effectivenessState,
  isInactiveSource,
  isOverdue,
  STATUS_LABELS,
} from "./lifecycle";
import type { Plan, PlanStatus } from "./types";
const STATUS_TONE: Record<PlanStatus, BadgeTone> = {
  pending: "neutral",
  in_progress: "info",
  completed: "success",
};
/** Textual state badges; color is supplementary. */
export function PlanBadges({ plan }: { plan: Plan }) {
  return (
    <span className="ap-badges">
      <Badge tone={STATUS_TONE[plan.status]}>
        {STATUS_LABELS[plan.status]}
      </Badge>
      {isOverdue(plan) && (
        <Badge tone="danger" icon="warning">
          Atrasado
        </Badge>
      )}
      {plan.status === "completed" && (
        <Badge
          // Awaiting verification and partially effective both ask for attention.
          tone={
            plan.effectiveness === "effective"
              ? "success"
              : plan.effectiveness === "ineffective"
                ? "danger"
                : "warning"
          }
        >
          {effectivenessState(plan)}
        </Badge>
      )}
      {isInactiveSource(plan) && <Badge>Origem inativa (histórico)</Badge>}
      {plan.source_reactivated_after_verification && (
        <Badge tone="warning" icon="warning">
          Origem reativada após verificação
        </Badge>
      )}
    </span>
  );
}
export function originLabel(plan: Plan) {
  return plan.source_type === "manual"
    ? "Manual"
    : `Checklist · ${plan.source_response}`;
}
