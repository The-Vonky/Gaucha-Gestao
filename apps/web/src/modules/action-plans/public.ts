/**
 * Public read contract of Action Plans for other modules (ADR-003, integration
 * rule): query the plans the caller's scope allows for one source inspection and
 * present their state with this module's own labels. Other modules import only
 * from this file, never from Action Plans internals, and never write plans.
 */
import { summaries } from "./api";
import type { PlanSummary } from "./types";
export type { Plan, PlanStatus, PlanSummary } from "./types";
export { PlanBadges } from "./PlanBadges";
export { STATUS_LABELS, isInactiveSource, isOverdue, queueRank } from "./lifecycle";
/** Plans whose source is the given Audit inspection, within the caller's scope (RLS). */
export function plansForInspection(inspectionId: string): Promise<PlanSummary[]> {
  return summaries({ p_inspection: inspectionId });
}
