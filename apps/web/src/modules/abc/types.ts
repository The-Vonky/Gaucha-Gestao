/** Decimal values travel as canonical strings ("1234.5"); never as JS numbers. */
export type ErpClass = "A" | "B" | "C";
export type CostBasis = "NET_PERIOD" | "GROSS_PERIOD";

export type ReportLine = {
  line_no: number;
  code: string;
  name: string;
  unit: string;
  quantity: string;
  unit_cost: string;
  total: string;
  /** Percentage points ("12.5" = 12,5%), as printed by the ERP. */
  source_share: string | null;
  erp_class: ErpClass | null;
  sheet: string;
  row: number;
};

export type ReportSubtotal = { class: ErpClass; total: string };

/** Payload accepted by abc.publish_revision. */
export type ReportPayload = {
  unit_code: string;
  period_start: string;
  period_end: string;
  cost_basis: CostBasis;
  cost_basis_text: string;
  declared_total: string;
  subtotals: ReportSubtotal[];
  lines: ReportLine[];
  parser_version: string;
  file_sha256: string;
  content_hash: string;
  warnings: string[];
};

export type UnitSummary = {
  unit_id: string;
  code: string;
  name: string;
  series_count: number;
  last_competency: string | null;
  can_publish: boolean;
};

export type SeriesSummary = {
  series_id: string;
  competency: string;
  cost_basis: CostBasis;
  version: number;
  revision_id: string;
  revision_number: number;
  declared_total: string;
  calculated_total: string;
  line_count: number;
  published_at: string;
};

export type RevisionLine = {
  line_no: number;
  code: string;
  name: string;
  unit: string;
  quantity: string;
  unit_cost: string;
  total: string;
  source_share: string | null;
  erp_class: ErpClass | null;
  calculated_class: ErpClass | null;
  share: string | null;
};

export type RevisionDetail = {
  id: string;
  number: number;
  reason: string | null;
  current: boolean;
  series: { id: string; competency: string; cost_basis: CostBasis; version: number };
  unit: { id: string; code: string; name: string };
  period_start: string;
  period_end: string;
  cost_basis_text: string;
  declared_total: string;
  calculated_total: string;
  difference: string;
  parser_version: string;
  abc_method: string;
  content_hash: string;
  warnings: string[];
  published_at: string;
  published_by: string | null;
  file: { object_key: string; original_name: string; sha256: string; byte_size: number };
  history: { id: string; number: number; reason: string | null; published_at: string; declared_total: string }[];
  lines: RevisionLine[];
};
