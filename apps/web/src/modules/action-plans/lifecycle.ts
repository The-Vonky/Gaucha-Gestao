import { today } from "../../shared/dates";
import type { Effectiveness, Plan, PlanStatus } from "./types";
export const STATUS_LABELS: Record<PlanStatus, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  completed: "Concluído",
};
export const EFFECTIVENESS_LABELS: Record<Effectiveness, string> = {
  effective: "Eficaz",
  partially_effective: "Parcialmente eficaz",
  ineffective: "Ineficaz",
};
/** Overdue is computed, never stored. */
export function isOverdue(
  plan: Pick<Plan, "due_date" | "status">,
  date = today(),
) {
  return plan.status !== "completed" && !!plan.due_date && plan.due_date < date;
}
const REQUIRED: [keyof Plan, string][] = [
  ["improvement_point", "Ponto de melhoria"],
  ["action", "O que fazer"],
  ["how_to", "Como fazer"],
  ["responsible", "Responsável"],
  ["due_date", "Prazo"],
  ["effectiveness_criterion", "Critério de eficácia"],
  ["expected_evidence", "Evidência esperada"],
];
/** Fields still required before a plan can move to Em andamento/Concluído (mirrors plans_ready). */
export function missingForExecution(plan: Plan): string[] {
  return REQUIRED.filter(([key]) => !String(plan[key] ?? "").trim()).map(
    ([, label]) => label,
  );
}
export function effectivenessState(plan: Plan): string {
  if (plan.status !== "completed") return "Eficácia não avaliada";
  return plan.effectiveness
    ? EFFECTIVENESS_LABELS[plan.effectiveness]
    : "Aguardando verificação de eficácia";
}
/** Hidden from the default queue: checklist plans whose source is no longer AP/NAT. */
export function isInactiveSource(plan: Plan) {
  return plan.source_type === "checklist" && !plan.source_active;
}
/** Operational queue order: overdue, checklist NAT, open, awaiting verification, history. */
export function queueRank(plan: Plan, date = today()) {
  if (isOverdue(plan, date)) return 0;
  if (plan.status !== "completed")
    return plan.source_type === "checklist" &&
      plan.source_active &&
      plan.source_response === "NAT"
      ? 1
      : 2;
  return plan.effectiveness ? 4 : 3;
}
