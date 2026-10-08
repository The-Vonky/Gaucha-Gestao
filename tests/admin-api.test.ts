import { afterEach, describe, expect, it, vi } from "vitest";
// Records the PostgREST builder chain the admin API composes (no network).
const calls = vi.hoisted(() => [] as unknown[][]);
vi.mock("../apps/web/src/core/client", () => {
  const builder: Record<string, unknown> = {};
  for (const method of [
    "from",
    "rpc",
    "select",
    "update",
    "order",
    "ilike",
    "eq",
    "range",
    "single",
  ])
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
  it("reads users from the directory RPC, which searches name or e-mail server-side", async () => {
    await api.users(2, { search: "ana@", inactive: true });
    expect(calls).toEqual([
      [
        "rpc",
        "user_directory",
        { p_search: "ana@", p_inactive: true },
        { count: "exact" },
      ],
      ["order", "display_name"],
      ["order", "id"],
      ["range", 50, 74],
    ]);
  });
  it("renames a profile only at the version that was shown", async () => {
    await api.renameProfile("u1", 7, "Novo Nome");
    expect(calls).toEqual([
      ["from", "profiles"],
      ["update", { display_name: "Novo Nome" }],
      ["eq", "id", "u1"],
      ["eq", "version", 7],
      ["select", "id"],
      ["single"],
    ]);
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
