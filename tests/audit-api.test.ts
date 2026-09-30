import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { InspectionSummary } from "../apps/web/src/modules/audit/types";
const http = vi.hoisted(() => vi.fn());
vi.mock("../apps/web/src/core/client", () => ({
  client: createClient("http://127.0.0.1:54321", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: http },
  }),
}));
import { inspection, summaries } from "../apps/web/src/modules/audit/api";
afterEach(() => http.mockReset());
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function summary(n: number): InspectionSummary {
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
    unit_id: "unit-id",
    unit_name: "Unidade",
    template_version: "template-v1",
    applied_on: "2026-09-30",
    previous_visit_on: null,
    responsible_id: "user-id",
    responsible_name: "Responsável",
    status: "draft",
    final_score: null,
    final_classification: null,
    finalized_at: null,
    version: 1,
    created_at: "2026-09-30T12:00:00Z",
    total_items: 1,
    answered: 0,
    at_count: 0,
    ap_count: 0,
    nat_count: 0,
    nap_count: 0,
  };
}
describe("Audit API pagination", () => {
  it("returns all 1,001 unit summaries in deterministic newest-first order despite the 1,000-row Data API cap", async () => {
    // Identical dates require the ID tie-breaker across page boundaries.
    const rows = Array.from({ length: 1001 }, (_, i) => summary(1001 - i));
    const ranges: number[][] = [];
    const orders: (string | null)[] = [];
    http.mockImplementation(async (url: string, options: RequestInit) => {
      const u = new URL(url);
      expect(u.pathname).toBe("/rest/v1/rpc/inspection_summaries");
      expect(JSON.parse(String(options.body))).toEqual({ p_unit: "unit-id" });
      orders.push(u.searchParams.get("order"));
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const limit = Math.min(Number(u.searchParams.get("limit") ?? 1000), 1000);
      ranges.push([offset, limit]);
      return json(rows.slice(offset, offset + limit));
    });
    const result = await summaries({ p_unit: "unit-id" });
    expect(result).toHaveLength(1001);
    expect(result).toEqual(rows);
    expect(ranges).toEqual([[0, 500], [500, 500], [1000, 500]]);
    expect(orders).toEqual(Array(3).fill("applied_on.desc,created_at.desc,id.desc"));
  });
  it.each([
    { p_unit: "unit-id", p_inspection: "inspection-id", p_overview: true },
    { p_unit: "unit-id", p_inspection: "inspection-id", p_overview: false },
  ])("preserves all RPC filters on every page: %j", async (args) => {
    const first = Array.from({ length: 500 }, (_, i) => summary(501 - i));
    const requests: unknown[] = [];
    http.mockImplementation(async (_url: string, options: RequestInit) => {
      requests.push(JSON.parse(String(options.body)));
      return json(requests.length === 1 ? first : [summary(1)]);
    });
    expect(await summaries(args)).toEqual([...first, summary(1)]);
    expect(requests).toEqual([args, args]);
  });
  it("drops a repeated boundary row after a concurrent insertion without losing older rows or order", async () => {
    const first = Array.from({ length: 500 }, (_, i) => summary(501 - i));
    http.mockResolvedValueOnce(json(first));
    http.mockResolvedValueOnce(json([first[499], summary(1)]));
    expect(await summaries()).toEqual([...first, summary(1)]);
  });
  it("rejects a second-page failure instead of returning partial history", async () => {
    http.mockResolvedValueOnce(json(Array.from({ length: 500 }, (_, i) => summary(500 - i))));
    http.mockResolvedValueOnce(json({ code: "XX000", message: "Unavailable" }, 500));
    await expect(summaries()).rejects.toMatchObject({ code: "XX000" });
  });
  it("requests the terminal empty page for an exact multiple of the page size", async () => {
    const first = Array.from({ length: 500 }, (_, i) => summary(500 - i));
    const offsets: string[] = [];
    http.mockImplementation(async (url: string) => {
      const offset = new URL(url).searchParams.get("offset") ?? "0";
      offsets.push(offset);
      return json(offset === "0" ? first : []);
    });
    expect(await summaries()).toEqual(first);
    expect(offsets).toEqual(["0", "500"]);
  });
  it("keeps inspection(id) filtering and numeric score normalization", async () => {
    const row = { ...summary(1), status: "finalized", final_score: "87.5", final_classification: "adequate" };
    http.mockImplementation(async (_url: string, options: RequestInit) => {
      expect(JSON.parse(String(options.body))).toEqual({ p_inspection: row.id });
      return json([row]);
    });
    expect(await inspection(row.id)).toEqual({ ...row, final_score: 87.5 });
  });
  it("returns null when inspection(id) is absent or inaccessible", async () => {
    http.mockResolvedValueOnce(json([]));
    expect(await inspection("missing-id")).toBeNull();
  });
  it("preserves the overview RPC result (all drafts and the two server-selected finalized rows)", async () => {
    const rows = [summary(3), ...[2, 1].map((n) => ({
      ...summary(n), status: "finalized", final_score: "75.5", final_classification: "partial",
    }))];
    http.mockImplementation(async (_url: string, options: RequestInit) => {
      expect(JSON.parse(String(options.body))).toEqual({ p_overview: true });
      return json(rows);
    });
    expect(await summaries({ p_overview: true })).toEqual(rows.map((r) => ({
      ...r, final_score: r.final_score === null ? null : 75.5,
    })));
  });
});
