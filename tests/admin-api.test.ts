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
    "or",
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
  it("lists units alphabetically, active only by default, with a literal code-or-name search", async () => {
    await api.organizations("units", 1, {
      search: "50%_a\\b",
      inactive: false,
    });
    expect(calls).toEqual([
      ["from", "units"],
      ["select", "*", { count: "exact" }],
      ["order", "name"],
      ["order", "id"],
      [
        "or",
        'code.ilike."%50\\\\%\\\\_a\\\\\\\\b%",name.ilike."%50\\\\%\\\\_a\\\\\\\\b%"',
      ],
      ["eq", "active", true],
      ["range", 25, 49],
    ]);
  });
  it.each(["units", "sectors"] as const)(
    "searches %s by code or name",
    async (kind) => {
      await api.organizations(kind, 0, { search: "CMD", inactive: false });
      expect(calls).toContainEqual([
        "or",
        'code.ilike."%CMD%",name.ilike."%CMD%"',
      ]);
      expect(calls).toContainEqual(["eq", "active", true]);
      expect(calls).toContainEqual(["range", 0, 24]);
    },
  );
  it("quotes filter syntax so input cannot add a predicate", async () => {
    await api.organizations("sectors", 0, {
      search: 'A,B).or(active.eq.false),"C',
      inactive: false,
    });
    expect(calls).toContainEqual([
      "or",
      'code.ilike."%A,B).or(active.eq.false),\\"C%",name.ilike."%A,B).or(active.eq.false),\\"C%"',
    ]);
    expect(calls).toContainEqual(["eq", "active", true]);
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
  it("lists roles alphabetically, active and inactive, with a literal name-or-key search", async () => {
    await api.roles(1, 'gestor_%,"x');
    expect(calls).toEqual([
      ["from", "roles"],
      ["select", "*", { count: "exact" }],
      ["order", "name"],
      ["order", "id"],
      [
        "or",
        'name.ilike."%gestor\\\\_\\\\%,\\"x%",key.ilike."%gestor\\\\_\\\\%,\\"x%"',
      ],
      ["range", 25, 49],
    ]);
    calls.length = 0;
    await api.roles(0, "");
    expect(calls.map(([m]) => m)).not.toContain("or");
    expect(calls.map(([m]) => m)).not.toContain("eq");
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
  it("reads log pages from the audit log RPC, sending blank filters as null", async () => {
    const result = await api.auditLogPage(1, {
      from: "2026-10-01T03:00:00.000Z",
      to: "2026-10-02T03:00:00.000Z",
      actor: "",
      actorSearch: "ana",
      module: "core",
      action: "",
      entityType: "units",
      entityId: "u1",
    });
    expect(calls).toEqual([
      [
        "rpc",
        "audit_log_page",
        {
          p_limit: 25,
          p_offset: 25,
          p_from: "2026-10-01T03:00:00.000Z",
          p_to: "2026-10-02T03:00:00.000Z",
          p_actor: null,
          p_actor_search: "ana",
          p_module: "core",
          p_action: null,
          p_entity_type: "units",
          p_entity_id: "u1",
        },
      ],
    ]);
    expect(result).toEqual({ rows: [], count: 0 });
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
