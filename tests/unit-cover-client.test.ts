// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoverImageError } from "../apps/web/src/core/unitCoverImage";
const supa = vi.hoisted(() => {
  const rows = new Map<string, Record<string, unknown>>();
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "unit_covers")
      return { data: (args.p_units as string[]).filter((id) => rows.has(id)).map((id) => rows.get(id)), error: null };
    if (name === "begin_unit_cover_upload")
      return { data: [{ asset_id: "new-asset", object_key: `units/${String(args.p_unit)}/covers/new-asset.jpg` }], error: null };
    return { data: null, error: null };
  });
  const createSignedUrls = vi.fn(async (paths: string[], ttl: number) => ({
    data: paths.map((path) => ({ path, signedUrl: `http://127.0.0.1:54321/storage/v1/object/sign/unit-covers/${path}?token=t${ttl}-${Math.random()}`, error: null })),
    error: null,
  }));
  const upload = vi.fn(async () => ({ data: {}, error: null as unknown }));
  return { rows, rpc, createSignedUrls, upload };
});
vi.mock("../apps/web/src/core/client", () => ({
  database: () => ({ rpc: supa.rpc }),
  client: { storage: { from: () => ({ createSignedUrls: supa.createSignedUrls, upload: supa.upload }) } },
}));
import {
  COVER_BUCKET,
  COVER_URL_TTL,
  clearUnitCoverCache,
  coverMessage,
  invalidateUnitCovers,
  resolveUnitCovers,
  uploadUnitCover,
} from "../apps/web/src/core/unitCovers";
const unit = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
function withCover(n: number, x = 50, y = 50) {
  supa.rows.set(unit(n), { unit_id: unit(n), asset_id: `asset-${n}`, object_key: `units/${unit(n)}/covers/asset-${n}.jpg`, position_x: String(x), position_y: y, width: 1600, height: 900, ready_at: "" });
}
const calls = (name: string) => supa.rpc.mock.calls.filter(([n]) => n === name);
beforeEach(() => {
  clearUnitCoverCache();
  supa.rows.clear();
});
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
describe("unit cover batch resolution", () => {
  it("resolves 25 cards with one RPC and one batch signing call, TTL 300", async () => {
    const ids = Array.from({ length: 25 }, (_, n) => unit(n));
    for (let n = 0; n < 25; n += 2) withCover(n, n, 100 - n);
    const covers = await resolveUnitCovers(ids);
    expect(calls("unit_covers")).toHaveLength(1);
    expect(supa.createSignedUrls).toHaveBeenCalledTimes(1);
    expect(supa.createSignedUrls.mock.calls[0][0]).toHaveLength(13);
    expect(supa.createSignedUrls.mock.calls[0][1]).toBe(COVER_URL_TTL);
    expect(COVER_URL_TTL).toBe(300);
    expect(covers.get(unit(2))).toMatchObject({ assetId: "asset-2", x: 2, y: 98, width: 1600 });
    expect(covers.get(unit(1))).toBeNull();
    expect(COVER_BUCKET).toBe("unit-covers");
  });
  it("chunks above 100 units and never issues a request per unit", async () => {
    const ids = Array.from({ length: 230 }, (_, n) => unit(n));
    for (const n of [0, 150, 229]) withCover(n);
    const covers = await resolveUnitCovers(ids);
    expect(calls("unit_covers").map(([, a]) => (a as { p_units: string[] }).p_units.length)).toEqual([100, 100, 30]);
    // At most one signing call per chunk (each chunk here holds one cover): 3 for 230 units.
    expect(supa.createSignedUrls).toHaveBeenCalledTimes(3);
    expect([...covers.values()].filter(Boolean)).toHaveLength(3);
  });
  it("serves fresh entries from memory, shares in-flight requests and skips signing without covers", async () => {
    withCover(1);
    const [a, b] = await Promise.all([resolveUnitCovers([unit(1), unit(2)]), resolveUnitCovers([unit(2), unit(1)])]);
    expect(a.get(unit(1))?.url).toBe(b.get(unit(1))?.url);
    await resolveUnitCovers([unit(1), unit(2)]);
    expect(calls("unit_covers")).toHaveLength(1);
    await resolveUnitCovers([unit(3)]);
    expect(supa.createSignedUrls).toHaveBeenCalledTimes(1);
  });
  it("renews signed URLs before expiry and after invalidation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    withCover(1);
    const first = (await resolveUnitCovers([unit(1)])).get(unit(1))!.url;
    vi.setSystemTime(Date.now() + 230_000);
    await resolveUnitCovers([unit(1)]);
    expect(calls("unit_covers")).toHaveLength(1);
    vi.setSystemTime(Date.now() + 15_000);
    const renewed = (await resolveUnitCovers([unit(1)])).get(unit(1))!.url;
    expect(calls("unit_covers")).toHaveLength(2);
    expect(renewed).not.toBe(first);
    invalidateUnitCovers([unit(1)]);
    await resolveUnitCovers([unit(1)]);
    expect(calls("unit_covers")).toHaveLength(3);
  });
  it("keeps signed URLs in memory only", async () => {
    const local = vi.spyOn(Storage.prototype, "setItem");
    withCover(1);
    await resolveUnitCovers([unit(1)]);
    expect(local).not.toHaveBeenCalled();
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toMatch(/token|unit-covers/);
  });
  it("falls back for objects that could not be signed and propagates RPC errors without caching", async () => {
    withCover(1);
    withCover(2);
    supa.createSignedUrls.mockResolvedValueOnce({ data: [{ path: `units/${unit(1)}/covers/asset-1.jpg`, signedUrl: "", error: "Object not found" }, { path: `units/${unit(2)}/covers/asset-2.jpg`, signedUrl: "http://127.0.0.1/x?token=1", error: null }], error: null } as never);
    const covers = await resolveUnitCovers([unit(1), unit(2)]);
    expect(covers.get(unit(1))).toBeNull();
    expect(covers.get(unit(2))).not.toBeNull();
    supa.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } } as never);
    await expect(resolveUnitCovers([unit(3)])).rejects.toMatchObject({ code: "42501" });
    await resolveUnitCovers([unit(3)]);
    expect(calls("unit_covers")).toHaveLength(3);
  });
});
describe("unit cover upload", () => {
  const prepared = { blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1])], { type: "image/jpeg" }), width: 1600, height: 900 };
  it("begins, uploads only the prepared JPEG without upsert, then confirms with framing", async () => {
    const steps: string[] = [];
    await uploadUnitCover(unit(1), prepared, { x: 30, y: 70 }, (s) => steps.push(s));
    expect(supa.rpc.mock.calls.map(([n]) => n)).toEqual(["begin_unit_cover_upload", "confirm_unit_cover_upload"]);
    expect(supa.rpc.mock.calls[0][1]).toEqual({ p_unit: unit(1), p_mime_type: "image/jpeg", p_byte_size: 4, p_width: 1600, p_height: 900 });
    expect(supa.upload).toHaveBeenCalledWith(`units/${unit(1)}/covers/new-asset.jpg`, prepared.blob, { contentType: "image/jpeg", upsert: false, cacheControl: "300" });
    expect(supa.rpc.mock.calls[1][1]).toEqual({ p_unit: unit(1), p_asset: "new-asset", p_position_x: 30, p_position_y: 70 });
    expect(steps).toEqual(["uploading", "confirming"]);
  });
  it.each(["upload", "confirm"])("cancels the pending asset when %s fails, leaving no broken cover", async (stage) => {
    if (stage === "upload") supa.upload.mockResolvedValueOnce({ data: null, error: { statusCode: "413", message: "Payload too large" } } as never);
    else supa.rpc.mockImplementation(async (name: string) => (name === "begin_unit_cover_upload" ? { data: [{ asset_id: "new-asset", object_key: "k" }], error: null } : name === "confirm_unit_cover_upload" ? { data: null, error: { code: "23514", message: "Uploaded object does not match" } } : { data: null, error: null }) as never);
    const error = await uploadUnitCover(unit(1), prepared, { x: 50, y: 50 }).catch((e: unknown) => e);
    expect(supa.rpc).toHaveBeenLastCalledWith("cancel_unit_cover_upload", { p_asset: "new-asset" });
    expect(coverMessage(error)).toBe(stage === "upload" ? "O armazenamento recusou a foto. Tente novamente com outra imagem." : "A foto enviada não confere com o registro. Tente novamente.");
    supa.rpc.mockReset();
  });
  it("maps errors to safe messages without server text", () => {
    expect(coverMessage(new CoverImageError("A foto excede o limite de 8 MB."))).toBe("A foto excede o limite de 8 MB.");
    expect(coverMessage({ code: "40001", message: "Concurrent change" })).toMatch(/alterada por outra pessoa/);
    expect(coverMessage({ code: "42501", message: "Forbidden" })).toMatch(/permissão/);
    expect(coverMessage({ code: "23514", message: "Cover upload limit reached" })).toMatch(/envios demais/);
    expect(coverMessage({ code: "XX000", message: "internal detail" })).not.toMatch(/internal detail/);
  });
});
