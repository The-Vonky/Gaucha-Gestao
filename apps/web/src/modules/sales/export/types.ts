import type { PaymentMethod } from "../types";

export type ExportFilters = { from?: string; to?: string; unit_ids?: string[]; method?: PaymentMethod };
export type ExportMode = "filtered" | "full";
export type ExportRow = {
  kind: "entry" | "adjustment"; id: string; date: string; unit_id: string;
  payment_method: PaymentMethod; amount: string; updated_at?: string; version?: number; reason?: string;
};
export type ExportPage = {
  contract_version: 1; mode: ExportMode;
  filters: { from: string | null; to: string | null; method: PaymentMethod | null };
  units: { id: string; code: string; name: string; active: boolean; adjustments_authorized: boolean }[];
  rows: ExportRow[]; token: string; record_count: number; entry_count: number; adjustment_count: number;
  entry_total: string; adjustment_total: string; total: string;
  entry_from: string | null; entry_to: string | null; adjustment_from: string | null; adjustment_to: string | null;
  offset: number; next_offset: number; checked_at: string;
};
export type SalesExport = ExportPage;
