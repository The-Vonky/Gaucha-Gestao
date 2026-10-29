// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { visibleNavigation } from "../apps/web/src/app/navigation";
import type { AccessGrant } from "../apps/web/src/core/auth/permissions";
import { can } from "../apps/web/src/core/auth/permissions";
import { SalesPage } from "../apps/web/src/modules/sales/SalesPage";
import type { SalesEntry, SalesUnit } from "../apps/web/src/modules/sales/types";

const api = vi.hoisted(() => ({ listSalesUnits: vi.fn(), listEntries: vi.fn(), entryDetail: vi.fn(), createEntry: vi.fn(), updateEntry: vi.fn(), deleteEntry: vi.fn() }));
const auth = vi.hoisted(() => ({ profile: { active: true }, session: { user: { id: "user-test" } }, grants: [] as AccessGrant[] }));
vi.mock("../apps/web/src/core/auth/AuthProvider", () => ({ useAuth: () => ({ ...auth, can: (p: string, scope = {}) => can(auth.profile.active, auth.grants, p, scope) }) }));
vi.mock("../apps/web/src/modules/sales/api", async original => ({ ...await original<object>(), ...api }));
const grant = (action: string, scope_type: AccessGrant["scope_type"] = "unit", unit_id = "A"): AccessGrant => ({ permission: `sales.entry.${action}`, scope_type, unit_id: scope_type === "global" ? null : unit_id, sector_id: scope_type === "sector" ? "S" : null });
const A: SalesUnit = { id: "A", code: "01", name: "Unidade A", active: true, can_read: true, can_create: true, can_edit: true, can_delete: true };
const B: SalesUnit = { ...A, id: "B", code: "02", name: "Histórica B", active: false };
const row: SalesEntry = { id: "entry-test", sale_date: "2026-10-28", unit_id: "A", payment_method: "Stone", amount: "1250.30", version: 3, created_by: "colleague", updated_by: "colleague", created_at: "", updated_at: "", deleted_at: null, deleted_by: null };
function Location() { return <output data-testid="location">{useLocation().search}</output>; }
function mount(path = "/sales") { return render(<MemoryRouter initialEntries={[path]}><SalesPage /><Location /></MemoryRouter>); }
function field(name: string) { return within(screen.getByRole("dialog")).getByLabelText(name); }
async function createForm() { fireEvent.click(await screen.findByRole("button", { name: "Novo lançamento" })); }
async function fill(value = "0,01", method = "PIX") {
  fireEvent.change(field("Unidade"), { target: { value: "A" } });
  fireEvent.change(field("Data"), { target: { value: "2026-10-29" } });
  fireEvent.change(field("Forma de pagamento"), { target: { value: method } });
  fireEvent.change(field("Valor (R$)"), { target: { value } });
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => {
  vi.resetAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  auth.profile.active = true; auth.grants = ["read", "create", "edit", "delete"].map(p => grant(p));
  api.listSalesUnits.mockResolvedValue([A, B]); api.listEntries.mockResolvedValue([row]); api.entryDetail.mockResolvedValue(row);
  api.createEntry.mockResolvedValue(row); api.updateEntry.mockResolvedValue(row); api.deleteEntry.mockResolvedValue({ ...row, deleted_at: "now", version: 4 });
});
afterEach(cleanup);

