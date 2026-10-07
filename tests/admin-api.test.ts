import { afterEach, describe, expect, it, vi } from "vitest";
// Records the PostgREST builder chain the admin API composes (no network).
const calls = vi.hoisted(() => [] as unknown[][]);
vi.mock("../apps/web/src/core/client", () => {
  const builder: Record<string, unknown> = {};
  for (const method of ["from", "select", "order", "ilike", "eq", "range"])
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  builder.then = (resolve: (value: unknown) => void) =>
    resolve({ data: [], error: null, count: 0 });
  return { database: () => builder };
});
import * as api from "../apps/web/src/core/admin/api";
afterEach(() => {
  calls.length = 0;
});
describe("admin list queries", () => {
  it("lists units alphabetically, active only by default, with a literal name search", async () => {
    await api.organizations("units", 1, {
      search: "50%_a\\b",
      inactive: false,
    });
    expect(calls).toEqual([
      ["from", "units"],
      ["select", "*", { count: "exact" }],
      ["order", "name"],
      ["order", "id"],
      ["ilike", "name", "%50\\%\\_a\\\\b%"],
      ["eq", "active", true],
      ["range", 25, 49],
    ]);
  });
  it("includes inactive records and skips an empty search when asked", async () => {
    await api.organizations("sectors", 0, { search: "", inactive: true });
    expect(calls).toEqual([
      ["from", "sectors"],
      ["select", "*", { count: "exact" }],
      ["order", "name"],
      ["order", "id"],
      ["range", 0, 24],
    ]);
  });
  it("searches users by display name", async () => {
    await api.users(0, { search: "Ana", inactive: false });
    expect(calls).toContainEqual(["order", "display_name"]);
    expect(calls).toContainEqual(["ilike", "display_name", "%Ana%"]);
  });
  it("reads named catalogs by name (never by UUID) with a unique page boundary", async () => {
    await api.list("roles");
    expect(calls.filter(([m]) => m === "order")).toEqual([
      ["order", "name", { ascending: true }],
      ["order", "id"],
    ]);
    calls.length = 0;
    await api.list("permissions");
    expect(calls.filter(([m]) => m === "order")).toEqual([
      ["order", "key", { ascending: true }],
    ]);
  });
});
