import type { Classification, Response } from "./scoring";
import type { HistoryReport, InspectionReport } from "./reporting/types";
export type Section = {
  template_version: string;
  key: string;
  position: number;
  name: string;
};
export type Item = {
  template_version: string;
  key: string;
  section_key: string;
  position: number;
  number: number;
  text: string;
};
export type Answer = {
  inspection_id: string;
  template_version: string;
  item_key: string;
  response: Response | null;
  observation: string;
  version: number;
  updated_at: string;
  updated_by: string | null;
};
export type AuditUnit = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};
export type Status = "draft" | "finalized";
export type InspectionSummary = {
  id: string;
  unit_id: string;
  unit_name: string;
  template_version: string;
  applied_on: string;
  previous_visit_on: string | null;
  responsible_id: string;
  responsible_name: string;
  status: Status;
  final_score: number | null;
  final_classification: Classification | null;
  finalized_at: string | null;
  version: number;
  created_at: string;
  total_items: number;
  answered: number;
  at_count: number;
  ap_count: number;
  nat_count: number;
  nap_count: number;
};
export type ChecklistEvidence={
 id:string;inspection_id:string;item_key:string;object_key:string;original_name:string;content_type:string;size_bytes:number;created_by:string;uploaded_by_name:string;uploaded_at:string;
};
type ReadOnly<R> = {
  Row: R;
  Insert: never;
  Update: Partial<R>;
  Relationships: [];
};
export type AuditDatabase = {
  audit: {
    Tables: {
      checklist_sections: ReadOnly<Section>;
      checklist_items: ReadOnly<Item>;
      inspection_answers: ReadOnly<Answer>;
    };
    Views: Record<string, never>;
    Functions: {
      checklist_evidence: { Args:{p_inspection:string;p_item_key?:string|null};Returns:ChecklistEvidence[] };
      checklist_evidence_pending_count:{Args:{p_inspection:string};Returns:number};
      begin_checklist_evidence_upload:{Args:{p_inspection:string;p_item_key:string;p_original_name:string;p_content_type:string;p_size:number};Returns:{evidence_id:string;object_key:string}[]};
      confirm_checklist_evidence_upload:{Args:{p_evidence:string};Returns:undefined};
      remove_checklist_evidence:{Args:{p_evidence:string};Returns:undefined};
      inspection_export: { Args: { p_inspection: string }; Returns: InspectionReport };
      unit_history_export: { Args: { p_unit: string; p_from: string | null; p_to: string | null }; Returns: HistoryReport };
      units: { Args: Record<string, never>; Returns: AuditUnit[] };
      inspection_summaries: {
        Args: { p_unit?: string; p_inspection?: string; p_overview?: boolean };
        Returns: InspectionSummary[];
      };
      create_inspection: {
        Args: {
          p_unit: string;
          p_applied_on: string;
          p_previous_visit_on: string | null;
        };
        Returns: string;
      };
      finalize_inspection: {
        Args: { p_id: string; p_version: number; p_expected_evidence_ids: string[] };
        Returns: undefined;
      };
      reopen_inspection: {
        Args: { p_id: string; p_version: number };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
