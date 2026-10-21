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

// ---- Analytics read model v2 (docs/briefs/ABC_ANALYTICS_V2.md). Decimals are canonical strings.
export type ClassSplit = { class: ErpClass; count: number; total: string; share: string | null };
export type CompetencySummary = {
  competency: string;
  revision_id: string;
  revision_number: number;
  declared_total: string;
  calculated_total: string;
  difference: string;
  line_count: number;
  published_at: string;
  classes: ClassSplit[];
  unclassified: number;
};
export type Overview = {
  unit: { id: string; code: string; name: string };
  cost_basis: CostBasis;
  bases: CostBasis[];
  competencies: CompetencySummary[];
};
export type ProductRow = {
  rank: number;
  line_no: number;
  code: string;
  name: string;
  unit: string;
  quantity: string;
  unit_cost: string;
  total: string;
  avg_cost: string | null;
  share: string | null;
  cumulative_share: string | null;
  erp_class: ErpClass | null;
  calculated_class: ErpClass | null;
  source_row: number;
};
export type CompetencyProducts = {
  revision: { id: string; number: number; competency: string; cost_basis: CostBasis; declared_total: string;
    calculated_total: string; line_count: number; published_at: string; abc_method: string };
  summary: {
    classes: ClassSplit[];
    unclassified: number;
    matrix: { erp_class: ErpClass | null; calculated_class: ErpClass | null; count: number; total: string }[];
    units: { unit: string; count: number; quantity: string; total: string; share: string | null }[];
  };
  lines: ProductRow[];
};
export type HistoryPoint = {
  competency: string;
  revision_id: string;
  revision_number: number;
  name: string;
  unit: string;
  quantity: string;
  unit_cost: string;
  total: string;
  avg_cost: string | null;
  share: string | null;
  erp_class: ErpClass | null;
  calculated_class: ErpClass | null;
  source_row: number;
};
export type CompareStatus = "up" | "down" | "unchanged" | "new" | "absent" | "not_comparable";
export type CompareSide = { unit: string; quantity: string; unit_cost: string; total: string; avg_cost: string | null;
  erp_class: ErpClass | null; calculated_class: ErpClass | null };
export type CompareItem = {
  code: string;
  name: string;
  status: CompareStatus;
  alert: boolean;
  base: CompareSide | null;
  current: CompareSide | null;
  unit_variation: string | null;
  total_delta: string | null;
  total_variation: string | null;
  price_effect: string | null;
  quantity_effect: string | null;
};
export type Comparison = {
  base: { revision_id: string; number: number; competency: string; total: string; line_count: number };
  current: { revision_id: string; number: number; competency: string; total: string; line_count: number };
  total_delta: string;
  total_variation: string | null;
  summary: {
    counts: Record<"base" | "current" | "up" | "down" | "unchanged" | "new" | "absent" | "not_comparable" | "alerts", number>;
    bridge: Record<"price_effect" | "quantity_effect" | "new" | "absent" | "not_comparable" | "residual", string>;
    common_basket: { items: number; current_total: string; index: string | null };
    by_base_class: { class: string; count: number; base_total: string; current_total: string; delta: string }[];
  };
  items: CompareItem[];
};
export type RevisionRecord = {
  id: string;
  competency: string;
  cost_basis: CostBasis;
  number: number;
  current: boolean;
  reason: string | null;
  published_at: string;
  published_by: string | null;
  declared_total: string;
  calculated_total: string;
  line_count: number;
  warning_count: number;
  original_name: string;
  sha256: string;
  byte_size: number;
};
