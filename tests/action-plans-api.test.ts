import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
const http = vi.hoisted(() => vi.fn());
vi.mock("../apps/web/src/core/client", () => ({
  client: createClient("http://127.0.0.1:54321", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: http },
  }),
}));
import {
  summaries,
  creationScopes,
} from "../apps/web/src/modules/action-plans/api";
afterEach(() => http.mockReset());
const summary = (i: number) => ({
  plan: { id: String(i).padStart(4, "0"), created_at: "2026-09-30T12:00:00Z" },
});
const json = (body: unknown) => new Response(JSON.stringify(body), {
  headers: { "Content-Type": "application/json" },
});
describe("Action Plan API pagination", () => {
  it("measures listing orchestration with 1001 synthetic plans and creation scopes", async () => {
    const plans = Array.from({ length: 1001 }, (_, i) => summary(i));
    const scopes = Array.from({ length: 1001 }, (_, i) => ({ unit_id: String(i), sector_id: null }));
    http.mockImplementation(async (url: string, options: RequestInit) => {
      const u = new URL(url);
      const creation = u.pathname.endsWith("creation_scopes");
      await new Promise(resolve => setTimeout(resolve, creation ? 80 : 10));
      const offset = Number(u.searchParams.get("offset") ?? 0);
      if (creation) return json(scopes.slice(offset, offset + 500));
      const { p_before_id } = JSON.parse(String(options.body));
      return json(plans.filter(row => !p_before_id || row.plan.id > p_before_id).slice(0, 500));
    });
    const start = performance.now();
    const [before] = await Promise.all([summaries(), creationScopes()]);
    const beforeMs = performance.now() - start;
    const beforeCalls = http.mock.calls.length;
    http.mockClear();
    const afterStart = performance.now();
    const after = await summaries();
    const afterMs = performance.now() - afterStart;
    expect(after).toEqual(before);
    expect(after).toHaveLength(1001);
    expect(beforeCalls).toBe(6);
    expect(http).toHaveBeenCalledTimes(3);
    console.info(`Synthetic listing (10ms summaries / 80ms scopes per page): before ${Math.round(beforeMs)}ms / ${beforeCalls} requests; lazy scopes ${Math.round(afterMs)}ms / ${http.mock.calls.length} requests`);
  });
  it("does not lose older plans beyond the Data API limit or discard the inspection filter", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => summary(i));
    const requests: unknown[] = [];
    http.mockImplementation(async (url: string, options: RequestInit) => {
      const args = JSON.parse(String(options.body));
      requests.push(args);
      const u = new URL(url);
      expect(u.searchParams.has("offset")).toBe(false);
      const limit = Math.min(Number(u.searchParams.get("limit") ?? 1000), 1000);
      expect(limit).toBe(500);
      return json(rows.filter(row => !args.p_before_id || row.plan.id > args.p_before_id).slice(0, limit));
    });
    expect(await summaries({ p_inspection: "inspection-id" })).toEqual(rows);
    expect(requests).toEqual([undefined, rows[499], rows[999]].map(last => ({
      p_inspection: "inspection-id",
      p_before_created_at: last?.plan.created_at ?? null,
      p_before_id: last?.plan.id ?? null,
    })));
  });
  it("loads every permitted creation scope, using unique ordering", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      unit_id: String(i),
      sector_id: null,
    }));
    http.mockImplementation(async (url: string) => {
      const u = new URL(url);
      expect(u.searchParams.get("order")).toBe(
        "unit_name.asc,unit_id.asc,sector_name.asc.nullsfirst,sector_id.asc.nullsfirst",
      );
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const limit = Math.min(Number(u.searchParams.get("limit") ?? 1000), 1000);
      return new Response(JSON.stringify(rows.slice(offset, offset + limit)), {
        headers: { "Content-Type": "application/json" },
      });
    });
    expect(await creationScopes()).toEqual(rows);
  });
  it.each(["remoção", "inserção"])("preserva os planos após %s concorrente", async (change) => {
    const rows = Array.from({ length: 501 }, (_, i) => summary(i + 1));
    const first = rows.slice(0, 500);
    http.mockImplementation(async (url: string, options: RequestInit) => {
      const { p_before_id } = JSON.parse(String(options.body));
      const offset = Number(new URL(url).searchParams.get("offset") ?? 0);
      const current = http.mock.calls.length === 1 ? rows :
        change === "remoção" ? rows.slice(1).filter(row => row.plan.id !== first.at(-1)!.plan.id) : [summary(0), ...rows];
      const remaining = p_before_id ? current.filter(row => row.plan.id > p_before_id) : current;
      return json(remaining.slice(offset, offset + 500));
    });
    expect(await summaries()).toEqual(rows);
  });
  it("reports a later-page failure rather than presenting incomplete totals", async () => {
    http.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          Array.from({ length: 500 }, (_, i) => summary(i)),
        ),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    http.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "XX000", message: "Unavailable" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(summaries()).rejects.toMatchObject({ code: "XX000" });
  });
});
