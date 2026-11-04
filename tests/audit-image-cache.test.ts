import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivateImageCache, PRIVATE_IMAGE_TTL } from "../apps/web/src/shared/privateImageCache";
let cache: PrivateImageCache;
const blob = (size = 4) => new Blob([new Uint8Array(size)], { type: "image/jpeg" });
const loader = (size = 4) => vi.fn(async () => ({ blob: blob(size), expiresAt: Date.now() + PRIVATE_IMAGE_TTL }));
const hold = () => {
  let release!: (value: { blob: Blob; expiresAt: number }) => void;
  const promise = new Promise<{ blob: Blob; expiresAt: number }>(resolve => { release = resolve; });
  return { promise, release: () => release({ blob: blob(), expiresAt: Date.now() + PRIVATE_IMAGE_TTL }) };
};
beforeEach(() => {
  vi.useFakeTimers();
  let id = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:synthetic-${++id}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  cache = new PrivateImageCache(12);
  cache.setAccess("user-a:grants-a");
});
afterEach(() => { cache.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });
describe("cache privado de imagens", () => {
  it("deduplica, reutiliza e só renova após expiração fixa de 60s", async () => {
    const load = loader();
    await Promise.all([cache.load("a", load), cache.load("a", load), cache.load("a", load)]);
    const url = cache.peek("a");
    await vi.advanceTimersByTimeAsync(59_000);
    await cache.load("a", load);
    expect(cache.peek("a")).toBe(url);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(cache.peek("a")).toBe("");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
    await cache.load("a", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("mantém LRU dentro do limite de bytes e rejeita objeto maior que o orçamento", async () => {
    await cache.load("a", loader(5)); await cache.load("b", loader(5));
    await cache.load("a", loader(5));
    await cache.load("c", loader(5));
    expect(cache.peek("a")).toBeTruthy(); expect(cache.peek("b")).toBe("");
    expect(cache.peek("c")).toBeTruthy();
    await expect(cache.load("large", loader(13))).rejects.toThrow();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(3);
  });
  it.each(["", "user-b:grants-a", "user-a:grants-b"])("descarta cache e resposta antiga ao mudar acesso para %s", async key => {
    await cache.load("ready", loader());
    const gate = hold();
    const pending = cache.load("pending", () => gate.promise);
    const rejected = expect(pending).rejects.toThrow();
    await Promise.resolve();
    cache.setAccess(key);
    gate.release(); await rejected;
    expect(cache.peek("ready")).toBe(""); expect(cache.peek("pending")).toBe("");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    if (!key) await expect(cache.load("ready", loader())).rejects.toThrow();
  });
  it("não invalida quando o contexto permanece igual", async () => {
    const load = loader(); await cache.load("a", load);
    cache.setAccess("user-a:grants-a"); await cache.load("a", load);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("invalida remoção/reconciliação sem repopular com resposta concorrente", async () => {
    const gate = hold();
    const pending = cache.load("audit:i:a", () => gate.promise);
    const rejected = expect(pending).rejects.toThrow();
    await cache.load("audit:i:b", loader()); await cache.load("audit:j:c", loader());
    cache.reconcile("audit:i:", new Set()); gate.release(); await rejected;
    expect(cache.peek("audit:i:b")).toBe(""); expect(cache.peek("audit:j:c")).toBeTruthy();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
  });
  it("permite retry após erro, mas cancela solicitações travadas após 30s", async () => {
    await expect(cache.load("a", async () => { throw new Error("offline"); })).rejects.toThrow();
    const gate = hold(); const pending = cache.load("a", () => gate.promise);
    const rejected = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(30_000); await rejected;
    await cache.load("a", loader()); gate.release(); await Promise.resolve();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
  it("limita duas transferências simultâneas e cancela a fila no logout", async () => {
    const gates = [hold(), hold(), hold()];
    const loads = gates.map(gate => vi.fn(() => gate.promise));
    const pending = loads.map((load, i) => cache.load(String(i), load));
    const settled = Promise.allSettled(pending);
    await Promise.resolve(); await Promise.resolve();
    expect(loads.map(load => load.mock.calls.length)).toEqual([1, 1, 0]);
    cache.setAccess(""); gates.forEach(gate => gate.release());
    expect((await settled).map(result => result.status)).toEqual(["rejected", "rejected", "rejected"]);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