describe("VEN-04A — acesso e consulta", () => {
  it("menu Comercial habilita cada capacidade global/unitária, nega setor e inativo", () => {
    for (const action of ["read", "create", "edit", "delete"]) {
      for (const scope of ["global", "unit"] as const) expect(visibleNavigation(true, [grant(action, scope)])[0].destinations[0].path).toBe("/sales");
      expect(visibleNavigation(true, [grant(action, "sector")])).toEqual([]);
      expect(visibleNavigation(false, [grant(action)])).toEqual([]);
    }
  });
  it.each([{ grants: [] as AccessGrant[] }, { grants: [grant("read", "sector")] }])("nega página e não faz RPC para grants $grants", async ({ grants }) => {
    auth.grants = grants; mount(); expect(await screen.findByText("Acesso não autorizado")).toBeTruthy();
    expect(api.listEntries).not.toHaveBeenCalled(); expect(api.listSalesUnits).not.toHaveBeenCalled();
  });
  it("criador sem leitura não consulta e não recebe edição/exclusão", async () => {
    auth.grants = [grant("create")]; api.listSalesUnits.mockResolvedValue([{ ...A, can_read: false, can_edit: false, can_delete: false }]);
    mount(); await createForm(); await fill(); fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByText("Lançamento cadastrado."); expect(api.listEntries).not.toHaveBeenCalled(); expect(api.entryDetail).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Editar/ })).toBeNull();
  });
  it("leitor não recebe ações de escrita nem unidade fora da leitura", async () => {
    auth.grants = [grant("read")]; api.listSalesUnits.mockResolvedValue([{ ...A, can_create: false, can_edit: false, can_delete: false }, { ...B, can_read: false }]);
    mount(); await screen.findByText("R$ 1.250,30"); expect(screen.queryByRole("button", { name: "Novo lançamento" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar/ })).toBeNull(); expect(screen.queryByRole("option", { name: /Histórica B/ })).toBeNull();
  });
  it("filtra datas, unidade inativa e PIX, mantém URL e não inventa total", async () => {
    mount(); await screen.findByText("R$ 1.250,30");
    fireEvent.change(screen.getByLabelText("Data inicial"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Data final"), { target: { value: "2026-10-29" } });
    fireEvent.change(screen.getByLabelText("Unidade"), { target: { value: "B" } });
    fireEvent.change(screen.getByLabelText("Forma de pagamento"), { target: { value: "PIX" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await waitFor(() => expect(api.listEntries).toHaveBeenLastCalledWith({ from: "2026-01-01", to: "2026-10-29", unit_id: "B", payment_method: "PIX", limit: 26, offset: 0 }));
    expect(screen.getByTestId("location").textContent).toContain("unit=B");
    expect(api.listSalesUnits).toHaveBeenCalledTimes(1);
  });
  it("pagina com lookahead e retorna à primeira quando a última esvazia", async () => {
    api.listEntries.mockResolvedValueOnce(Array.from({ length: 26 }, (_, i) => ({ ...row, id: `e${i}` }))).mockResolvedValueOnce([]).mockResolvedValue([row]);
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(api.listEntries).toHaveBeenCalledWith(expect.objectContaining({ offset: 25 })));
    await waitFor(() => expect(screen.getByTestId("location").textContent).not.toContain("page="));
    await screen.findByText("R$ 1.250,30");
  });
  it("descarta respostas obsoletas durante troca rápida de filtros", async () => {
    const slow = deferred<SalesEntry[]>(); api.listEntries.mockResolvedValueOnce([row]).mockReturnValueOnce(slow.promise).mockResolvedValueOnce([{ ...row, payment_method: "Stone", amount: "0.01" }]);
    mount(); await screen.findByText("R$ 1.250,30");
    fireEvent.change(screen.getByLabelText("Forma de pagamento"), { target: { value: "PIX" } }); fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await waitFor(() => expect(api.listEntries).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText("Forma de pagamento"), { target: { value: "Stone" } }); fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await screen.findByText("R$ 0,01"); await act(async () => slow.resolve([row]));
    expect(screen.queryByText("R$ 1.250,30")).toBeNull();
  });
  it.each([["42501", "permissão"], ["PGRST301", "sessão expirou"], ["XX000", "conexão"]])("erro %s seguro e recuperável", async (code, text) => {
    api.listEntries.mockRejectedValue({ code, message: "SQL segredo" }); mount(); await screen.findByText(new RegExp(text)); expect(screen.queryByText("SQL segredo")).toBeNull();
    api.listEntries.mockResolvedValue([]); fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" })); await screen.findByText("Nenhum lançamento encontrado");
  });
});

describe("VEN-04A — cadastro", () => {
  it.each([["0,01", "PIX", "0.01"], ["1.250,30", "Stone", "1250.30"]])("cadastra %s %s e atualiza sem perder filtros", async (value, method, amount) => {
    mount("/sales?method=Stone"); await createForm(); await fill(value, method); fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByText("Lançamento cadastrado."); expect(api.createEntry).toHaveBeenCalledWith({ sale_date: "2026-10-29", unit_id: "A", payment_method: method, amount });
    expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.getByTestId("location").textContent).toBe("?method=Stone");
    await waitFor(() => expect(api.listEntries).toHaveBeenCalledTimes(2));
  });
  it.each(["1,001", "0", "-1", "1.23"])("rejeita %s antes da RPC", async value => {
    mount(); await createForm(); await fill(value); fireEvent.click(screen.getByRole("button", { name: "Salvar" })); await screen.findByRole("alert"); expect(api.createEntry).not.toHaveBeenCalled();
  });
  it("não oferece inativa para novo lançamento e impede submissão dupla", async () => {
    const slow = deferred<SalesEntry>(); api.createEntry.mockReturnValue(slow.promise); mount(); await createForm();
    expect(within(screen.getByRole("dialog")).queryByRole("option", { name: /Histórica/ })).toBeNull(); await fill();
    const form = screen.getByRole("button", { name: "Salvar" }).closest("form")!; fireEvent.submit(form); fireEvent.submit(form);
    expect(api.createEntry).toHaveBeenCalledTimes(1); expect(screen.getByRole("button", { name: "Salvando…" }).closest("fieldset")?.disabled).toBe(true);
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true })); expect(screen.getByRole("dialog")).toBeTruthy();
    await act(async () => slow.resolve(row)); await screen.findByText("Lançamento cadastrado.");
  });
  it("duplicidade mantém campos e informa combinação ocupada", async () => {
    api.createEntry.mockRejectedValue({ code: "23505" }); mount(); await createForm(); await fill("0,29"); fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByText(/Já existe lançamento ativo/); expect((field("Valor (R$)") as HTMLInputElement).value).toBe("0,29");
  });
  it("falha de rede em criação bloqueia repetição ambígua e preserva os campos", async () => {
    api.createEntry.mockRejectedValue(new TypeError("Failed to fetch")); mount(); await createForm(); await fill("0,29");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByText(/Não foi possível confirmar o cadastro/);
    expect((screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(screen.getByRole("button", { name: "Salvar" }).closest("form")!);
    expect(api.createEntry).toHaveBeenCalledTimes(1); expect((field("Valor (R$)") as HTMLInputElement).value).toBe("0,29");
  });
  it("teclado abre e fecha formulário sem mutação", async () => {
    const user = userEvent.setup(); mount(); const button = await screen.findByRole("button", { name: "Novo lançamento" }); button.focus(); await user.keyboard("{Enter}");
    await screen.findByRole("dialog"); fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull(); expect(api.createEntry).not.toHaveBeenCalled();
  });
});

