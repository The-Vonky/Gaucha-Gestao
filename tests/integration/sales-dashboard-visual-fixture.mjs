// Fixture exclusiva do navegador. Todas as somas/oráculos abaixo usam centavos BigInt.
export function visualFixture(d, combined = false, dailyMonth = "2026-09-01") {
  const seed = d.months[0], units = d.units, dailySeed = d.daily.totals[0];
  const cents = value => BigInt(value.replace(".", ""));
  const decimal = n => `${n < 0n ? "-" : ""}${(n < 0n ? -n : n) / 100n}.${String((n < 0n ? -n : n) % 100n).padStart(2, "0")}`;
  const sum = values => values.reduce((a, value) => a + cents(value), 0n);
  const divide = (n, divisor) => (n + divisor / 2n) / divisor;
  const change = (n, previous) => {
    if (!previous) return null;
    const delta = n - previous, absolute = delta < 0n ? -delta : delta;
    const ratio = divide(absolute * 100_000_000n, previous);
    return `${delta < 0n ? "-" : ""}${ratio / 1_000_000n}.${String(ratio % 1_000_000n).padStart(6, "0")}`;
  };
  const amounts = [18000000n, 24000000n, 21000000n, 32000000n, 28000000n, 15000000n];
  const days = [30, 31, 30, 31, 31, 30];
  const amount = value => combined ? value * 6n / 5n : value;
  d.months = amounts.map((value, i) => {
    const total = amount(value), partial = i === 5, baseDays = partial ? 15 : days[i];
    const reference = i ? partial ? amount(amounts[i - 1]) / BigInt(days[i - 1]) * 15n : amount(amounts[i - 1]) : null;
    const variation = reference === null ? null : change(total, reference);
    return { ...seed, competency: `2026-${String(i + 4).padStart(2, "0")}-01`, days_in_month: days[i], total: decimal(total), stone: decimal(value), pix: decimal(value / 5n), daily_total: decimal(total), adjustment_total: "0.00", partial, is_closed: !partial, last_day_with_data: baseDays, daily_average: decimal(divide(total, BigInt(baseDays))), projection: partial ? decimal(total * 2n) : null, projection_is_estimate: partial, comparison: { ...seed.comparison, reference_month: i ? `2026-${String(i + 3).padStart(2, "0")}-01` : null, cutoff_day: partial ? 15 : null, current_amount: decimal(total), reference_amount: reference === null ? null : decimal(reference), available: i > 0, variation_pct: variation, trend: variation === null ? "unavailable" : variation.startsWith("-") ? "down" : "up" } };
  });
  d.unit_months = d.months.flatMap(m => units.map((u, i) => {
    const part = value => decimal(cents(value) * (i ? 2n : 3n) / 5n);
    return { ...d.unit_months[i], unit_id: u.id, competency: m.competency, total: part(m.total), stone: part(m.stone), pix: part(m.pix), daily_total: part(m.total), adjustment_total: "0.00" };
  }));
  d.ranking = d.ranking.map((r, i) => {
    const part = key => decimal(sum(d.unit_months.filter(c => c.unit_id === units[i].id).map(c => c[key])));
    return { ...r, total: part("total"), stone: part("stone"), pix: part("pix"), share_pct: i ? "40.000000" : "60.000000" };
  });
  const total = sum(d.months.map(m => m.total)), stone = sum(d.months.map(m => m.stone)), pix = sum(d.months.map(m => m.pix));
  d.summary = { ...d.summary, total: decimal(total), stone: decimal(stone), pix: decimal(pix), daily_total: decimal(total), adjustment_total: "0.00", monthly_average: decimal(divide(total, 6n)), daily_average: decimal(divide(total, 168n)), latest: d.months.at(-1), best_closed: d.months[3], leader: d.ranking[0] };
  d.insights = { strongest_advance: d.months[3], largest_decline: d.months[2], pace: { ...d.insights.pace, comparison: d.months.at(-1).comparison, reference_month: "2026-08-01", projection: d.months.at(-1).projection, projected_variation_pct: "7.142857" } };
  const focused = d.months.find(m => m.competency === dailyMonth);
  const reference = d.months.find(m => m.competency === focused?.comparison.reference_month);
  d.daily = { competency: focused?.competency ?? null, reference_month: reference?.competency ?? null,
    cutoff_day: focused?.partial ? focused.last_day_with_data : null, points: [], totals: [] };
  d.daily.totals = [reference, focused].filter(Boolean).flatMap(m => {
    const days = m.last_day_with_data;
    const through = (value, day) => day === days ? cents(value) : cents(value) / BigInt(days) * BigInt(day);
    return Array.from({ length: days }, (_, i) => ({ ...dailySeed, competency: m.competency,
      sale_date: `${m.competency.slice(0, 8)}${String(i + 1).padStart(2, "0")}`, day: i + 1,
      total: decimal(through(m.total, i + 1) - through(m.total, i)), cumulative: decimal(through(m.total, i + 1)),
      stone: decimal(through(m.stone, i + 1) - through(m.stone, i)), pix: decimal(through(m.pix, i + 1) - through(m.pix, i)),
      cumulative_stone: decimal(through(m.stone, i + 1)), cumulative_pix: decimal(through(m.pix, i + 1)) }));
  });
  d.daily.points = d.daily.totals.map(p => ({ ...p, unit_id: units[0].id, has_elapsed: true }));
  d.payment_mix = { stone: decimal(stone), pix: decimal(pix), stone_share_pct: "83.333333", pix_share_pct: "16.666667" };
  d.metadata.first_available_month = "2026-04-01";
  d.filters.from = "2026-04-01"; d.filters.to = "2026-09-01";
  return d;
}
