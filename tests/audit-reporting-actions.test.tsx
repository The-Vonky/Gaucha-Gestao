// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportingActions } from "../apps/web/src/modules/audit/reporting/ReportingActions";
import { ChecklistItem } from "../apps/web/src/modules/audit/ChecklistItem";
import type { Answer } from "../apps/web/src/modules/audit/types";

const state = vi.hoisted(() => ({ session: true, read: true, export: true }));
const rpc = vi.hoisted(() => ({ inspectionExport: vi.fn(), historyExport: vi.fn() }));
vi.mock("../apps/web/src/core/auth/AuthProvider", () => ({
  useAuth: () => ({ session: state.session ? { user: { id: "user" } } : null,
    can: (permission: string) => permission === "audit.inspection.read" ? state.read : state.export }),
}));
vi.mock("../apps/web/src/modules/audit/reporting/api", () => rpc);
const files = vi.hoisted(() => ({ workbookBlob: vi.fn(), download: vi.fn() }));
vi.mock("../apps/web/src/modules/audit/reporting/workbook", () => ({ workbookBlob: files.workbookBlob }));
vi.mock("../apps/web/src/modules/audit/reporting/download", async (original) => ({
  ...await original<typeof import("../apps/web/src/modules/audit/reporting/download")>(),
  download: files.download,
}));
const audit = vi.hoisted(() => ({ saveAnswer: vi.fn(), answer: vi.fn() }));
vi.mock("../apps/web/src/modules/audit/api", () => audit);
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
  it.each(["excel", "print"] as const)("guides a >5,000 history %s error without preparing output and allows retry", async (output) => {
    const user = userEvent.setup();
    const history = { ...report, kind: "unit_history", records: [], filters: { from: null, to: null },
      ordering: "applied_on DESC, created_at DESC, id DESC", record_count: 0 };
    rpc.historyExport.mockRejectedValueOnce({ code: "22023", message: "Narrow the date range" })
      .mockResolvedValueOnce(history);
    files.workbookBlob.mockResolvedValue(new Blob(["workbook"]));
    render(<ReportingActions kind="unit_history" unitId="unit" from="2026-01-01" to="2026-09-30" />);
    await user.click(screen.getByRole("button", { name: output === "excel" ? "Exportar histórico" : "Imprimir / PDF" }));
    expect(await screen.findByText(/Mais de 5.000 auditorias. Reduza o intervalo de datas e tente novamente/)).toBeTruthy();
    expect(files.workbookBlob).not.toHaveBeenCalled();
    expect(files.download).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Prévia de impressão" })).toBeNull();
    const retry = screen.getByRole("button", { name: "Tentar novamente" }) as HTMLButtonElement;
    expect(retry.disabled).toBe(false);
    await user.click(retry);
    expect(rpc.historyExport).toHaveBeenCalledTimes(2);
    if (output === "excel") {
      await waitFor(() => expect(files.download).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole("dialog")).toBeNull();
    } else {
      expect(await screen.findByRole("dialog", { name: "Prévia de impressão" })).toBeTruthy();
      expect(files.workbookBlob).not.toHaveBeenCalled();
      expect(files.download).not.toHaveBeenCalled();
    }
  });
  it.each([
    { code: "22023", message: "SQL private detail" },
    { code: "XX000", message: "Narrow the date range" },
  ])("keeps other SQL errors behind the safe fallback: $code", async (error) => {
    const user = userEvent.setup();
    rpc.historyExport.mockRejectedValueOnce(error);
    render(<ReportingActions kind="unit_history" unitId="unit" from="" to="" />);
    await user.click(screen.getByRole("button", { name: "Exportar histórico" }));
    expect(await screen.findByText(/Verifique sua conexão/)).toBeTruthy();
    expect(screen.queryByText(/Reduza o intervalo/)).toBeNull();
    expect(screen.getByRole("status").textContent).not.toContain(error.message);
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

describe("Checklist save state that gates reports", () => {
  const item = { template_version: "v", key: "item-001", section_key: "s1", position: 1, number: 1, text: "Piso íntegro?" };
  const base: Answer = { inspection_id: "i1", template_version: "v", item_key: "item-001", response: null,
    observation: "", version: 1, updated_at: "", updated_by: null };
  function setup() {
    const pending = vi.fn();
    function Host() {
      const [row, setRow] = React.useState(base);
      return <ChecklistItem item={item} row={row} editable onChange={setRow} onPending={pending} onConflict={() => undefined} />;
    }
    render(<Host />);
    return { pending, last: () => pending.mock.calls.at(-1)?.[1] };
  }
  const saved = (over: Partial<Answer>) => ({ ...base, version: 2, ...over });
  it("keeps reports blocked for text typed while an earlier save is in flight", async () => {
    const user = userEvent.setup();
    let finish!: (row: Answer) => void;
    audit.saveAnswer.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockImplementationOnce(async (_: Answer, values: Partial<Answer>) => saved({ version: 3, ...values }));
    const { last } = setup();
    const box = screen.getByRole("textbox");
    await user.type(box, "abc");
    expect(last()).toBe(true);
    await user.tab();
    await waitFor(() => expect(audit.saveAnswer).toHaveBeenCalledTimes(1));
    await user.type(box, "d");
    finish(saved({ observation: "abc" }));
    await waitFor(() => expect(screen.getByText("Salvo")).toBeTruthy());
    expect(last()).toBe(true);
    await user.tab();
    await waitFor(() => expect(audit.saveAnswer).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(last()).toBe(false));
    expect(audit.saveAnswer.mock.calls[1][1]).toMatchObject({ observation: "abcd" });
  });
  it("does not release after a failed text save when another save succeeds, only after the text is saved", async () => {
    const user = userEvent.setup();
    audit.saveAnswer.mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "08006" }))
      .mockImplementationOnce(async (_: Answer, values: Partial<Answer>) => saved(values))
      .mockImplementationOnce(async (_: Answer, values: Partial<Answer>) => saved({ response: "AT", version: 3, ...values }));
    const { last } = setup();
    await user.type(screen.getByRole("textbox"), "nota");
    await user.tab();
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(last()).toBe(true);
    await user.click(screen.getByRole("button", { name: /\(AT\)/ }));
    await waitFor(() => expect(audit.saveAnswer).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText("Salvo")).toBeTruthy());
    expect(last()).toBe(true);
    await user.click(screen.getByRole("textbox"));
    await user.tab();
    await waitFor(() => expect(audit.saveAnswer).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(last()).toBe(false));
  });
});
