// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportingActions } from "../apps/web/src/modules/audit/reporting/ReportingActions";

const state = vi.hoisted(() => ({ session: true, read: true, export: true }));
const rpc = vi.hoisted(() => ({ inspectionExport: vi.fn(), historyExport: vi.fn() }));
vi.mock("../apps/web/src/core/auth/AuthProvider", () => ({
  useAuth: () => ({ session: state.session ? { user: { id: "user" } } : null,
    can: (permission: string) => permission === "audit.inspection.read" ? state.read : state.export }),
}));
vi.mock("../apps/web/src/modules/audit/reporting/api", () => rpc);
const report = { schema_version: 1, kind: "inspection", generated_at: "2026-09-29T12:00:00Z",
  display_timezone: "America/Sao_Paulo", generated_by: { id: "u", name: "Ana" },
  unit: { id: "unit", code: "A", name: "Unidade" }, record_count: 1,
  inspection: { id: "inspection", template_version: "v1", applied_on: "2026-09-29", previous_visit_on: null,
    responsible_id: "u", responsible_name: "Ana", status: "draft", counts: { total: 0, answered: 0, unanswered: 0, applicable: 0, at: 0, ap: 0, nat: 0, nap: 0 },
    progress_percent: 0, score: null, classification: null, finalized_at: null, version: 1, created_at: "2026-09-29T12:00:00Z" }, sections: [] };
afterEach(() => { cleanup(); vi.clearAllMocks(); Object.assign(state, { session: true, read: true, export: true }); });
describe("Report actions", () => {
  const component = () => <ReportingActions kind="inspection" inspectionId="inspection" unitId="unit" />;
  it("requires both permissions and an active session in the UI", () => {
    state.export = false;
    const view = render(component());
    expect(screen.queryByRole("button", { name: "Exportar Excel" })).toBeNull();
    state.export = true; state.read = false; view.rerender(component());
    expect(screen.queryByRole("button", { name: "Imprimir / PDF" })).toBeNull();
    state.read = true; state.session = false; view.rerender(component());
    expect(screen.queryByRole("button", { name: "Exportar Excel" })).toBeNull();
    state.session = true; view.rerender(component());
    expect(screen.getByRole("button", { name: "Exportar Excel" })).toBeTruthy();
  });
  it("prevents duplicate requests, exposes status/error/retry and drops prepared data on session loss", async () => {
    const user = userEvent.setup();
    let rejectRequest!: (reason: Error) => void;
    rpc.inspectionExport.mockImplementationOnce(() => new Promise((_, reject) => { rejectRequest = reject; }))
      .mockResolvedValue(report);
    const view = render(component());
    const print = screen.getByRole("button", { name: "Imprimir / PDF" });
    await user.click(print);
    expect(screen.getByRole("status").textContent).toContain("Preparando");
    expect((print as HTMLButtonElement).disabled).toBe(true);
    expect(rpc.inspectionExport).toHaveBeenCalledTimes(1);
    rejectRequest(new Error("Falha na rede"));
    expect(await screen.findByText(/Erro ao gerar relatório: Não foi possível concluir/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("dialog", { name: "Prévia de impressão" })).toBeTruthy();
    expect(rpc.inspectionExport).toHaveBeenCalledTimes(2);
    state.session = false; view.rerender(component());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Prévia de impressão" })).toBeNull());
  });
  it("discards a request when an answer becomes unsaved during generation", async () => {
    const user = userEvent.setup();
    let finish!: (value: unknown) => void;
    rpc.inspectionExport.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const view = render(<ReportingActions kind="inspection" inspectionId="inspection" unitId="unit" blocked={false} />);
    await user.click(screen.getByRole("button", { name: "Imprimir / PDF" }));
    view.rerender(<ReportingActions kind="inspection" inspectionId="inspection" unitId="unit" blocked />);
    finish(report);
    await waitFor(() => expect(screen.queryByRole("status")?.textContent).toBe(""));
    expect(screen.queryByRole("dialog", { name: "Prévia de impressão" })).toBeNull();
  });
});
