import type { SalesExport } from "../../apps/web/src/modules/sales/export/types";
export const exportUnit = "10000000-0000-0000-0000-000000000001";
export function exportFixture(): SalesExport {
  return {
    contract_version: 1, mode: "filtered", filters: { from: "2026-09-01", to: "2026-09-30", method: "Stone" },
    units: [{ id: exportUnit, code: "A", name: "Unidade sintética Á 😀", active: false, adjustments_authorized: true }],
    rows: [{ kind: "entry", id: "00000000-0000-0000-0000-000000000001", date: "2026-09-01", unit_id: exportUnit,
      payment_method: "Stone", amount: "0.01", version: 1, updated_at: "2026-09-01T12:00:00Z" },
    { kind: "adjustment", id: "00000000-0000-0000-0000-000000000002", date: "2026-09-01", unit_id: exportUnit,
      payment_method: "Stone", amount: "0.10", reason: "Ajuste sintético mensal" }],
    token: "a".repeat(64), record_count: 2, entry_count: 1, adjustment_count: 1, entry_total: "0.01", adjustment_total: "0.10", total: "0.11",
    entry_from: "2026-09-01", entry_to: "2026-09-01", adjustment_from: "2026-09-01", adjustment_to: "2026-09-01",
    offset: 0, next_offset: 2, checked_at: "2026-11-03T02:59:59.000Z",
  };
}
