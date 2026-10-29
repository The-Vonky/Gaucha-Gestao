import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), schema: vi.fn() }));
vi.mock("../apps/web/src/core/client", () => ({
  client: { schema: mocks.schema },
}));
import { createEntry, deleteEntry, entryDetail, listEntries, listSalesUnits, salesMessage, updateEntry } from "../apps/web/src/modules/sales/api";

const row = { id: "synthetic-id", sale_date: "2026-10-28", unit_id: "synthetic-unit",
  payment_method: "Stone" as const, amount: "999999999999.99", version: 2 };
const input = { sale_date: row.sale_date, unit_id: row.unit_id, payment_method: row.payment_method, amount: row.amount };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.schema.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: row, error: null });
});

describe("VEN-02 — transporte sem perda de centavos", () => {
  it("VEN-04A pagina referências e rejeita capacidades incompatíveis", async () => {
    const unit = { id: "u", code: "01", name: "Sintética", active: false, can_read: false, can_create: true, can_edit: false, can_delete: false };
    mocks.rpc.mockResolvedValueOnce({ data: Array(100).fill(unit), error: null }).mockResolvedValueOnce({ data: [unit], error: null });
    expect(await listSalesUnits()).toHaveLength(101);
    expect(mocks.rpc).toHaveBeenLastCalledWith("sales_operation_units", { p_limit: 100, p_offset: 100 });
    mocks.rpc.mockResolvedValue({ data: [{ ...unit, can_read: "true" }], error: null });
    await expect(listSalesUnits()).rejects.toThrow("Catálogo operacional incompatível");
  });
  it("chama as cinco RPCs públicas com versão e decimal textual intactos", async () => {
    expect(await createEntry(input)).toEqual(row);
    expect(mocks.rpc).toHaveBeenLastCalledWith("sales_entry_create", {
      p_date: row.sale_date, p_unit: row.unit_id, p_method: "Stone", p_amount: "999999999999.99",
    });
    expect(await updateEntry(row.id, 2, input)).toEqual(row);
    expect(mocks.rpc).toHaveBeenLastCalledWith("sales_entry_update", expect.objectContaining({ p_id: row.id, p_expected_version: 2, p_amount: row.amount }));
    expect(await deleteEntry(row.id, 2)).toEqual(row);
    expect(mocks.rpc).toHaveBeenLastCalledWith("sales_entry_delete", { p_id: row.id, p_expected_version: 2 });
    expect(await entryDetail(row.id)).toEqual(row);
    expect(mocks.rpc).toHaveBeenLastCalledWith("sales_entry_detail", { p_id: row.id });
    mocks.rpc.mockResolvedValue({ data: [row], error: null });
    expect(await listEntries()).toEqual([row]);
    expect(mocks.rpc).toHaveBeenLastCalledWith("sales_entries_list", {
      p_from: null, p_to: null, p_unit: null, p_method: null, p_limit: 50, p_offset: 0,
    });
    expect(mocks.schema.mock.calls.every(([schema]) => schema === "public")).toBe(true);
  });

  it("encaminha filtros e paginação sem ampliar o escopo", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await listEntries({ from: "2026-01-01", to: "2026-01-31", unit_id: row.unit_id, payment_method: "PIX", limit: 10, offset: 20 });
    expect(mocks.rpc).toHaveBeenCalledWith("sales_entries_list", {
      p_from: "2026-01-01", p_to: "2026-01-31", p_unit: row.unit_id, p_method: "PIX", p_limit: 10, p_offset: 20,
    });
  });

  it("recusa number, zero, precisão excessiva, notação científica e locale antes do transporte", async () => {
    for (const amount of [0.01, "0", "0.00", "1.001", "1e2", "1,23", "NaN", "1000000000000"]) {
      await expect(createEntry({ ...input, amount: amount as string })).rejects.toThrow("valor decimal positivo");
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("recusa resposta numérica ou lista incompatível sem reconverter dinheiro", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...row, amount: 0.29 }, error: null });
    await expect(entryDetail(row.id)).rejects.toThrow("Resposta monetária incompatível");
    await expect(listEntries()).rejects.toThrow("Listagem incompatível");
    mocks.rpc.mockResolvedValue({ data: [{ ...row, amount: "1.001" }], error: null });
    await expect(listEntries()).rejects.toThrow("Resposta monetária incompatível");
  });

  it("preserva SQLSTATE e apresenta mensagens sem detalhes internos", async () => {
    const error = { code: "42501", message: "detalhe privado sintético" };
    mocks.rpc.mockResolvedValue({ data: null, error });
    await expect(deleteEntry(row.id, 2)).rejects.toEqual(error);
    for (const code of ["42501", "23505", "40001", "P0002", "23514", "22008", "22P02", "XX000"])
      expect(salesMessage({ code, message: "detalhe privado sintético" })).not.toContain("detalhe privado");
    expect(salesMessage({ code: "23505" })).toContain("lançamento ativo");
    expect(salesMessage({ code: "P0002" })).toContain("indisponível");
  });
});
