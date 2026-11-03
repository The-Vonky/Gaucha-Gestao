// @vitest-environment jsdom
import React from "react";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DailyAnalysis, Heatmap, MonthlyEvolution, Ranking, Stacked } from "../apps/web/src/modules/sales/DashboardCharts";
import { dashboardFixture } from "./fixtures/sales-dashboard";

it("VEN-04B suporta 100 unidades ×24 meses e6200 pontos sem truncar agregados nem criar um nó por ponto unitário diário", () => {
  const data = dashboardFixture();
  data.units = Array.from({ length: 100 }, (_, i) => ({ id: `10000000-0000-0000-0000-${String(i).padStart(12, "0")}`, code: `U${i}`, name: `Sintética ${i}`, active: true }));
  data.months = Array.from({ length: 24 }, (_, i) => ({ ...data.months[0], competency: `${2040 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, "0")}-01`, total: "100.00", partial: false, last_day_with_data: 31 }));
  data.filters = { from: "2040-01-01", to: "2041-12-01", unit_ids: data.units.map(u => u.id), scope: "stone" };
  data.unit_months = data.months.flatMap(m => data.units.map(u => ({ ...data.unit_months[0], competency: m.competency, unit_id: u.id, total: "1.00", intensity: "1.000000" })));
  data.ranking = data.units.map((u, i) => ({ ...data.ranking[0], unit_id: u.id, position: i + 1, total: "24.00" }));
  data.daily.competency = "2041-12-01"; data.daily.reference_month = "2041-10-01";
  data.daily.totals = ["2041-10-01", "2041-12-01"].flatMap(competency => Array.from({ length: 31 }, (_, i) => ({ ...data.daily.totals[0], competency, day: i + 1, sale_date: `${competency.slice(0, 8)}${String(i + 1).padStart(2, "0")}` })));
  data.daily.points = data.daily.totals.flatMap(p => data.units.map(u => ({ ...p, unit_id: u.id, has_elapsed: true })));
  const start = performance.now();
  const markup = renderToStaticMarkup(<><MonthlyEvolution data={data} onFocus={() => {}} /><Ranking data={data} onFocus={() => {}} /><Stacked data={data} onFocus={() => {}} /><Heatmap data={data} onFocus={() => {}} /><DailyAnalysis data={data} day="" onFocus={() => {}} /></>);
  const elapsed = performance.now() - start;
  expect(data.daily.points).toHaveLength(6200);
  expect(markup.match(/data-intensity=/g)).toHaveLength(2400);
  expect(markup.match(/aria-label="Focar U/g)).toHaveLength(2400);
  expect(markup.match(/<tr/g)).toHaveLength(164); // heatmap101 + tabela diária63.
  expect(markup.match(/<path/g)!.length).toBeLessThan(10);
  console.log(`VEN-04B envelope SSR: 2400 células,6200 pontos de entrada,62 linhas diárias; ${elapsed.toFixed(0)}ms; ${markup.length} caracteres HTML.`);
});
