import type { Classification, Response } from "../scoring";
import type { Status } from "../types";

export type Counts = {
  total: number;
  answered: number;
  unanswered: number;
  applicable: number;
  at: number;
  ap: number;
  nat: number;
  nap: number;
};
export type Metadata = {
  schema_version: 1;
  generated_at: string;
  display_timezone: "America/Sao_Paulo";
  generated_by: { id: string; name: string };
  unit: { id: string; code: string; name: string };
};
export type ReportInspection = {
  id: string;
  unit_id?: string;
  template_version: string;
  applied_on: string;
  previous_visit_on: string | null;
  responsible_id: string;
  responsible_name: string;
  status: Status;
  counts: Counts;
  progress_percent: number;
  score: number | null;
  classification: Classification | null;
  finalized_at: string | null;
  version: number;
  created_at: string;
  updated_at?: string;
  finalized_by?: string | null;
  finalized_by_name?: string | null;
  delta_pp?: number | null;
};
export type Criterion = {
  key: string;
  position: number;
  number: number;
  text: string;
  response: Response | null;
  observation: string | null;
  version: number | null;
  updated_at: string | null;
};
export type ReportSection = {
  key: string;
  position: number;
  name: string;
  counts: Counts;
  score: number | null;
  complete: boolean;
  classification: Classification | null;
  items: Criterion[];
};
export type InspectionReport = Metadata & {
  kind: "inspection";
  record_count: 1;
  inspection: ReportInspection;
  sections: ReportSection[];
};
export type HistoryReport = Metadata & {
  kind: "unit_history";
  filters: { from: string | null; to: string | null };
  ordering: string;
  record_count: number;
  records: ReportInspection[];
};
export type AuditReport = InspectionReport | HistoryReport;
