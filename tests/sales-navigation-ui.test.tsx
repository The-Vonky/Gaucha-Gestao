// @vitest-environment jsdom
import React, { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { App } from "../apps/web/src/app/App";
import { visibleNavigation } from "../apps/web/src/app/navigation";
import { can, type AccessGrant } from "../apps/web/src/core/auth/permissions";
import { SalesNavigation } from "../apps/web/src/modules/sales/SalesNavigation";
import { dashboardFixture, A, B } from "./fixtures/sales-dashboard";

const auth = vi.hoisted(() => ({ loading: false, error: "", profile: { active: true, display_name: "Pessoa de teste" }, session: { user: { id: "synthetic" } }, grants: [] as AccessGrant[], refresh: vi.fn() }));
const api = vi.hoisted(() => ({ salesDashboard: vi.fn(), listEntries: vi.fn(), listSalesUnits: vi.fn() }));
vi.mock("../apps/web/src/core/auth/AuthProvider", () => ({ AuthProvider: ({ children }: { children: ReactNode }) => children, useAuth: () => ({ ...auth, can: (p: string, scope = {}) => can(auth.profile.active, auth.grants, p, scope) }) }));
vi.mock("../apps/web/src/core/client", () => ({ client: {}, database: vi.fn() }));
vi.mock("../apps/web/src/modules/sales/api", async original => ({ ...await original<object>(), ...api }));
const grant = (permission: string, scope_type: AccessGrant["scope_type"] = "global", unit_id = A): AccessGrant => ({ permission, scope_type, unit_id: scope_type === "global" ? null : unit_id, sector_id: scope_type === "sector" ? "S" : null });
const manager = grant("sales.dashboard.read"), operator = grant("sales.entry.read");
function mount(path = "/sales") { window.history.replaceState(null, "", path); return render(<App />); }
beforeEach(() => {
  vi.resetAllMocks(); HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); }; HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); }; window.scrollTo = vi.fn(); auth.profile.active = true; auth.grants = [manager, operator];
  api.salesDashboard.mockResolvedValue(dashboardFixture()); api.listEntries.mockResolvedValue([]); api.listSalesUnits.mockResolvedValue([]);
});
afterEach(cleanup);

describe("MEL-05 — módulo e proteção das subpáginas", () => {
  it.each([
    { grants: [manager], pages: ["Visão geral"], target: "Dashboard gerencial" },
    { grants: [operator], pages: ["Lançamentos"], target: "Lançamentos" },
    { grants: [manager, operator], pages: ["Visão geral", "Lançamentos"], target: "Dashboard gerencial" },
  ])("menu filtra subpáginas e entrada padrão $pages", async ({ grants, pages, target }) => {
    auth.grants = grants; const nav = visibleNavigation(true, grants); expect(nav).toHaveLength(1); expect(nav[0].destinations).toHaveLength(1);
    expect(nav[0].destinations[0].children?.map(c => c.label)).toEqual(pages);
    mount(); await screen.findByRole("heading", { name: target, exact: true });
    const menu = within(screen.getByRole("navigation", { name: "Navegação principal" }));
    expect(menu.getByRole("button", { name: "Vendas / Maquininhas" }).getAttribute("aria-expanded")).toBe("true");
    for (const page of pages) expect(menu.getByRole("link", { name: page })).toBeTruthy();
    expect(menu.getByRole("link", { name: target === "Lançamentos" ? target : "Visão geral" }).getAttribute("aria-current")).toBe("page");
  });
  it.each([{ grants: [] }, { grants: [grant("sales.dashboard.read", "sector")] }, { grants: [grant("sales.entry.read", "sector")] }])("sem acesso unitário não oferece módulo $grants", async ({ grants }) => {
    auth.grants = grants; mount(); await screen.findByRole("heading", { name: "Acesso não autorizado" });
    expect(screen.queryByRole("button", { name: "Vendas / Maquininhas" })).toBeNull(); expect(api.salesDashboard).not.toHaveBeenCalled(); expect(api.listSalesUnits).not.toHaveBeenCalled();
  });
  it.each([[manager, "/sales/entries"], [operator, "/sales/dashboard"]] as const)("URL direta nega área oposta %j %s", async (g, path) => {
    auth.grants = [g]; mount(path); await screen.findByRole("heading", { name: "Acesso não autorizado" });
    expect(api.salesDashboard).not.toHaveBeenCalled(); expect(api.listEntries).not.toHaveBeenCalled(); expect(screen.queryByRole("link", { name: /Ir para lançamentos|Voltar ao dashboard/ })).toBeNull();
  });
  it("perfil inativo e revogação retiram conteúdo e atalhos", async () => {
    const view = mount(); await screen.findByRole("heading", { name: "Dashboard gerencial" });
    auth.grants = []; view.rerender(<App />); await screen.findByRole("heading", { name: "Acesso não autorizado" });
    auth.profile.active = false; view.rerender(<App />); await screen.findByRole("heading", { name: "Acesso indisponível" });
  });
  it("URL antiga com query operacional preserva filtros e substitui histórico", async () => {
    mount("/sales?method=Stone&from=2026-09-02&to=2026-09-10&page=2"); await screen.findByRole("heading", { name: "Lançamentos" });
    expect(window.location.pathname).toBe("/sales/entries"); expect(window.location.search).toContain("method=Stone");
    expect(api.listEntries).toHaveBeenCalledWith(expect.objectContaining({ payment_method: "Stone", from: "2026-09-02", to: "2026-09-10", offset: 50 }));
  });
  it("bookmark operacional de gerente puro abre dashboard com recorte compatível autorizado", async () => {
    auth.grants = [grant("sales.dashboard.read", "unit", A)];
    mount(`/sales?method=PIX&from=2026-09-02&to=2026-09-10&unit=${B}&page=2`);
    await screen.findByRole("heading", { name: "Dashboard gerencial" });
    expect(window.location.pathname).toBe("/sales/dashboard"); expect(window.location.search).toBe("?from=2026-09&to=2026-09&scope=combined");
    expect(api.listEntries).not.toHaveBeenCalled(); expect(api.listSalesUnits).not.toHaveBeenCalled();
    expect(api.salesDashboard).toHaveBeenCalledWith({ from: "2026-09-01", to: "2026-09-01", scope: "combined" });
  });
  it("breadcrumb, cabeçalho limpo e menu por teclado/mobile", async () => {
    const user = userEvent.setup(); const view = mount(); await screen.findByRole("heading", { name: "Dashboard gerencial" });
    expect(screen.getByRole("navigation", { name: "Você está em" }).textContent).toBe("InícioComercialVendas / MaquininhasVisão geral");
    expect(view.container.querySelector(".page-title .eyebrow")).toBeNull();
    const toggle = screen.getByRole("button", { name: "Vendas / Maquininhas" }); toggle.focus(); await user.keyboard("{Enter}"); expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await user.keyboard(" "); expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Menu", exact: true }));
    const drawer = within(screen.getByRole("dialog", { name: "Navegação" })); fireEvent.click(drawer.getByRole("link", { name: "Lançamentos" }));
    await screen.findByRole("heading", { name: "Lançamentos" }); expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("navigation", { name: "Você está em" }).textContent).toContain("Lançamentos");
  });
});

