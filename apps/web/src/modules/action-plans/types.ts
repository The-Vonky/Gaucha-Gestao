export type PlanStatus = "pending" | "in_progress" | "completed";
export type Effectiveness = "effective" | "partially_effective" | "ineffective";
export type Plan = {
  id: string;
  unit_id: string;
  sector_id: string | null;
  source_type: "checklist" | "manual";
  source_inspection_id: string | null;
  source_item_key: string | null;
  source_active: boolean | null;
  source_response: "AP" | "NAT" | null;
  source_observation: string | null;
  source_reactivated_after_verification: boolean;
  improvement_point: string;
  action: string;
  how_to: string;
  responsible: string;
  due_date: string | null;
  status: PlanStatus;
  effectiveness_criterion: string;
  monitoring_start: string | null;
  monitoring_end: string | null;
  expected_evidence: string;
  effectiveness: Effectiveness | null;
  verified_on: string | null;
  verification_notes: string | null;
  verified_by: string | null;
  verified_at: string | null;
  completed_by: string | null;
  completed_at: string | null;
  /** Number of recorded verifications; the open evidence round is this + 1. */
  verification_round: number;
  version: number;
  created_at: string;
  updated_at: string;
};
export type PlanSummary = {
  plan: Plan;
  unit_name: string;
  sector_name: string | null;
  inspection_applied_on: string | null;
  item_number: number | null;
  verified_by_name: string | null;
  completed_by_name: string | null;
};
export type EvidenceKind = "execution" | "verification";
export type Evidence = {
  id: string;
  plan_id: string;
  kind: EvidenceKind;
  /** Null for execution evidence; the verification it supports otherwise. */
  verification_round: number | null;
  object_key: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  created_by: string;
  uploaded_by_name: string;
  uploaded_at: string;
};
export type CreationScope = {
  unit_id: string;
  unit_name: string;
  sector_id: string | null;
  sector_name: string | null;
};
/** Planning fields shared by manual creation and editing. */
export type PlanValues = {
  improvement_point: string;
  action: string;
  how_to: string;
  responsible: string;
  due_date: string | null;
  effectiveness_criterion: string;
  monitoring_start: string | null;
  monitoring_end: string | null;
  expected_evidence: string;
};
type PlanArgs = {
  p_improvement_point: string;
  p_action: string;
  p_how_to: string;
  p_responsible: string;
  p_due_date: string | null;
  p_effectiveness_criterion: string;
  p_monitoring_start: string | null;
  p_monitoring_end: string | null;
  p_expected_evidence: string;
};
export type ActionPlansDatabase = {
  action_plans: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      plan_summaries: {
        Args: { p_plan?: string; p_inspection?: string };
        Returns: PlanSummary[];
      };
      creation_scopes: {
        Args: Record<string, never>;
        Returns: CreationScope[];
      };
      create_manual_plan: {
        Args: PlanArgs & { p_unit: string; p_sector: string | null };
        Returns: string;
      };
      update_plan: {
        Args: PlanArgs & { p_id: string; p_version: number };
        Returns: undefined;
      };
      set_plan_status: {
        Args: { p_id: string; p_version: number; p_status: PlanStatus };
        Returns: undefined;
      };
      verify_plan: {
        Args: {
          p_id: string;
          p_version: number;
          p_effectiveness: Effectiveness;
          p_verified_on: string;
          p_notes: string;
          p_expected_evidence_ids: string[];
        };
        Returns: undefined;
      };
      plan_evidence: { Args: { p_plan: string }; Returns: Evidence[] };
      begin_evidence_upload: {
        Args: {
          p_plan: string;
          p_kind: EvidenceKind;
          p_original_name: string;
          p_content_type: string;
          p_size: number;
        };
        Returns: { evidence_id: string; object_key: string }[];
      };
      confirm_evidence_upload: {
        Args: { p_evidence: string };
        Returns: undefined;
      };
      remove_evidence: { Args: { p_evidence: string }; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
