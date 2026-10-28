import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), schema: vi.fn() }));
vi.mock("../apps/web/src/core/client", () => ({ client: { schema: mocks.schema } }));
import { salesDashboard } from "../apps/web/src/modules/sales/api";
import { parseSalesDashboard } from "../apps/web/src/modules/sales/analytics";
const payload = { contract_version: 1, summary: { total: "12345678901234567890.29" },
  months: [], units: [], ranking: [], unit_months: [] };
beforeEach(() => {
  vi.clearAllMocks(); mocks.schema.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: payload, error: null });
});
describe("VEN-03 — transporte analítico", () => {
  it("preserva string acima do limite Number e Stone padrão; encaminha todos os filtros", async () => {
    expect((await salesDashboard({ from: "2026-01-01", to: "2026-09-01" })).summary.total).toBe("12345678901234567890.29");
    expect(mocks.schema).toHaveBeenCalledWith("public");
    expect(mocks.rpc).toHaveBeenLastCalledWith("sales_dashboard", { p_from: "2026-01-01", p_to: "2026-09-01", p_units: null, p_scope: "stone", p_daily_month: null });
    await salesDashboard({ from: "2026-01-01", to: "2026-09-01", unit_ids: ["synthetic"], scope: "combined", daily_month: "2026-02-01" });
    expect(mocks.rpc).toHaveBeenLastCalledWith("sales_dashboard", expect.objectContaining({ p_units: ["synthetic"], p_scope: "combined", p_daily_month: "2026-02-01" }));
  });
  it("recusa dinheiro numérico, escala errada e proporção inválida em qualquer nível", () => {
    for (const data of [null, {}, { ...payload, contract_version: 2 }, { ...payload, summary: { total: 0.29 } },
      { ...payload, months: [{ total: "0.1" }] }, { ...payload, daily: { points: [{ cumulative: 0.29 }] } },
      { ...payload, ranking: [{ total: "1.00", share_pct: "NaN" }] }])
      expect(() => parseSalesDashboard(data)).toThrow("incompatível");
    expect(parseSalesDashboard({ ...payload, months: [{ projection: null, daily_average: null }] })).toBeTruthy();
  });
  it("preserva erro de autorização SQL", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    await expect(salesDashboard({ from: "2026-01-01", to: "2026-09-01" })).rejects.toEqual({ code: "42501" });
  });
});
