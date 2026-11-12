// Instrumentação opt-in: não coleta corpos, headers de autenticação, nomes ou URLs no relatório.
// Usa CDP somente no Chromium. iOS/Safari exige medição física separada.
export const TRAFFIC_STAGES = ["startup", "upload", "first-visit", "revisit", "collapse", "section", "modal", "download", "reload", "session", "expiry", "offline"];
const number = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : null;
export function safeHeaders(headers) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const cache = lower["cache-control"] ?? "";
  return {
    cacheControl: [...cache.matchAll(/(?:^|,)\s*(no-store|no-cache|private|public|must-revalidate|max-age=\d+|s-maxage=\d+|immutable)(?=\s*(?:,|$))/g)].map(m => m[1]),
    disposition: /^(attachment|inline)\b/i.exec(lower["content-disposition"] ?? "")?.[1].toLowerCase() ?? null,
    nosniff: lower["x-content-type-options"]?.toLowerCase() === "nosniff",
    etagPresent: !!lower.etag,
    contentLength: number(lower["content-length"]),
    age: number(lower.age),
    cfCacheStatus: ["HIT", "MISS", "DYNAMIC", "BYPASS", "EXPIRED", "REVALIDATED"].includes(lower["cf-cache-status"]) ? lower["cf-cache-status"] : null,
  };
}
export async function attachAuditTraffic(page, { appOrigin, storageOrigin }) {
  const allowed = new Set([new URL(appOrigin).origin, new URL(storageOrigin).origin]);
  const cdp = await page.context().newCDPSession(page);
  const pending = new Map(), aliases = new Map(), requests = [];
  let stage = "startup";
  function identify(raw, method) {
    const url = new URL(raw);
    if (!allowed.has(url.origin)) return null;
    const rendered = /^\/storage\/v1\/render\/image\/sign\/(audit-checklist-evidence)\/(.+)/.exec(url.pathname);
    const evidence = rendered ?? /^\/storage\/v1\/object\/(?:sign\/|authenticated\/)?(audit-checklist-evidence|audit-evidence-thumbnails)\/(.+)/.exec(url.pathname);
    let category;
    if (rendered) category = "thumbnail-get";
    else if (evidence) category = method === "POST" && url.pathname.includes("/object/sign/") ? "sign" : method === "POST" ? "upload" : method === "GET" ? "image-get" : "object-head";
    else category = /\/rest\/v1\//.test(url.pathname) ? "api" : /\/auth\/v1\//.test(url.pathname) ? "auth" : /\/storage\/v1\//.test(url.pathname) ? "storage-api" : "app";
    const path = evidence ? evidence[1] + "/" + evidence[2] : null;
    if (path && !aliases.has(path)) aliases.set(path, aliases.size + 1);
    return { category, object: path ? aliases.get(path) : null,
      imageKind: evidence ? (rendered || evidence[1] === "audit-evidence-thumbnails" ? "thumbnail" : "original") : null,
      rpc: /\/rest\/v1\/rpc\//.test(url.pathname) };
  }
  cdp.on("Network.requestWillBeSent", event => {
    const identity = identify(event.request.url, event.request.method);
    if (!identity) return;
    pending.set(event.requestId, { ...identity, stage, method: event.request.method, start: event.timestamp, bodyBytes: 0, cache: false });
  });
  cdp.on("Network.requestServedFromCache", event => { const row = pending.get(event.requestId); if (row) row.cache = true; });
  cdp.on("Network.responseReceived", event => {
    const row = pending.get(event.requestId);
    if (row) Object.assign(row, { status: event.response.status, cache: row.cache || !!event.response.fromDiskCache || !!event.response.fromServiceWorker,
      ttfbMs: Math.round((event.timestamp - row.start) * 1000), headers: safeHeaders(event.response.headers) });
  });
  cdp.on("Network.dataReceived", event => { const row = pending.get(event.requestId); if (row) row.bodyBytes += event.encodedDataLength; });
  function finish(event, failed) {
    const row = pending.get(event.requestId);
    if (!row) return;
    pending.delete(event.requestId);
    const { start, ...safe } = row;
    requests.push({ ...safe, failed, wireBytes: failed ? null : event.encodedDataLength, durationMs: Math.round((event.timestamp - start) * 1000) });
  }
  cdp.on("Network.loadingFinished", event => finish(event, false));
  cdp.on("Network.loadingFailed", event => finish(event, true));
  // Playwright fornece o tamanho do corpo do upload sem ler seu conteúdo.
  const uploads = [], tasks = new Set();
  const finished = request => {
    const identity = identify(request.url(), request.method());
    if (identity?.category !== "upload") return;
    const capturedStage = stage;
    const task = request.sizes().then(sizes => uploads.push({ stage: capturedStage, object: identity.object, bodyBytes: sizes.requestBodySize }), () => {}).finally(() => tasks.delete(task));
    tasks.add(task);
  };
  page.on("requestfinished", finished);
  await cdp.send("Network.enable");
  return {
    stage(value) { if (!TRAFFIC_STAGES.includes(value)) throw new Error("Etapa inválida."); stage = value; },
    async snapshot() { await Promise.all([...tasks]); return { version: 2, requests: [...requests], uploads: [...uploads], unfinished: pending.size,
      unfinishedRequests: [...pending.values()].map(({ category, stage, method, imageKind }) => ({ category, stage, method, imageKind })) }; },
    async close() { page.off("requestfinished", finished); await cdp.detach(); pending.clear(); aliases.clear(); },
  };
}
