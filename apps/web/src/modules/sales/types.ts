/** Dinheiro atravessa a API como string; nunca converter para Number/parseFloat. */
export type DecimalAmount = string;
export type PaymentMethod = "Stone" | "PIX";
export type SalesUnit = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  can_read: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
};

export type SalesEntry = {
  id: string;
  sale_date: string;
  unit_id: string;
  payment_method: PaymentMethod;
  amount: DecimalAmount;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  deleted_at: string | null;
  deleted_by: string | null;
};

export type EntryInput = {
  sale_date: string;
  unit_id: string;
  payment_method: PaymentMethod;
  amount: DecimalAmount;
};

export type EntryFilters = {
  from?: string;
  to?: string;
  unit_id?: string;
  payment_method?: PaymentMethod;
  limit?: number;
  offset?: number;
};

/** Competências são datas civis ISO no primeiro dia do mês. */
export type DashboardFilters = {
  from: string;
  to: string;
  unit_ids?: string[];
  scope?: "stone" | "combined";
  daily_month?: string;
};
/** Percentuais/razões derivados, serializados com seis casas decimais. */
export type DecimalRatio = string;
export type SalesComparison = {
  reference_month: string | null;
  cutoff_day: number | null;
  current_amount: DecimalAmount;
  reference_amount: DecimalAmount | null;
  available: boolean;
  variation_pct: DecimalRatio | null;
  trend: "up" | "down" | "neutral" | "unavailable";
};
export type SalesMonth = {
  competency: string;
  days_in_month: number;
  last_day_with_data: number;
  partial: boolean | null;
  is_closed: boolean | null;
  status_basis: "snapshot" | "derived" | "scoped_dates" | "historical_unavailable";
  stone: DecimalAmount;
  pix: DecimalAmount;
  total: DecimalAmount;
  daily_total: DecimalAmount;
  adjustment_total: DecimalAmount;
  daily_average: DecimalAmount | null;
  projection: DecimalAmount | null;
  projection_is_estimate: boolean;
  comparison: SalesComparison;
  reconciliation_difference: DecimalAmount;
};
export type SalesRanking = {
  unit_id: string;
  position: number;
  total: DecimalAmount;
  stone: DecimalAmount;
  pix: DecimalAmount;
  share_pct: DecimalRatio;
};
export type SalesUnitMonth = Pick<SalesMonth,
  "competency" | "stone" | "pix" | "total" | "daily_total" | "adjustment_total"> & {
  unit_id: string;
  intensity: DecimalRatio;
};
export type SalesDailyPoint = {
  competency: string;
  sale_date: string;
  day: number;
  unit_id: string;
  has_elapsed: boolean;
  stone: DecimalAmount;
  pix: DecimalAmount;
  total: DecimalAmount;
  cumulative: DecimalAmount;
  cumulative_stone: DecimalAmount;
  cumulative_pix: DecimalAmount;
};
export type SalesDashboard = {
  contract_version: 1;
  filters: { from: string; to: string; unit_ids: string[]; scope: "stone" | "combined" };
  units: { id: string; code: string; name: string; active: boolean }[];
  metadata: {
    global_status_visible: boolean;
    money_scale: 2;
    ratio_scale: 6;
    rounding: "half_away_from_zero";
    first_available_month: string | null;
    latest_available_month: string | null;
    missing_months: string[];
  };
  summary: {
    total: DecimalAmount;
    stone: DecimalAmount;
    pix: DecimalAmount;
    daily_total: DecimalAmount;
    adjustment_total: DecimalAmount;
    daily_average: DecimalAmount | null;
    monthly_average: DecimalAmount | null;
    latest: SalesMonth | null;
    best_closed: SalesMonth | null;
    leader: SalesRanking | null;
    top_two_share_pct: DecimalRatio | null;
    reconciliation_difference: DecimalAmount;
  };
  months: SalesMonth[];
  ranking: SalesRanking[];
  /** Matriz comum para evolução por unidade, empilhadas e heatmap. */
  unit_months: SalesUnitMonth[];
  /** A composição sempre mostra ambos; o total selecionado respeita scope. */
  payment_mix: {
    stone: DecimalAmount; pix: DecimalAmount;
    stone_share_pct: DecimalRatio | null; pix_share_pct: DecimalRatio | null;
  };
  daily: {
    competency: string | null;
    reference_month: string | null;
    cutoff_day: number | null;
    points: SalesDailyPoint[];
    totals: Omit<SalesDailyPoint, "unit_id" | "has_elapsed">[];
  };
  insights: {
    strongest_advance: SalesMonth | null;
    largest_decline: SalesMonth | null;
    pace: {
      competency: string;
      projection: DecimalAmount | null;
      is_estimate: boolean;
      reference_month: string | null;
      projected_variation_pct: DecimalRatio | null;
      comparison: SalesComparison;
    } | null;
  };
};
