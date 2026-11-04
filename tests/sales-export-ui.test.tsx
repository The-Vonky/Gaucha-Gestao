// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { can, type AccessGrant } from "../apps/web/src/core/auth/permissions";
import { SalesExportActions } from "../apps/web/src/modules/sales/export/SalesExportActions";
import { SalesPage } from "../apps/web/src/modules/sales/SalesPage";
import { SalesDashboardPage } from "../apps/web/src/modules/sales/SalesDashboardPage";
import { exportFixture, exportUnit } from "./fixtures/sales-export";
import { dashboardFixture } from "./fixtures/sales-dashboard";

const mocks = vi.hoisted(() => ({ collectExport: vi.fn(), validateExport: vi.fn(), exportBlob: vi.fn(), downloadExport: vi.fn(), listEntries: vi.fn(), listSalesUnits: vi.fn(), salesDashboard: vi.fn() }));
const auth = vi.hoisted(() => ({ profile: { active: true }, session: { user: { id: "export-user" } }, grants: [] as AccessGrant[], loading: false, error: "", refresh: vi.fn() }));
vi.mock("../apps/web/src/core/auth/AuthProvider", () => ({ useAuth: () => ({ ...auth, can: (p: string, scope = {}) => can(auth.profile.active, auth.grants, p, scope) }) }));
vi.mock("../apps/web/src/modules/sales/api", async original => ({ ...await original<object>(), listEntries: mocks.listEntries, listSalesUnits: mocks.listSalesUnits, salesDashboard: mocks.salesDashboard }));
vi.mock("../apps/web/src/modules/sales/export/api", async original => ({ ...await original<object>(), collectExport: mocks.collectExport, validateExport: mocks.validateExport }));
vi.mock("../apps/web/src/modules/sales/export/workbook", () => ({ exportBlob: mocks.exportBlob }));
vi.mock("../apps/web/src/modules/sales/export/download", async original => ({ ...await original<object>(), downloadExport: mocks.downloadExport }));
const grant = (permission: string, scope_type: AccessGrant["scope_type"] = "global", unit_id = exportUnit): AccessGrant => ({ permission, scope_type, unit_id: scope_type === "global" ? null : unit_id, sector_id: scope_type === "sector" ? "S" : null });
const all = () => ["sales.entry.read", "sales.dashboard.read", "sales.export.filtered", "sales.export.full"].map(p => grant(p));
const filtered = () => screen.getByRole("button", { name: "Exportar período filtrado" });
const full = () => screen.getByRole("button", { name: "Exportar histórico completo autorizado" });
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(r => { resolve = r; }), resolve: (value: T) => resolve(value) }; }
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.resetAllMocks(); auth.profile.active = true; auth.loading = false; auth.error = ""; auth.session.user.id = "export-user"; auth.grants = all();
  mocks.collectExport.mockResolvedValue(exportFixture()); mocks.validateExport.mockResolvedValue(undefined); mocks.exportBlob.mockResolvedValue(new Blob(["synthetic"]));
  mocks.listEntries.mockResolvedValue([]);
  mocks.listSalesUnits.mockResolvedValue([{ id: exportUnit, code: "A", name: "Unidade A", active: true, can_read: true, can_create: false, can_edit: false, can_delete: false }]);
  mocks.salesDashboard.mockResolvedValue(dashboardFixture());
});
afterEach(cleanup);
describe("VEN-05A — controles e download", () => {
  it.each([[], [grant("sales.dashboard.read")], [grant("sales.dashboard.read"), grant("sales.export.full")], [grant("sales.entry.read")], all().map(g => ({ ...g, scope_type: "sector" as const }))].map(grants => ({ grants })))("sem interseção não oferece exportação: $grants", ({ grants }) => {
    auth.grants = grants; render(<SalesExportActions filters={{}} />);
    expect(screen.queryByRole("button")).toBeNull(); expect(mocks.collectExport).not.toHaveBeenCalled();
  });
  it("interseção de unidades sem misturar grantA/readB", () => {
    auth.grants = [grant("sales.entry.read", "unit"), grant("sales.export.full", "unit", "10000000-0000-0000-0000-000000000002")];
    render(<SalesExportActions filters={{}} />); expect(screen.queryByRole("button")).toBeNull();
  });
  it("preparação, consulta, Blob, revalidação e início de download", async () => {
    const slow = deferred<ReturnType<typeof exportFixture>>(); mocks.collectExport.mockReturnValue(slow.promise);
    render(<SalesExportActions filters={{ from: "2026-09-01", method: "Stone" }} />);
    fireEvent.click(filtered()); fireEvent.click(filtered()); expect(screen.getByRole("status").textContent).toContain("Preparando");
    expect(mocks.collectExport).toHaveBeenCalledTimes(1);
    await act(async () => slow.resolve(exportFixture())); await screen.findByText("Download iniciado.");
    expect(mocks.collectExport).toHaveBeenCalledWith("filtered", { from: "2026-09-01", method: "Stone" }, expect.any(Function));
    expect(mocks.validateExport).toHaveBeenCalledWith(exportFixture(), { from: "2026-09-01", method: "Stone" });
    expect(mocks.exportBlob.mock.invocationCallOrder[0]).toBeLessThan(mocks.validateExport.mock.invocationCallOrder[0]);
    expect(mocks.validateExport.mock.invocationCallOrder[0]).toBeLessThan(mocks.downloadExport.mock.invocationCallOrder[0]);
    expect(mocks.downloadExport).toHaveBeenCalledWith(expect.any(Blob), "historico-filtrado-01-09-2026-30-09-2026-1total.xlsx");
  });
  it("histórico ignora todos os filtros selecionados e usa modalidade própria", async () => {
    render(<SalesExportActions filters={{ from: "2026-09-01", unit_ids: [exportUnit], method: "Stone" }} />);
    fireEvent.click(full()); await screen.findByText("Download iniciado.");
    expect(mocks.collectExport).toHaveBeenCalledWith("full", {}, expect.any(Function));
    expect(mocks.validateExport).toHaveBeenCalledWith(expect.any(Object), {});
  });
  it("sem dados não gera Blob ou download", async () => {
    mocks.collectExport.mockResolvedValue({ ...exportFixture(), record_count: 0 });
    render(<SalesExportActions filters={{}} />); fireEvent.click(filtered()); await screen.findByText(/Nenhum dado disponível/);
    expect(mocks.exportBlob).not.toHaveBeenCalled(); expect(mocks.downloadExport).not.toHaveBeenCalled();
  });
  it.each([["42501", "permissão"], ["PGRST301", "sessão expirou"], ["54000", "Limite de volume"], ["40001", "mudaram"], ["PGRST202", "ainda não está disponível neste ambiente"], ["42883", "ainda não está disponível neste ambiente"], ["XX000", "conexão"]])("erro %s permite tentativa explícita sem vazar detalhes", async (code, message) => {
    mocks.collectExport.mockRejectedValue({ code, message: "segredo SQL" });
    render(<SalesExportActions filters={{}} />); fireEvent.click(filtered()); expect((await screen.findByRole("alert")).textContent).toContain(message);
    expect(screen.queryByText("segredo SQL")).toBeNull(); expect(mocks.downloadExport).not.toHaveBeenCalled();
    mocks.collectExport.mockResolvedValue(exportFixture()); fireEvent.click(screen.getByRole("button", { name: "Tentar exportar novamente" }));
    await screen.findByText("Download iniciado.");
  });
  it.each(["identity", "permissions", "filters", "unmount"])("descarta exportação pendente: %s", async change => {
    const final = deferred<void>(); mocks.validateExport.mockReturnValue(final.promise);
    const view = render(<SalesExportActions filters={{ method: "Stone" }} />);
    fireEvent.click(filtered()); await waitFor(() => expect(mocks.validateExport).toHaveBeenCalled());
    if (change === "identity") auth.session.user.id = "another";
    if (change === "permissions") auth.grants = [];
    if (change === "unmount") view.unmount();
    else view.rerender(<SalesExportActions filters={{ method: change === "filters" ? "PIX" : "Stone" }} />);
    await act(async () => final.resolve()); expect(mocks.downloadExport).not.toHaveBeenCalled();
  });
  it("revogação final impede download mesmo com Blob pronto", async () => {
    mocks.validateExport.mockRejectedValue({ code: "42501" }); render(<SalesExportActions filters={{}} />);
    fireEvent.click(filtered()); await screen.findByRole("alert"); expect(mocks.exportBlob).toHaveBeenCalled(); expect(mocks.downloadExport).not.toHaveBeenCalled();
  });
  it("Lançamentos usa URL aplicada, não rascunho dos controles nem página25", async () => {
    render(<MemoryRouter initialEntries={["/sales/entries?from=2026-09-01&to=2026-09-30&method=Stone"]}><SalesPage /></MemoryRouter>);
    await screen.findByText("Nenhum lançamento encontrado");
    fireEvent.change(screen.getByLabelText("Data inicial"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Forma de pagamento"), { target: { value: "PIX" } });
    fireEvent.click(filtered()); await screen.findByText("Download iniciado.");
    expect(mocks.collectExport).toHaveBeenCalledWith("filtered", { from: "2026-09-01", to: "2026-09-30", method: "Stone" }, expect.any(Function));
  });
  it("Dashboard não oferece exportação mesmo com todas as permissões", async () => {
    render(<MemoryRouter initialEntries={["/sales/dashboard?from=2026-09&to=2026-09"]}><SalesDashboardPage /></MemoryRouter>);
    await screen.findByText("Total financeiro do período", { exact: true });
    expect(screen.queryByRole("button", { name: /Exportar/ })).toBeNull();
    expect(screen.queryByRole("group", { name: "Exportação Excel de Vendas" })).toBeNull();
    expect(mocks.collectExport).not.toHaveBeenCalled();
  });
  it("tabela mostra criador por nome e fallback sem e-mail", async () => {
    mocks.listEntries.mockResolvedValue([
      { id: "a", sale_date: "2026-09-01", unit_id: exportUnit, payment_method: "Stone", amount: "1.00", created_by_name: "Pessoa sintética" },
      { id: "b", sale_date: "2026-09-02", unit_id: exportUnit, payment_method: "PIX", amount: "2.00", created_by_name: null },
    ]);
    render(<MemoryRouter><SalesPage /></MemoryRouter>);
    await screen.findByRole("columnheader", { name: "Lançado por" });
    expect(screen.getByRole("cell", { name: "Pessoa sintética" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Não identificado" })).toBeTruthy();
  });
  it("cadastro continua disponível sem permissão de exportação", async () => {
    auth.grants = [grant("sales.entry.read"), grant("sales.entry.create")];
    mocks.listSalesUnits.mockResolvedValue([{ id: exportUnit, code: "A", name: "Unidade A", active: true, can_read: true, can_create: true, can_edit: false, can_delete: false }]);
    render(<MemoryRouter><SalesPage /></MemoryRouter>);
    await screen.findByText("Nenhum lançamento encontrado");
    expect(screen.queryByRole("group", { name: "Exportação Excel de Vendas" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Novo lançamento" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
  it("ações dos lançamentos ficam entre filtros e tabela, fora do título", async () => {
    render(<MemoryRouter><SalesPage /></MemoryRouter>);
    await screen.findByText("Nenhum lançamento encontrado");
    const group = screen.getByRole("group", { name: "Ações dos lançamentos" });
    expect(within(group).getAllByRole("button").map(button => button.textContent)).toEqual([
      "Exportar período filtrado", "Exportar histórico completo autorizado", "Novo lançamento",
    ]);
    const exportGroup = within(group).getByRole("group", { name: "Exportação Excel de Vendas" });
    const createGroup = within(group).getByRole("group", { name: "Cadastro de lançamento" });
    expect(within(exportGroup).getAllByRole("button")).toHaveLength(2);
    expect(within(createGroup).getByRole("button", { name: "Novo lançamento" })).toBeTruthy();
    expect(exportGroup.contains(within(createGroup).getByRole("button"))).toBe(false);
    const filters = screen.getByRole("button", { name: "Aplicar filtros" }).closest("form")!;
    expect(filters.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(group.compareDocumentPosition(screen.getByText("Nenhum lançamento encontrado")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Lançamentos" }).parentElement?.contains(within(group).getByRole("button", { name: "Novo lançamento" }))).toBe(false);
  });
});