describe("VEN-04A — correção e exclusão", () => {
  it("edita registro de colega com versão e chave completa, inclusive unidade", async () => {
    auth.grants = [grant("read"), grant("edit"), grant("edit", "unit", "B")]; api.listSalesUnits.mockResolvedValue([A, { ...B, active: true }]);
    mount(); fireEvent.click(await screen.findByRole("button", { name: /Editar/ })); await screen.findByRole("dialog"); await fill("1.000.000,99", "PIX"); fireEvent.change(field("Unidade"), { target: { value: "B" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" })); await screen.findByText("Lançamento atualizado.");
    expect(api.updateEntry).toHaveBeenCalledWith(row.id, 3, { sale_date: "2026-10-29", unit_id: "B", payment_method: "PIX", amount: "1000000.99" });
  });
  it("conflito exige reconsulta e decisão explícita, preserva valor digitado", async () => {
    api.updateEntry.mockRejectedValueOnce({ code: "40001" }).mockResolvedValue(row);
    api.entryDetail.mockResolvedValueOnce(row).mockResolvedValueOnce({ ...row, version: 4, amount: "9.99" });
    mount(); fireEvent.click(await screen.findByRole("button", { name: /Editar/ })); await screen.findByRole("dialog"); await fill("0,29"); fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByText(/O lançamento mudou/); expect((screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Consultar versão atual" })); await screen.findByText(/Versão atual 4/);
    expect((field("Valor (R$)") as HTMLInputElement).value).toBe("0,29"); expect(api.updateEntry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Usar versão atual e manter campos" })); fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.updateEntry).toHaveBeenLastCalledWith(row.id, 4, expect.objectContaining({ amount: "0.29" })));
  });
  it("inativa original pode ser corrigida, destino inativo não aparece", async () => {
    api.entryDetail.mockResolvedValue({ ...row, unit_id: "B" }); mount(); fireEvent.click(await screen.findByRole("button", { name: /Editar/ }));
    await screen.findByRole("dialog"); expect(within(screen.getByRole("dialog")).getByRole("option", { name: /inativa — histórico/ })).toBeTruthy();
    fireEvent.change(field("Valor (R$)"), { target: { value: "0,01" } }); fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.updateEntry).toHaveBeenCalledWith(row.id, 3, expect.objectContaining({ unit_id: "B", amount: "0.01" })));
  });
  it("conflito com transferência não troca silenciosamente o destino inativo digitado", async () => {
    const historical = { ...row, unit_id: "B" };
    api.entryDetail.mockResolvedValueOnce(historical).mockResolvedValueOnce({ ...row, version: 4 });
    api.updateEntry.mockRejectedValueOnce({ code: "40001" });
    mount(); fireEvent.click(await screen.findByRole("button", { name: /Editar/ })); await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" })); await screen.findByText(/O lançamento mudou/);
    fireEvent.click(screen.getByRole("button", { name: "Consultar versão atual" })); await screen.findByText(/Versão atual 4/);
    fireEvent.click(screen.getByRole("button", { name: "Usar versão atual e manter campos" }));
    expect((field("Unidade") as HTMLSelectElement).value).toBe("B");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" })); await screen.findByText("Selecione uma unidade autorizada para esta operação.");
    expect(api.updateEntry).toHaveBeenCalledTimes(1);
  });
  it.each(["42501", "P0002"])("erro %s de edição preserva campos sem revelar destino", async code => {
    api.updateEntry.mockRejectedValue({ code, message: "destino privado" }); mount(); fireEvent.click(await screen.findByRole("button", { name: /Editar/ })); await screen.findByRole("dialog"); await fill("0,29"); fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findAllByRole("alert"); expect((field("Valor (R$)") as HTMLInputElement).value).toBe("0,29"); expect(screen.queryByText("destino privado")).toBeNull();
  });
  it("cancela confirmação sem motivo e exclui colega com versão", async () => {
    mount(); fireEvent.click(await screen.findByRole("button", { name: /Excluir/ })); await screen.findByRole("dialog"); expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" })); expect(api.deleteEntry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Excluir/ })); await screen.findByRole("dialog"); api.listEntries.mockResolvedValue([]); fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await screen.findByText("Lançamento excluído."); await screen.findByText("Nenhum lançamento encontrado"); expect(api.deleteEntry).toHaveBeenCalledWith(row.id, 3);
  });
  it("conflito de exclusão bloqueia confirmação sem substituir versão automaticamente", async () => {
    api.deleteEntry.mockRejectedValue({ code: "40001" }); mount(); fireEvent.click(await screen.findByRole("button", { name: /Excluir/ })); await screen.findByRole("dialog"); fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await screen.findByText(/Cancele esta confirmação/); expect((screen.getByRole("button", { name: "Confirmar" }) as HTMLButtonElement).disabled).toBe(true); expect(api.deleteEntry).toHaveBeenCalledTimes(1);
  });
});
