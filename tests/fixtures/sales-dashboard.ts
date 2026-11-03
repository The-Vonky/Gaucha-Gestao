import type { SalesDashboard, SalesMonth } from "../../apps/web/src/modules/sales/types";
export const A = "10000000-0000-0000-0000-000000000001", B = "10000000-0000-0000-0000-000000000002", C = "10000000-0000-0000-0000-000000000003";
/** Oráculo sintético: 100+150 Stone, 20+30 PIX, ajuste Stone=50, corte2/dias30. */
export function dashboardFixture(combined = false): SalesDashboard {
  const total = combined ? "350.00" : "300.00", daily = combined ? "300.00" : "250.00", projection = combined ? "4500.00" : "3750.00";
  const month: SalesMonth = { competency: "2026-09-01", days_in_month: 30, last_day_with_data: 2, partial: true, is_closed: false, status_basis: "snapshot",
    stone: "300.00", pix: "50.00", total, daily_total: daily, adjustment_total: "50.00", daily_average: combined ? "175.00" : "150.00", projection,
    projection_is_estimate: true, comparison: { reference_month: "2026-07-01", cutoff_day: 2, current_amount: daily, reference_amount: "200.00", available: true, variation_pct: combined ? "50.000000" : "25.000000", trend: "up" }, reconciliation_difference: "0.00" };
  const ranking = [
    { unit_id: A, position: 1, stone: "200.00", pix: "30.00", total: combined ? "230.00" : "200.00", share_pct: combined ? "65.714286" : "66.666667" },
    { unit_id: B, position: 2, stone: "100.00", pix: "20.00", total: combined ? "120.00" : "100.00", share_pct: combined ? "34.285714" : "33.333333" },
  ];
  const totals = [1, 2, 3].map(day => ({ competency: "2026-09-01", sale_date: `2026-09-0${day}`, day,
    stone: day === 1 ? "100.00" : day === 2 ? "150.00" : "0.00", pix: day === 1 ? "20.00" : day === 2 ? "30.00" : "0.00",
    total: day === 1 ? combined ? "120.00" : "100.00" : day === 2 ? combined ? "180.00" : "150.00" : "0.00",
    cumulative: day === 1 ? combined ? "120.00" : "100.00" : daily, cumulative_stone: day === 1 ? "100.00" : "250.00", cumulative_pix: day === 1 ? "20.00" : "50.00" }));
  const previous = [1, 2].map(day => ({ ...totals[day - 1], competency: "2026-07-01", sale_date: `2026-07-0${day}`, total: "100.00", cumulative: day === 1 ? "100.00" : "200.00" }));
  return { contract_version: 1, filters: { from: "2026-09-01", to: "2026-09-01", unit_ids: [A, B], scope: combined ? "combined" : "stone" },
    units: [{ id: A, code: "A", name: "Unidade Alfa", active: true }, { id: B, code: "B", name: "Histórica Beta", active: false }],
    metadata: { global_status_visible: true, money_scale: 2, ratio_scale: 6, rounding: "half_away_from_zero", first_available_month: "2026-07-01", latest_available_month: "2026-09-01", missing_months: [] },
    summary: { total, stone: "300.00", pix: "50.00", daily_total: daily, adjustment_total: "50.00", daily_average: month.daily_average, monthly_average: total, latest: month, best_closed: null, leader: ranking[0], top_two_share_pct: "100.000000", reconciliation_difference: "0.00" },
    months: [month], ranking, unit_months: ranking.map((r, i) => ({ ...r, competency: month.competency, daily_total: i === 0 ? combined ? "180.00" : "150.00" : r.total, adjustment_total: i === 0 ? "50.00" : "0.00", intensity: i === 0 ? "1.000000" : "0.500000" })),
    payment_mix: { stone: "300.00", pix: "50.00", stone_share_pct: "85.714286", pix_share_pct: "14.285714" },
    daily: { competency: month.competency, reference_month: "2026-07-01", cutoff_day: 2, totals: [...previous, ...totals], points: [...previous, ...totals].map(p => ({ ...p, unit_id: A, has_elapsed: p.day <= 2 })) },
    insights: { strongest_advance: null, largest_decline: null, pace: { competency: month.competency, projection, is_estimate: true, reference_month: "2026-07-01", projected_variation_pct: combined ? "2150.000000" : "1775.000000", comparison: month.comparison } } };
}
