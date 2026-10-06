import type { BadgeTone } from "../../shared/ui";
import type { InspectionSummary } from "./types";
/**
 * Unit situation derived only from inspection_summaries (Audit UX v2, §4.2 / D6):
 * - attention: the latest finalized result is partial or inadequate;
 * - in_progress: a draft exists and the unit is not in attention;
 * - adequate: the latest finalized result is adequate and no draft exists;
 * - no_data: no finalized result with a score and no draft.
 */
export type Situation = "attention" | "in_progress" | "adequate" | "no_data";
export const SITUATION_ORDER: Situation[] = ["attention", "in_progress", "adequate", "no_data"];
export const SITUATION_LABELS: Record<Situation, string> = {
  attention: "Em atenção",
  in_progress: "Em andamento",
  adequate: "Adequada",
  no_data: "Sem dados",
};
export type UnitState = {
  situation: Situation;
  /** Rows are newest first, as returned by the contract. */
  latest: InspectionSummary | undefined;
  drafts: InspectionSummary[];
  finalized: InspectionSummary[];
  /** Latest finalized inspection with a score (the unit's current conformity). */
  current: InspectionSummary | undefined;
  /** Finalized inspection right before `current`, for the trend. */
  previous: InspectionSummary | undefined;
};
export function unitState(rows: InspectionSummary[]): UnitState {
  const drafts = rows.filter((r) => r.status === "draft");
  const finalized = rows.filter((r) => r.status === "finalized");
  const latestFinal = finalized[0];
  const current = latestFinal?.final_score !== null ? latestFinal : undefined;
  const previous = current ? finalized[1] : undefined;
  const band = current?.final_classification;
  const situation: Situation =
    band === "partial" || band === "inadequate"
      ? "attention"
      : drafts.length
        ? "in_progress"
        : band === "adequate"
          ? "adequate"
          : "no_data";
  return { situation, latest: rows[0], drafts, finalized, current, previous };
}
/** Badge tone: attention follows its worst band; never a band color for drafts. */
export function situationTone(state: UnitState): BadgeTone {
  if (state.situation === "attention")
    return state.current?.final_classification === "inadequate" ? "danger" : "warning";
  if (state.situation === "in_progress") return "info";
  if (state.situation === "adequate") return "success";
  return "neutral";
}
