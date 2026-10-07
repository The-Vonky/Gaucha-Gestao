// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook } from "@testing-library/react";
const supa = vi.hoisted(() => {
  const rows = new Map<string, Record<string, unknown>>();
  // Each pending gate delays one unit_covers response; the rows are read when the call starts.
  const gates: Promise<void>[] = [];
  const state = { allowed: true, signed: 0, grants: [] as unknown[], emit: (() => {}) as (event: string, session: unknown) => void };
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "my_access") return { data: state.grants, error: null };
    if (name !== "unit_covers") return { data: null, error: null };
    const allowed = state.allowed;
    const data = (args.p_units as string[]).filter((id) => rows.has(id)).map((id) => ({ ...rows.get(id) }));
    const gate = gates.shift();
    if (gate) await gate;
    return allowed ? { data, error: null } : { data: null, error: { code: "42501" } };
  });
  const createSignedUrls = vi.fn(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `http://127.0.0.1:54321/storage/v1/object/sign/unit-covers/${path}?token=${++state.signed}`, error: null })),
    error: null,
  }));
  return { rows, gates, state, rpc, createSignedUrls };
});
vi.mock("../apps/web/src/core/client", () => ({
  database: () => ({
    rpc: supa.rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { active: true }, error: null }) }) }) }),
  }),
  client: {
    storage: { from: () => ({ createSignedUrls: supa.createSignedUrls }) },
    auth: {
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        supa.state.emit = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
}));
import {
  clearUnitCoverCache,
  invalidateUnitCovers,
  removeUnitCover,
  resolveUnitCovers,
  setUnitCoverAccess,
  useUnitCovers,
  type UnitCover,
} from "../apps/web/src/core/unitCovers";
import { AuthProvider, useAuth } from "../apps/web/src/core/auth/AuthProvider";
const unit = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
function withCover(n: number, asset = `asset-${n}`) {
  supa.rows.set(unit(n), { unit_id: unit(n), asset_id: asset, object_key: `units/${unit(n)}/covers/${asset}.jpg`, position_x: 50, position_y: 50, width: 1600, height: 900, ready_at: "" });
}
const coverCalls = () => supa.rpc.mock.calls.filter(([n]) => n === "unit_covers");
const chunks = () => coverCalls().map(([, a]) => (a as { p_units: string[] }).p_units.length);
function hold() {
  let release = () => {};
  supa.gates.push(new Promise<void>((r) => (release = r)));
  return () => release();
}
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
beforeEach(() => {
  clearUnitCoverCache();
  supa.rows.clear();
  supa.gates.length = 0;
  supa.state.allowed = true;
  supa.state.grants = [];
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});
describe("unit cover cache isolation across access contexts", () => {
  it("never serves another user's cached URL and drops a late response of the previous user", async () => {
    withCover(1);
    setUnitCoverAccess("user-a");
    const a = (await resolveUnitCovers([unit(1)])).get(unit(1))!;
    expect(a.assetId).toBe("asset-1");
    // B has no access: the cache of A must not answer, the server is asked again and denies.
    setUnitCoverAccess("user-b");
    supa.state.allowed = false;
    await expect(resolveUnitCovers([unit(1)])).rejects.toMatchObject({ code: "42501" });
    expect(coverCalls()).toHaveLength(2);
    // A request started by A that finishes after the switch cannot repopulate the cache for B.
    setUnitCoverAccess("user-a");
    supa.state.allowed = true;
    const release = hold();
    const late = resolveUnitCovers([unit(1)]);
    await Promise.resolve();
    setUnitCoverAccess("user-b");
    supa.state.allowed = false;
    release();
    expect((await late).get(unit(1))).toBeNull();
    await expect(resolveUnitCovers([unit(1)])).rejects.toMatchObject({ code: "42501" });
    expect(coverCalls()).toHaveLength(4);
  });
  it("hides covers on screen immediately when the access context changes", async () => {
    withCover(1);
    setUnitCoverAccess("user-a");
    const { result } = renderHook(() => useUnitCovers([unit(1)]));
    await act(async () => {});
    expect(result.current.covers.get(unit(1))?.assetId).toBe("asset-1");
    supa.state.allowed = false;
    const release = hold();
    act(() => setUnitCoverAccess("user-b"));
    expect(result.current.covers.size).toBe(0);
    await act(async () => release());
    expect(result.current.covers.get(unit(1)) ?? null).toBeNull();
    expect(coverCalls()).toHaveLength(2);
  });
  it("follows the AuthProvider: grant changes, same-user refreshes, sign-out and user switch", async () => {
    withCover(1);
    let refresh = () => {};
    let seen = new Map<string, UnitCover | null>();
    function Probe() {
      refresh = useAuth().refresh;
      seen = useUnitCovers([unit(1)]).covers;
      return null;
    }
    render(<AuthProvider><Probe /></AuthProvider>);
    const session = (id: string) => ({ user: { id } });
    supa.state.grants = [{ permission: "core.unit_cover.read", scope_type: "global", unit_id: null, sector_id: null }];
    await act(async () => supa.state.emit("SIGNED_IN", session("user-a")));
    await act(async () => {});
    expect(seen.get(unit(1))?.assetId).toBe("asset-1");
    const afterLogin = coverCalls().length;
    // Same user and grants (periodic refresh, token refresh): the cache is kept.
    await act(async () => refresh());
    await act(async () => {});
    expect(coverCalls()).toHaveLength(afterLogin);
    // Same user, different grants: the private cache is invalidated and resolved again.
    supa.state.grants = [{ permission: "core.unit_cover.read", scope_type: "unit", unit_id: unit(1), sector_id: null }];
    await act(async () => refresh());
    await act(async () => {});
    expect(coverCalls()).toHaveLength(afterLogin + 1);
    expect(seen.get(unit(1))?.assetId).toBe("asset-1");
    // Sign-out: covers disappear at once.
    supa.state.allowed = false;
    await act(async () => supa.state.emit("SIGNED_OUT", null));
    expect(seen.size).toBe(0);
    // Another user without access: B is asked for again and never sees A's cover.
    const beforeB = coverCalls().length;
    supa.state.grants = [];
    await act(async () => supa.state.emit("SIGNED_IN", session("user-b")));
    await act(async () => {});
    expect(seen.get(unit(1)) ?? null).toBeNull();
    expect(coverCalls().length).toBeGreaterThan(beforeB);
  });
});
describe("unit cover invalidation races", () => {
  it("never lets a response started before a replace restore the old asset", async () => {
    withCover(1, "old");
    const release = hold();
    const old = resolveUnitCovers([unit(1)]);
    await Promise.resolve();
    withCover(1, "new");
    invalidateUnitCovers([unit(1)]);
    const next = await resolveUnitCovers([unit(1)]);
    expect(next.get(unit(1))?.assetId).toBe("new");
    release();
    // The old caller resolves the unit again instead of returning the voided result.
    expect((await old).get(unit(1))?.assetId).toBe("new");
    const calls = coverCalls().length;
    expect((await resolveUnitCovers([unit(1)])).get(unit(1))?.assetId).toBe("new");
    expect(coverCalls()).toHaveLength(calls);
  });
  it("keeps a removed cover off screen when the older request finishes last", async () => {
    withCover(1, "old");
    const release = hold();
    const { result } = renderHook(() => useUnitCovers([unit(1)]));
    await act(async () => {});
    supa.rows.delete(unit(1));
    await act(async () => removeUnitCover(unit(1), "old"));
    await act(async () => {});
    expect(result.current.covers.get(unit(1))).toBeNull();
    await act(async () => release());
    expect(result.current.covers.get(unit(1))).toBeNull();
    expect((await resolveUnitCovers([unit(1)])).get(unit(1))).toBeNull();
  });
});
describe("unit cover renewal while mounted", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  });
  it("re-signs before expiry without any rerender or id change, then stops on unmount", async () => {
    withCover(1);
    const { result, unmount } = renderHook(() => useUnitCovers([unit(1)]));
    await flush();
    const first = result.current.covers.get(unit(1))!.url;
    expect(coverCalls()).toHaveLength(1);
    await advance(239_000);
    expect(coverCalls()).toHaveLength(1);
    await advance(1_000);
    expect(coverCalls()).toHaveLength(2);
    const second = result.current.covers.get(unit(1))!.url;
    expect(second).not.toBe(first);
    await advance(240_000);
    expect(coverCalls()).toHaveLength(3);
    expect(result.current.covers.get(unit(1))!.url).not.toBe(second);
    unmount();
    await advance(3_600_000);
    expect(coverCalls()).toHaveLength(3);
  });
  it("renews units with different expirations separately, each when due", async () => {
    withCover(1);
    withCover(2);
    await resolveUnitCovers([unit(1)]);
    await advance(100_000);
    renderHook(() => useUnitCovers([unit(1), unit(2)]));
    await flush();
    expect(coverCalls().map(([, a]) => (a as { p_units: string[] }).p_units)).toEqual([[unit(1)], [unit(2)]]);
    await advance(140_000);
    expect(coverCalls().at(-1)![1]).toEqual({ p_units: [unit(1)] });
    await advance(100_000);
    expect(coverCalls().at(-1)![1]).toEqual({ p_units: [unit(2)] });
    expect(coverCalls()).toHaveLength(4);
  });
  it("keeps recovering a cover across expirations without an error loop", async () => {
    withCover(1);
    const { result } = renderHook(() => useUnitCovers([unit(1)]));
    await flush();
    const url1 = result.current.covers.get(unit(1))!;
    act(() => result.current.reportError(url1));
    await flush();
    const url2 = result.current.covers.get(unit(1))!;
    expect(coverCalls()).toHaveLength(2);
    expect(url2.url).not.toBe(url1.url);
    // URL #2 worked for a while, then failed: it may be re-signed again.
    await advance(60_000);
    act(() => result.current.reportError(url2));
    await flush();
    const url3 = result.current.covers.get(unit(1))!;
    expect(coverCalls()).toHaveLength(3);
    expect(url3.url).not.toBe(url2.url);
    // URL #3 fails right after its own re-sign: fallback, no further request.
    act(() => result.current.reportError(url3));
    await flush();
    expect(result.current.covers.get(unit(1))).toBeNull();
    act(() => result.current.reportError(url3));
    await flush();
    expect(coverCalls()).toHaveLength(3);
    // Renewal still brings a new URL, which again has its retry.
    await advance(300_000);
    const url4 = result.current.covers.get(unit(1))!;
    expect(url4.url).not.toBe(url3.url);
    act(() => result.current.reportError(url4));
    await flush();
    expect(result.current.covers.get(unit(1))!.url).not.toBe(url4.url);
  });
  it.each([
    [25, [25]],
    [42, [42]],
    [100, [100]],
    [230, [100, 100, 30]],
  ])("resolves and renews %i units in batches of at most 100", async (n, expected) => {
    const ids = Array.from({ length: n }, (_, i) => unit(i));
    for (const i of ids.keys()) withCover(i);
    const { result } = renderHook(() => useUnitCovers(ids));
    await flush();
    expect(chunks()).toEqual(expected);
    expect(supa.createSignedUrls).toHaveBeenCalledTimes(expected.length);
    expect([...result.current.covers.values()].filter(Boolean)).toHaveLength(n);
    await advance(240_000);
    expect(chunks()).toEqual([...expected, ...expected]);
    expect(supa.createSignedUrls).toHaveBeenCalledTimes(expected.length * 2);
  });
});