function History() {
  const navigate = useNavigate(), location = useLocation();
  return <><SalesNavigation /><output>{location.pathname + location.search}</output><button onClick={() => navigate(-1)}>Anterior teste</button><button onClick={() => navigate(1)}>Próximo teste</button></>;
}
describe("MEL-06 — atalho e preservação segura do recorte", () => {
  it("volta com datas exatas/PIX/página e suporta histórico para trás e para frente", async () => {
    const path = `/sales/entries?from=2026-09-02&to=2026-09-10&method=PIX&unit=${A}&page=3`;
    render(<MemoryRouter initialEntries={[path]}><History /></MemoryRouter>);
    fireEvent.click(screen.getByRole("link", { name: "Voltar ao dashboard" }));
    expect(screen.getByRole("link", { name: "Ir para lançamentos" }).getAttribute("href")).toBe(path);
    fireEvent.click(screen.getByRole("link", { name: "Ir para lançamentos" })); expect(screen.getByRole("status").textContent).toBe(path);
    fireEvent.click(screen.getByRole("button", { name: "Anterior teste" })); expect(screen.getByRole("status").textContent).toContain("/sales/dashboard?");
    fireEvent.click(screen.getByRole("button", { name: "Próximo teste" })); expect(screen.getByRole("status").textContent).toBe(path);
  });
  it.each([true, false])("revalida unidade inclusive no estado de retorno saved=%s", saved => {
    auth.grants = [grant("sales.dashboard.read", "unit", A), grant("sales.entry.read", "unit", B)];
    render(<MemoryRouter initialEntries={[{ pathname: "/sales/dashboard", search: `?from=2024-02&to=2024-02&unit=${A}`, state: saved ? { salesReturn: `/sales/entries?unit=${A}&method=PIX` } : null }]}><SalesNavigation /></MemoryRouter>);
    const href = screen.getByRole("link", { name: "Ir para lançamentos" }).getAttribute("href")!; expect(href).not.toContain(A); expect(href).not.toContain("unit=");
    if (!saved) expect(href).toContain("to=2024-02-29");
  });
  it.each(["https://external.test/sales/entries?unit=secret", "/sales/entries-fake?unit=secret", 17])("recusa destino de retorno não permitido %j", salesReturn => {
    render(<MemoryRouter initialEntries={[{ pathname: "/sales/dashboard", search: "?from=2026-09&to=2026-09", state: { salesReturn } }]}><SalesNavigation /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Ir para lançamentos" }).getAttribute("href")).toBe("/sales/entries?from=2026-09-01&to=2026-09-30&method=Stone");
  });
  it("gerencial puro não ganha atalho operacional", () => {
    auth.grants = [manager]; render(<MemoryRouter initialEntries={["/sales/dashboard"]}><SalesNavigation /></MemoryRouter>); expect(screen.queryByRole("link")).toBeNull();
  });
  it("Curva ABC mantém estrutura e caminhos", async () => {
    const abc = visibleNavigation(true, [grant("abc.report.read")])[0].destinations[0]; expect(abc.path).toBe("/abc"); expect(abc.children).toHaveLength(6);
    await waitFor(() => expect(api.salesDashboard).not.toHaveBeenCalled());
  });
});
