import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), schema: vi.fn() }));
vi.mock("../apps/web/src/core/client", () => ({ client: { schema: mocks.schema } }));
import { collectExport, exportMessage, exportPage, parseExportPage, validateExport } from "../apps/web/src/modules/sales/export/api";
import { exportFixture, exportUnit } from "./fixtures/sales-export";
beforeEach(() => {
  vi.resetAllMocks(); mocks.schema.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: exportFixture(), error: null });
});
describe("VEN-05A — transporte e reconciliação", () => {
  it("somente RPC pública específica, filtros aplicados e sem float", async () => {
    await exportPage("filtered", { from: "2026-09-01", to: "2026-09-30", unit_ids: [exportUnit], method: "Stone" });
    expect(mocks.rpc).toHaveBeenCalledWith("sales_export_page", { p_mode: "filtered", p_from: "2026-09-01", p_to: "2026-09-30", p_units: [exportUnit], p_method: "Stone", p_offset: 0, p_limit: 500, p_token: null });
    expect(mocks.schema).toHaveBeenCalledWith("public");
    expect((await collectExport("filtered", {}, () => false)).total).toBe("0.11");
  });
  it("itera até o fim e reautoriza no final com o token original", async () => {
    const f = exportFixture();
    mocks.rpc.mockResolvedValueOnce({ data: { ...f, rows: f.rows.slice(0, 1), next_offset: 1 }, error: null })
      .mockResolvedValueOnce({ data: { ...f, rows: f.rows.slice(1), offset: 1, next_offset: 2 }, error: null })
      .mockResolvedValueOnce({ data: { ...f, rows: [], offset: 2, next_offset: 2 }, error: null });
    const report = await collectExport("filtered", {}, () => false); await validateExport(report, {});
    expect(report.rows).toHaveLength(2);
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "sales_export_page", expect.objectContaining({ p_offset: 1, p_token: f.token }));
    expect(mocks.rpc).toHaveBeenLastCalledWith("sales_export_page", expect.objectContaining({ p_offset: 2, p_token: f.token }));
  });
  it.each(["numeric", "decimal", "duplicate", "order", "count", "sum", "unit", "adjustment", "incomplete", "author"])("recusa contrato inválido: %s", async kind => {
    const f = exportFixture();
    if (kind === "author") f.rows[0].created_by_name = 42 as unknown as string;
    if (kind === "numeric") f.rows[0].amount = 0.01 as unknown as string;
    if (kind === "decimal") f.rows[0].amount = "0.001";
    if (kind === "duplicate") f.rows = [f.rows[0], f.rows[0]];
    if (kind === "order") f.rows.reverse();
    if (kind === "count") f.record_count = 3;
    if (kind === "sum") { f.entry_total = "0.02"; f.total = "0.12"; }
    if (kind === "unit") f.rows[0].unit_id = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    if (kind === "adjustment") f.units[0].adjustments_authorized = false;
    if (kind === "incomplete") { f.rows = []; f.next_offset = 0; }
    mocks.rpc.mockResolvedValue({ data: f, error: null });
    await expect(collectExport("filtered", {}, () => false)).rejects.toThrow();
  });
  it("mudança de token, cancelamento e sessão expirada impedem continuidade", async () => {
    const f = exportFixture();
    mocks.rpc.mockResolvedValueOnce({ data: { ...f, rows: [f.rows[0]], next_offset: 1 }, error: null })
      .mockResolvedValueOnce({ data: { ...f, rows: [f.rows[1]], offset: 1, next_offset: 2, token: "b".repeat(64) }, error: null });
    await expect(collectExport("filtered", {}, () => false)).rejects.toThrow("incompatível");
    await expect(collectExport("full", {}, () => true)).rejects.toThrow("cancelada");
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST301", message: "segredo" } });
    await expect(exportPage("full", {})).rejects.toMatchObject({ code: "PGRST301" });
    expect(exportMessage({ code: "PGRST301", message: "segredo" })).toContain("sessão expirou");
    expect(exportMessage(Object.assign(new Error("segredo"), { code: "XX000" }))).not.toContain("segredo");
  });
  it("mensagens explícitas de volume, concorrência e autorização", () => {
    expect(exportMessage({ code: "54000" })).toContain("Limite de volume");
    expect(exportMessage({ code: "40001" })).toContain("mudaram");
    expect(exportMessage({ code: "42501" })).toContain("permissão");
    expect(() => parseExportPage(null)).toThrow();
  });
  it.each(["PGRST202", "42883"])("RPC ausente (%s) informa indisponibilidade do recurso sem expor o banco", async code => {
    const error = { code, message: "Could not find public.sales_export_page; detalhe privado", details: "SQL privado" };
    mocks.rpc.mockResolvedValue({ data: null, error });
    await expect(exportPage("full", {})).rejects.toMatchObject({ code });
    const text = exportMessage(error);
    expect(text).toContain("ainda não está disponível neste ambiente");
    expect(text).not.toContain("conexão");
    expect(text).not.toMatch(/sales_export_page|SQL privado|detalhe privado/);
    // Status HTTP isolado não basta: uma rota/proxy 404 não prova ausência da RPC.
    expect(exportMessage({ status: 404, message: "rota ausente" })).toContain("conexão");
  });
});
