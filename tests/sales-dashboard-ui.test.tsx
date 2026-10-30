// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { can, type AccessGrant } from "../apps/web/src/core/auth/permissions";
import { visibleNavigation } from "../apps/web/src/app/navigation";
import { SalesDashboardPage } from "../apps/web/src/modules/sales/SalesDashboardPage";
import { SalesPage } from "../apps/web/src/modules/sales/SalesPage";
import type { SalesDashboard } from "../apps/web/src/modules/sales/types";
import { A, B, C, dashboardFixture } from "./fixtures/sales-dashboard";

const api = vi.hoisted(() => ({ salesDashboard: vi.fn(), listEntries: vi.fn(), entryDetail: vi.fn(), listSalesUnits: vi.fn() }));
const auth = vi.hoisted(() => ({ profile: { active: true }, session: { user: { id: "dashboard-user" } }, grants: [] as AccessGrant[], loading: false, error: "", refresh: vi.fn() }));
vi.mock("../apps/web/src/core/auth/AuthProvider", () => ({ useAuth: () => ({ ...auth, can: (p: string, scope = {}) => can(auth.profile.active, auth.grants, p, scope) }) }));
vi.mock("../apps/web/src/modules/sales/api", async original => ({ ...await original<object>(), ...api }));
function grant(permission = "sales.dashboard.read", scope_type: AccessGrant["scope_type"] = "global", unit_id = A): AccessGrant {
  return { permission, scope_type, unit_id: scope_type === "global" ? null : unit_id, sector_id: scope_type === "sector" ? "S" : null };
}
function Location() { const location = useLocation(), navigate = useNavigate(); return <><output data-testid="url">{location.pathname}{location.search}</output><button onClick={() => void navigate(-1)}>Navegador anterior</button><button onClick={() => void navigate(1)}>Navegador seguinte</button></>; }
function mount(search = "from=2026-09&to=2026-09") { return render(<MemoryRouter initialEntries={[`/sales/dashboard?${search}`]}><SalesDashboardPage /><Location /></MemoryRouter>); }
const figure = (title: string) => screen.getByRole("figure", { name: new RegExp(`^${title}`) });
const metric = (title: string) => screen.getByText(title, { exact: true }).closest(".metric")!;
const total = () => metric("Total financeiro do período").textContent;
async function ready() { await screen.findByText("Total financeiro do período", { exact: true }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function apply() { fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros", exact: true })); }
beforeEach(() => {
  vi.resetAllMocks(); auth.profile.active = true; auth.loading = false; auth.error = ""; auth.session.user.id = "dashboard-user"; auth.grants = [grant()];
  api.salesDashboard.mockImplementation(async filters => ({ ...dashboardFixture(filters.scope === "combined"), filters: { ...filters, unit_ids: filters.unit_ids ?? [A, B] } }));
});
afterEach(cleanup);

describe("VEN-04B — painel financeiro completo", () => {
  it("Stone padrão, oráculo exato, diário sem ajuste e estimativa explícita", async () => {
    mount(); await ready(); expect(total()).toContain("R$ 300,00");
    expect(api.salesDashboard).toHaveBeenCalledWith({ from: "2026-09-01", to: "2026-09-01", scope: "stone" });
    const daily = figure("Acumulado diário e projeção");
    expect(daily.textContent).toContain("R$ 250,00"); expect(daily.textContent).toContain("R$ 3.750,00"); expect(daily.textContent).toContain("estimativa");
    const recon = figure("Contexto da base e reconciliação"); expect(recon.textContent).toContain("R$ 50,00"); expect(recon.textContent).toContain("R$ 0,00");
    expect(api.listEntries).not.toHaveBeenCalled(); expect(api.entryDetail).not.toHaveBeenCalled(); expect(api.listSalesUnits).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Lançamentos", exact: true })).toBeNull();
  });
  it("alternância Stone + PIX atualiza total350 / diário300 / projeção4500 e coluna PIX", async () => {
    mount(); await ready(); fireEvent.change(screen.getByLabelText("Escopo financeiro"), { target: { value: "combined" } }); apply(); await ready();
    expect(total()).toContain("R$ 350,00"); expect(figure("Acumulado diário").textContent).toContain("R$ 300,00"); expect(figure("Acumulado diário").textContent).toContain("R$ 4.500,00");
    expect(within(figure("Resumo mensal")).getByRole("columnheader", { name: "PIX", exact: true })).toBeTruthy();
  });
  it("representa todos os gráficos, média, marcador parcial, intensidade, referência lacunar e insights", async () => {
    mount(); await ready();
    for (const title of ["Evolução mensal", "Ranking de unidades", "Composição mensal por unidade", "Heatmap", "Resumo mensal", "Acumulado diário", "Composição Stone", "Insights gerenciais", "Contexto da base"]) expect(figure(title)).toBeTruthy();
    expect(figure("Evolução mensal").querySelector(".sales-average")).toBeTruthy(); expect(figure("Evolução mensal").querySelector(".sales-point.partial")).toBeTruthy();
    expect(figure("Acumulado diário").querySelector(".sales-reference")?.getAttribute("d")).toContain("L");
    expect(figure("Acumulado diário").textContent).toContain("referência 07/2026 · corte até dia 2");
    expect(figure("Heatmap").querySelector('[data-intensity="0.500000"]')).toBeTruthy();
    expect(metric("Variação da competência recente").textContent).toContain("25%");
  });
  it("ranking preserva desempate e inclui unidade inativa com histórico", async () => {
    const data = dashboardFixture(); data.ranking[1].total = data.ranking[0].total; api.salesDashboard.mockResolvedValue(data);
    mount(); await ready(); const ranks = within(figure("Ranking")).getAllByRole("button");
    expect(ranks[0].textContent).toContain("1. A · Unidade Alfa"); expect(ranks[1].textContent).toContain("2. B · Histórica Beta (inativa)");
  });
  it("insights preservam avanço negativo, recuo, concentração e comparação projetada exatos", async () => {
    const d = dashboardFixture();
    const closed = { ...d.months[0], partial: false, is_closed: true, projection: null, projection_is_estimate: false };
    d.insights.strongest_advance = { ...closed, competency: "2026-07-01", comparison: { ...closed.comparison, reference_month: "2026-05-01", cutoff_day: null, variation_pct: "-12.500000", trend: "down" } };
    d.insights.largest_decline = { ...closed, comparison: { ...closed.comparison, cutoff_day: null, variation_pct: "-20.123456", trend: "down" } };
    d.summary.top_two_share_pct = "99.123456";
    api.salesDashboard.mockResolvedValue(d); mount(); await ready();
    const insights = figure("Insights gerenciais");
    expect(insights.textContent).toContain("07/2026 · -12,5% · Referência 05/2026");
    expect(insights.textContent).toContain("09/2026 · -20,123456% · Referência 07/2026");
    expect(insights.textContent).toContain("99,123456%"); expect(insights.textContent).toContain("1775% · referência 07/2026");
    expect(insights.textContent).toContain("R$ 3.750,00");
  });
  it("oculta/exibe séries somente no desenho, sem RPC adicional ou alteração de indicadores", async () => {
    mount(); await ready(); const before = total(), calls = api.salesDashboard.mock.calls.length;
    const series = screen.getByRole("group", { name: "Séries das barras empilhadas" });
    fireEvent.click(within(series).getByRole("button", { name: /Unidade Alfa/ }));
    expect(within(series).getByRole("button", { name: /Unidade Alfa/ }).getAttribute("aria-pressed")).toBe("false");
    expect(figure("Composição mensal por unidade").querySelectorAll('g[role="button"]')).toHaveLength(1);
    expect(total()).toBe(before); expect(api.salesDashboard).toHaveBeenCalledTimes(calls);
    fireEvent.click(within(series).getByRole("button", { name: /Histórica Beta/ })); expect(screen.getByText(/Todas as séries estão ocultas/)).toBeTruthy();
    fireEvent.click(within(series).getByRole("button", { name: /Unidade Alfa/ })); expect(total()).toBe(before);
  });
  it("histórico indeterminado mantém null e não fabrica média/fechamento/projeção", async () => {
    const data = dashboardFixture(); data.metadata.global_status_visible = false;
    const m = { ...data.months[0], status_basis: "historical_unavailable" as const, partial: null, is_closed: null, daily_average: null, projection: null, projection_is_estimate: false,
      comparison: { ...data.months[0].comparison, available: false, variation_pct: null, trend: "unavailable" as const } };
    data.months = [m]; data.summary = { ...data.summary, latest: m, daily_average: null, best_closed: null }; data.insights.pace = null;
    api.salesDashboard.mockResolvedValue(data); mount(); await ready();
    expect(figure("Resumo mensal").textContent).toContain("Status histórico indisponível para este acesso");
    expect(metric("Média diária do período").textContent).toContain("Indisponível"); expect(metric("Variação da competência recente").textContent).toContain("Sem comparação");
    expect(figure("Acumulado diário").querySelector(".sales-projection")).toBeNull(); expect(total()).toContain("300,00");
  });
  it.each([true, false, null])("status completo is_closed=%s não é presumido pela idade", async closed => {
    const d = dashboardFixture(); const m = { ...d.months[0], partial: false, is_closed: closed, status_basis: closed === null ? "derived" as const : "snapshot" as const, projection: null, projection_is_estimate: false };
    d.months = [m]; d.summary.best_closed = m; api.salesDashboard.mockResolvedValue(d); mount(); await ready();
    expect(figure("Resumo mensal").textContent).toContain(closed === true ? "Fechado confirmado" : "Completo sem fechamento confirmado");
    expect(screen.queryByText("Melhor competência fechada confirmada") !== null).toBe(closed === true);
  });
  it("valores elevados/centavos e diferença negativa são exibidos diretamente do contrato", async () => {
    const d = dashboardFixture(); d.summary.total = "9007199254740993.01"; d.months[0].total = "0.01"; d.months[0].reconciliation_difference = "-0.01";
    api.salesDashboard.mockResolvedValue(d); mount(); await ready(); expect(total()).toContain("R$ 9.007.199.254.740.993,01");
    expect(figure("Resumo mensal").textContent).toContain("R$ 0,01"); expect(figure("Contexto da base").textContent).toContain("−R$ 0,01");
  });
  it("mix base zero e percentuais nulos permanecem indisponíveis", async () => {
    const d = dashboardFixture(); d.payment_mix = { stone: "0.00", pix: "0.00", stone_share_pct: null, pix_share_pct: null };
    d.summary.leader = null; d.summary.top_two_share_pct = null; d.months[0].comparison.available = false; d.months[0].comparison.variation_pct = null;
    api.salesDashboard.mockResolvedValue(d); mount(); await ready(); expect(figure("Composição Stone").textContent).toContain("Composição indisponível (base zero)");
    expect(metric("Participação da líder").textContent).toContain("Indisponível"); expect(metric("Variação da competência recente").textContent).toContain("Sem comparação");
  });
  it("lacunas são rotuladas e interrompem a linha sem inventar valores", async () => {
    const d = dashboardFixture(); d.filters.from = "2026-07-01"; d.metadata.missing_months = ["2026-08-01"];
    d.months.unshift({ ...d.months[0], competency: "2026-07-01", partial: false });
    d.unit_months.push(...d.unit_months.map(c => ({ ...c, competency: "2026-07-01" })));
    api.salesDashboard.mockResolvedValue(d); mount("from=2026-07&to=2026-09"); await ready();
    expect(figure("Evolução mensal").textContent).toContain("08/2026 · lacuna");
    expect(figure("Evolução mensal").querySelectorAll("path.sales-line")).toHaveLength(2);
  });
});

describe("VEN-04B — navegação gerencial e concorrência", () => {
  it("filtros combinados ficam na URL, competência diária é enviada no dia01", async () => {
    mount(); await ready(); fireEvent.change(screen.getByLabelText("Unidade", { exact: true }), { target: { value: B } });
    fireEvent.change(screen.getByLabelText("Competência diária"), { target: { value: "2026-09" } }); apply();
    await waitFor(() => expect(api.salesDashboard).toHaveBeenLastCalledWith({ from: "2026-09-01", to: "2026-09-01", scope: "stone", unit_ids: [B], daily_month: "2026-09-01" }));
    expect(screen.getByTestId("url").textContent).toContain(`unit=${B}`);
  });
  it("URL válida recarrega filtros sem substituir unidade por todas", async () => {
    mount(`from=2026-09&to=2026-09&unit=${A}&scope=combined&daily=2026-09&day=2`); await ready();
    expect(total()).toContain("350,00"); expect(figure("Acumulado diário").textContent).toContain("Foco no dia 2");
    expect(api.salesDashboard.mock.calls[0][0].unit_ids).toEqual([A]);
  });
  it("ranking → célula → Voltar → navegador Avançar preservam os focos", async () => {
    mount("from=2026-07&to=2026-09&baseFrom=2026-07&baseTo=2026-09"); await ready();
    fireEvent.click(within(figure("Ranking")).getByRole("button", { name: /Unidade Alfa/ })); await ready();
    fireEvent.click(within(figure("Heatmap")).getByRole("button", { name: /Focar célula A/ })); await ready();
    expect(screen.getByTestId("url").textContent).toContain("from=2026-09");
    fireEvent.click(screen.getByRole("button", { name: "Voltar", exact: true })); await ready(); expect(screen.getByTestId("url").textContent).toContain("from=2026-07");
    fireEvent.click(screen.getByRole("button", { name: "Navegador seguinte" })); await ready(); expect(screen.getByTestId("url").textContent).toContain("from=2026-09");
  });
  it("evolução selecionável por teclado; comparar tudo restaura janela; reset restaura Stone", async () => {
    const user = userEvent.setup(); mount("from=2026-09&to=2026-09&scope=combined&baseFrom=2026-07&baseTo=2026-09"); await ready();
    const point = within(figure("Evolução mensal")).getByRole("button", { name: /Focar competência/ }); point.focus(); await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByTestId("url").textContent).toContain("daily=2026-09"));
    fireEvent.click(screen.getByRole("button", { name: "Comparar tudo" })); await ready(); expect(screen.getByTestId("url").textContent).toContain("from=2026-07");
    fireEvent.click(screen.getByRole("button", { name: "Redefinir" })); await ready(); expect(api.salesDashboard.mock.calls.at(-1)![0].scope).toBe("stone");
  });
  it("heatmap por Espaço e foco diário só exploram agregados, sem novas RPCs ao selecionar dia", async () => {
    const user = userEvent.setup(); mount(); await ready();
    const cell = within(figure("Heatmap")).getByRole("button", { name: /Focar célula A/ }); cell.focus(); await user.keyboard(" "); await ready();
    const calls = api.salesDashboard.mock.calls.length;
    fireEvent.click(screen.getByText("Valores diários e referência anterior"));
    fireEvent.click(within(figure("Acumulado diário")).getByRole("button", { name: "02/09/2026" }));
    expect(figure("Acumulado diário").textContent).toContain("Foco no dia 2"); expect(api.salesDashboard).toHaveBeenCalledTimes(calls);
    expect(api.entryDetail).not.toHaveBeenCalled(); expect(api.listEntries).not.toHaveBeenCalled();
  });
  it("atualiza conservando filtros e descarta a resposta obsoleta em mudanças rápidas", async () => {
    const slow = deferred<SalesDashboard>(); api.salesDashboard.mockResolvedValueOnce(dashboardFixture()).mockReturnValueOnce(slow.promise).mockResolvedValue(dashboardFixture(true));
    mount(); await ready(); fireEvent.click(screen.getByRole("button", { name: "Atualizar", exact: true }));
    await waitFor(() => expect(api.salesDashboard).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText("Escopo financeiro"), { target: { value: "combined" } }); apply(); await ready();
    expect(total()).toContain("350,00"); await act(async () => slow.resolve(dashboardFixture())); expect(total()).toContain("350,00");
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });
  it.each(["from=2020-01&to=2026-09", "from=2026-10&to=2026-09", "from=2026-09&to=2026-09&daily=2026-10", "from=2026-09&to=2026-09&unit=estranho"]) ("URL inválida %s não consulta nem vira recorte global", async search => {
    mount(search); await screen.findByRole("alert"); expect(api.salesDashboard).not.toHaveBeenCalled(); expect(screen.queryByText("Total financeiro do período")).toBeNull();
  });
  it("base acima de100 permite escolher UUID e nunca mostra consolidado parcial", async () => {
    api.salesDashboard.mockRejectedValueOnce({ code: "23514" }).mockResolvedValue(dashboardFixture()); mount();
    await screen.findByText(/Nenhum total parcial foi exibido/);
    fireEvent.change(screen.getByLabelText("Unidade por UUID"), { target: { value: A } }); apply(); await ready();
    expect(api.salesDashboard.mock.calls.at(-1)![0].unit_ids).toEqual([A]);
  });
});

describe("VEN-04B — autorização independente e estados seguros", () => {
  it.each(["sales.entry.read", "sales.entry.create", "sales.entry.edit", "sales.entry.delete"]) ("operador %s não acessa dashboard", async permission => {
    auth.grants = [grant(permission)]; mount(); expect(await screen.findByText("Acesso não autorizado")).toBeTruthy(); expect(api.salesDashboard).not.toHaveBeenCalled();
    expect(visibleNavigation(true, auth.grants).flatMap(g => g.destinations).map(d => d.path)).toEqual(["/sales"]);
  });
  it("somente dashboard vê a rota, mas não acessa operações", async () => {
    expect(visibleNavigation(true, [grant()]).flatMap(g => g.destinations).map(d => d.path)).toEqual(["/sales/dashboard"]);
    render(<MemoryRouter><SalesPage /></MemoryRouter>); await screen.findByText("Acesso não autorizado"); expect(api.listEntries).not.toHaveBeenCalled();
  });
  it.each([{ grants: [] as AccessGrant[] }, { grants: [grant(undefined, "sector")] }])("sem capacidade válida $grants não faz RPC", async ({ grants }) => {
    auth.grants = grants; mount(); await screen.findByText("Acesso não autorizado"); expect(api.salesDashboard).not.toHaveBeenCalled();
  });
  it("ambas as áreas habilitam alternância com recorte compatível", async () => {
    auth.grants = [grant(), grant("sales.entry.read")]; mount(`from=2026-09&to=2026-09&unit=${A}`); await ready();
    const link = screen.getByRole("link", { name: "Lançamentos", exact: true }); expect(link.getAttribute("href")).toContain("to=2026-09-30"); expect(link.getAttribute("href")).toContain(`unit=${A}`);
  });
  it("UUID externo à atribuição é negado antes da consulta", async () => {
    auth.grants = [grant(undefined, "unit", A)]; mount(`from=2026-09&to=2026-09&unit=${C}`);
    await screen.findByText(/Unidade indisponível para este acesso/); expect(api.salesDashboard).not.toHaveBeenCalled();
  });
  it("troca de identidade limpa dados anteriores imediatamente e descarta resposta atrasada", async () => {
    const slow = deferred<SalesDashboard>(); api.salesDashboard.mockResolvedValueOnce(dashboardFixture()).mockReturnValueOnce(slow.promise);
    const mounted = mount(); await ready(); auth.session.user.id = "other-user"; auth.grants = [grant(undefined, "unit", B)];
    mounted.rerender(<MemoryRouter initialEntries={["/sales/dashboard?from=2026-09&to=2026-09"]}><SalesDashboardPage /><Location /></MemoryRouter>);
    expect(screen.queryByText("Total financeiro do período")).toBeNull(); expect(screen.queryByText(/Unidade Alfa/)).toBeNull();
    auth.profile.active = false; mounted.rerender(<MemoryRouter><SalesDashboardPage /><Location /></MemoryRouter>);
    await act(async () => slow.resolve(dashboardFixture())); expect(screen.queryByText("Total financeiro do período")).toBeNull(); await screen.findByText("Acesso não autorizado");
  });
  it("resposta unitária não revela outra unidade em gráfico, tooltip, ranking ou heatmap", async () => {
    auth.grants = [grant(undefined, "unit", A)]; const d = dashboardFixture(); d.units = d.units.filter(u => u.id === A); d.ranking = d.ranking.filter(r => r.unit_id === A); d.unit_months = d.unit_months.filter(c => c.unit_id === A);
    d.metadata.global_status_visible = false; d.months[0].status_basis = "historical_unavailable"; d.months[0].partial = null; d.months[0].is_closed = null;
    api.salesDashboard.mockResolvedValue(d); const mounted = mount(); await ready();
    expect(mounted.container.innerHTML).not.toContain("Histórica Beta"); expect(mounted.container.innerHTML).not.toContain(B); expect(mounted.container.innerHTML).not.toContain("Snapshot global quando existente");
  });
  it.each([["42501", /permissão/], ["PGRST301", /sessão expirou/], ["XX000", /conexão/]])("falha %s remove dados antigos e permite recuperação", async (code, text) => {
    api.salesDashboard.mockResolvedValueOnce(dashboardFixture()).mockRejectedValueOnce({ code, message: "SQL segredo" }).mockResolvedValue(dashboardFixture());
    mount(); await ready(); fireEvent.click(screen.getByRole("button", { name: "Atualizar", exact: true })); await screen.findByText(text);
    expect(screen.queryByText("Total financeiro do período")).toBeNull(); expect(screen.queryByText("SQL segredo")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" })); await ready();
  });
  it("vazio não entra em loop de consultas", async () => {
    const d = dashboardFixture(); d.units = []; d.months = []; d.ranking = []; d.unit_months = []; d.daily = { competency: null, reference_month: null, cutoff_day: null, totals: [], points: [] };
    d.summary.latest = null; d.summary.leader = null; api.salesDashboard.mockResolvedValue(d); mount(); await screen.findByText("Sem movimento no período");
    expect(api.salesDashboard).toHaveBeenCalledTimes(1);
  });
});
