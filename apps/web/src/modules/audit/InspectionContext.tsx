import { createContext, useContext, type RefObject } from "react";
import type { PlanSummary } from "../action-plans/public";
import type { EvidenceController } from "./useChecklistEvidence";
import type { Result } from "./scoring";
import type { Answer, InspectionSummary, Item, Section } from "./types";
/**
 * Read model the inspection shell (InspectionPage) hands to its tabs. The shell
 * stays the single owner of every piece of state: answers saved in this load,
 * pending saves, stale/lifecycle guards, evidence and the section cursor.
 */
export type InspectionView = {
  summary: InspectionSummary;
  sections: Section[];
  items: Item[];
  answers: Record<string, Answer>;
  results: { overall: Result; sections: Record<string, Result> };
  editable: boolean;
  stale: boolean;
  /** A lifecycle confirmation is open (evidence edits pause meanwhile). */
  confirming: boolean;
  evidence: EvidenceController;
  current: Section;
  index: number;
  select: (key: string) => void;
  heading: RefObject<HTMLHeadingElement | null>;
  onChange: (row: Answer) => void;
  onPending: (key: string, value: boolean) => void;
  onConflict: () => void;
  /** Plans of this inspection (Action Plans public contract); enabled with action_plan.read. */
  plans: {
    enabled: boolean;
    rows: PlanSummary[];
    loading: boolean;
    error: string;
    reload: () => void;
  };
};
const InspectionContext = createContext<InspectionView | null>(null);
export const InspectionProvider = InspectionContext.Provider;
export function useInspection(): InspectionView {
  const view = useContext(InspectionContext);
  if (!view) throw new Error("useInspection must be used inside InspectionPage.");
  return view;
}
