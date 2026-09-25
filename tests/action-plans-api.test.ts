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
describe("Action Plan API pagination", () => {
  it("does not lose older plans beyond the Data API limit or discard the inspection filter", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      plan: { id: String(i) },
    }));
    http.mockImplementation(async (url: string, options: RequestInit) => {
      expect(JSON.parse(String(options.body))).toEqual({
        p_inspection: "inspection-id",
      });
      const u = new URL(url);
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const limit = Math.min(Number(u.searchParams.get("limit") ?? 1000), 1000);
      return new Response(JSON.stringify(rows.slice(offset, offset + limit)), {
        headers: { "Content-Type": "application/json" },
      });
    });
    expect(await summaries({ p_inspection: "inspection-id" })).toEqual(rows);
  });
  it("loads every permitted creation scope, using unique ordering", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      unit_id: String(i),
      sector_id: null,
    }));
    http.mockImplementation(async (url: string) => {
      const u = new URL(url);
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const limit = Math.min(Number(u.searchParams.get("limit") ?? 1000), 1000);
      return new Response(JSON.stringify(rows.slice(offset, offset + limit)), {
        headers: { "Content-Type": "application/json" },
      });
    });
    expect(await creationScopes()).toEqual(rows);
  });
  it("reports a later-page failure rather than presenting incomplete totals", async () => {
    http.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          Array.from({ length: 500 }, () => ({ plan: { id: "x" } })),
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
