// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { destinations } from "../apps/web/src/app/navigation";
import { AbcModule } from "../apps/web/src/modules/abc/AbcModule";
import type { Comparison, CompetencyProducts, Overview } from "../apps/web/src/modules/abc/types";

const api = vi.hoisted(() => ({
  units: vi.fn(), overview: vi.fn(), competencyProducts: vi.fn(), productHistory: vi.fn(), compare: vi.fn(), unitRevisions: vi.fn(),
}));
vi.mock("../apps/web/src/modules/abc/api", async (original) => ({ ...(await original<object>()), ...api }));

const unit = { unit_id: "U1", code: "0001", name: "Filial Teste", series_count: 2, last_competency: "2026-07-01", can_publish: true };
const classes = (a: string, b: string, c: string) => [
  { class: "A" as const, count: 1, total: a, share: "70" }, { class: "B" as const, count: 1, total: b, share: "20" }, { class: "C" as const, count: 2, total: c, share: "10" },
];
const comp = (competency: string, total: string, rev: string) => ({
  competency, revision_id: rev, revision_number: 1, declared_total: total, calculated_total: total, difference: "0", line_count: 4,
  published_at: "2026-10-01T12:00:00Z", classes: classes("70", "20", "10"), unclassified: 0,
});
const overview: Overview = {
  unit: { id: "U1", code: "0001", name: "Filial Teste" }, cost_basis: "NET_PERIOD", bases: ["NET_PERIOD"],
  competencies: [comp("2026-06-01", "1076", "R6"), comp("2026-07-01", "1074", "R7")],
};
const line = (rank: number, code: string, total: string) => ({
  rank, line_no: rank, code, name: `Produto ${code}`, unit: "KG", quantity: "1", unit_cost: total, total, avg_cost: total,
  share: "10", cumulative_share: "0", erp_class: "A" as const, calculated_class: "A" as const, source_row: rank + 6,
});
const products: CompetencyProducts = {
  revision: { id: "R7", number: 1, competency: "2026-07-01", cost_basis: "NET_PERIOD", declared_total: "1074", calculated_total: "1074", line_count: 2, published_at: "2026-10-01T12:00:00Z", abc_method: "abc-70-90-inicio-v1" },
  summary: { classes: classes("960", "60", "54"), unclassified: 1,
    matrix: [{ erp_class: "A", calculated_class: "A", count: 1, total: "960" }], units: [{ unit: "KG", count: 2, quantity: "81", total: "1000", share: "93" }] },
  lines: [line(1, "X1", "960"), line(2, "X4", "40")],
};
const side = (q: string, t: string, p: string) => ({ unit: "KG", quantity: q, unit_cost: p, total: t, avg_cost: p, erp_class: null, calculated_class: "A" as const });
const comparison: Comparison = {
  base: { revision_id: "R6", number: 1, competency: "2026-06-01", total: "1076", line_count: 5 },
  current: { revision_id: "R7", number: 1, competency: "2026-07-01", total: "1074", line_count: 5 },
  total_delta: "-2", total_variation: "-0.18587360594795539033",
  summary: {
    counts: { base: 5, current: 5, up: 1, down: 0, unchanged: 0, new: 1, absent: 1, not_comparable: 0, alerts: 0 },
    bridge: { price_effect: "160", quantity_effect: "-200", new: "40", absent: "-25", not_comparable: "19", residual: "0" },
    common_basket: { items: 1, current_total: "960", index: "20" },
    by_base_class: [{ class: "A", count: 1, base_total: "1000", current_total: "960", delta: "-40" }],
  },
  items: [
    { code: "X1", name: "Produto X1", status: "up", alert: false, base: side("100", "1000", "10"), current: side("80", "960", "12"),
      unit_variation: "20", total_delta: "-40", total_variation: "-4", price_effect: "160", quantity_effect: "-200" },
    { code: "X4", name: "Produto X4", status: "new", alert: false, base: null, current: side("4", "40", "10"),
      unit_variation: null, total_delta: null, total_variation: null, price_effect: null, quantity_effect: null },
    { code: "X3", name: "Produto X3", status: "absent", alert: false, base: side("5", "25", "5"), current: null,
      unit_variation: null, total_delta: null, total_variation: null, price_effect: null, quantity_effect: null },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
});
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/abc/*" element={<AbcModule />} /></Routes>
    </MemoryRouter>,
  );
}
function ready() {
  api.units.mockResolvedValue([unit]);
  api.overview.mockResolvedValue(overview);
  api.competencyProducts.mockResolvedValue(products);
  api.compare.mockResolvedValue(comparison);
  api.unitRevisions.mockResolvedValue([]);
  api.productHistory.mockResolvedValue([]);
}

describe("Curva ABC analytics areas", () => {
  it("lists the six areas under Custos → Curva ABC", () => {
    const abc = destinations.find((d) => d.path === "/abc")!;
    expect(abc.children?.map((c) => c.label)).toEqual(["Visão geral", "Importações", "Comparações", "Relatórios", "Produtos", "Categorias"]);
  });

  it("opens /abc on the overview with published numbers and the change since the previous competency", async () => {
    ready();
    renderAt("/abc");
    expect(await screen.findByRole("heading", { name: "Visão geral", level: 1 })).toBeTruthy();
    const kpis = await screen.findByRole("region", { name: "Indicadores da última competência" });
    expect(within(kpis).getByText("R$ 1.074,00")).toBeTruthy();
    expect(within(kpis).getByText(/−R\$ 2,00 \(−0,19%\) vs jun\/2026/)).toBeTruthy();
    expect(api.compare).toHaveBeenCalledWith("U1", "NET_PERIOD", "2026-06-01", "2026-07-01");
    expect(screen.getAllByRole("navigation", { name: "Áreas da Curva ABC" })).toHaveLength(1);
  });

  it("guides the first import when nothing is published, and hides import from readers", async () => {
    ready();
    api.overview.mockResolvedValue({ ...overview, competencies: [] });
    renderAt("/abc/overview");
    expect(await screen.findByText("Nenhum relatório publicado nesta modalidade")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Importar o primeiro relatório" }).getAttribute("href")).toBe("/abc/units/U1/import");
    cleanup();
    api.units.mockResolvedValue([{ ...unit, can_publish: false }]);
    renderAt("/abc/overview");
    expect(await screen.findByText(/Solicite a importação/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Importar/ })).toBeNull();
  });

  it("refuses a unit id outside the user's list", async () => {
    ready();
    renderAt("/abc/overview?unidade=OUTRA");
    expect(await screen.findByText("Unidade indisponível")).toBeTruthy();
    expect(api.overview).not.toHaveBeenCalled();
  });

  it("compares competencies, shows the bridge and filters by status", async () => {
    ready();
    renderAt("/abc/compare");
    expect(await screen.findByText("De onde vem a diferença")).toBeTruthy();
    const bridge = screen.getByRole("figure", { name: /Decomposição de −R\$ 2,00/ });
    expect(within(bridge).getByText("+R$ 160,00")).toBeTruthy();
    expect(within(bridge).getByText("−R$ 200,00")).toBeTruthy();
    const table = () => screen.getAllByRole("region", { name: "Tabela de registros" }).at(-1)!;
    expect(within(table()).getAllByRole("row")).toHaveLength(4);
    await userEvent.selectOptions(screen.getByLabelText("Situação"), "new");
    expect(within(table()).getAllByRole("row")).toHaveLength(2);
    expect(within(table()).getByText("Produto X4")).toBeTruthy();
  });

  it("explains a competency without publication instead of a generic error", async () => {
    ready();
    api.compare.mockRejectedValue({ code: "P0002", message: "Competência sem publicação nesta modalidade" });
    renderAt("/abc/compare");
    expect(await screen.findByText("Não há relatório publicado para a competência e modalidade escolhidas.")).toBeTruthy();
  });

  it("separates ABC classes from commercial categories", async () => {
    ready();
    renderAt("/abc/categories");
    expect(await screen.findByText("Classe ABC não é categoria de produto.")).toBeTruthy();
    expect(await screen.findByText("Classe do ERP × classe calculada")).toBeTruthy();
  });

  it("shows a product's history with the revision that originated each value", async () => {
    ready();
    api.productHistory.mockResolvedValue([{ competency: "2026-07-01", revision_id: "R7", revision_number: 2, name: "Produto X1", unit: "KG",
      quantity: "80", unit_cost: "12", total: "960", avg_cost: "12", share: "89", erp_class: "A", calculated_class: "A", source_row: 7 }]);
    renderAt("/abc/products?produto=X1");
    const link = await screen.findByRole("link", { name: "Revisão 2, linha 7" });
    expect(link.getAttribute("href")).toBe("/abc/revisions/R7");
    expect(api.productHistory).toHaveBeenCalledWith("U1", "NET_PERIOD", "X1");
    await waitFor(() => expect(screen.getAllByText("Produto X1").length).toBeGreaterThan(0));
  });

  it("lists current and superseded revisions in Importações", async () => {
    ready();
    api.unitRevisions.mockResolvedValue([
      { id: "R2", competency: "2026-07-01", cost_basis: "NET_PERIOD", number: 2, current: true, reason: "Reexportado", published_at: "2026-10-02T12:00:00Z",
        published_by: "Ana", declared_total: "10", calculated_total: "10", line_count: 3, warning_count: 1, original_name: "b.xlsx", sha256: "b".repeat(64), byte_size: 9 },
      { id: "R1", competency: "2026-07-01", cost_basis: "NET_PERIOD", number: 1, current: false, reason: null, published_at: "2026-10-01T12:00:00Z",
        published_by: "Ana", declared_total: "9", calculated_total: "9", line_count: 3, warning_count: 0, original_name: "a.xlsx", sha256: "a".repeat(64), byte_size: 9 },
    ]);
    renderAt("/abc/imports");
    expect(await screen.findByText("Vigente")).toBeTruthy();
    expect(screen.getByText("Substituída")).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText("Situação"), "superseded");
    expect(screen.queryByText("Vigente")).toBeNull();
  });

  it("builds reports and ignores a URL base that is not earlier than the competency", async () => {
    ready();
    renderAt("/abc/reports?base=2026-07-01&atual=2026-07-01");
    expect(await screen.findByText("1. Distribuição financeira da Curva ABC")).toBeTruthy();
    // The only earlier competency (June) is used, never the invalid July→July pair.
    expect(api.compare).toHaveBeenCalledWith("U1", "NET_PERIOD", "2026-06-01", "2026-07-01");
    expect(await screen.findByText(/7\. Comparação entre jun\/2026 e jul\/2026/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Imprimir ou salvar em PDF/ })).toBeTruthy();
  });

  it("keeps the chosen unit when the sidebar link has no query, but never a stale one", async () => {
    ready();
    const other = { ...unit, unit_id: "U2", code: "0002", name: "Filial Dois" };
    api.units.mockResolvedValue([unit, other]);
    renderAt("/abc/overview?unidade=U2");
    await waitFor(() => expect(api.overview).toHaveBeenCalledWith("U2", "NET_PERIOD"));
    cleanup();
    api.overview.mockClear();
    renderAt("/abc/categories");
    await waitFor(() => expect(api.overview).toHaveBeenCalledWith("U2", "NET_PERIOD"));
    cleanup();
    api.overview.mockClear();
    api.units.mockResolvedValue([unit]);
    renderAt("/abc/categories");
    await waitFor(() => expect(api.overview).toHaveBeenCalledWith("U1", "NET_PERIOD"));
    expect(screen.queryByText("Unidade indisponível")).toBeNull();
  });

  it("offers a retry when an analytics call fails", async () => {
    ready();
    api.compare.mockRejectedValueOnce({ code: "PGRST000", message: "rede" });
    renderAt("/abc/compare");
    await userEvent.click(await screen.findByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("De onde vem a diferença")).toBeTruthy();
    expect(api.compare).toHaveBeenCalledTimes(2);
  });
});
