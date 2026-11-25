import { request as upstreamRequest } from "node:http";
import { pipeline } from "node:stream/promises";

const buckets = new Set([
  "abc-source-files", "action-plan-evidence", "audit-checklist-evidence",
  "audit-evidence-thumbnails", "room-covers", "unit-covers",
]);
const feedbackObject = /^feedback-attachments\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(?:png|jpg)$/;
const readableHeaders = ["content-type", "content-length", "content-range", "accept-ranges", "etag"];

export function storagePath(request) {
  // Trabalha com o caminho recebido, antes da normalização de URL do Node.
  const [path, query] = request.url.split("?");
  const match = /^\/storage\/(object|render\/image)\/(.*)$/.exec(path);
  if (!match) return null;
  const [, kind, rest] = match;
  // Relatos usa upload sem upsert e download direto pelo SDK. O domínio autoriza no Storage.
  if (kind === "object" && query === undefined && feedbackObject.test(rest)) {
    const upsert = request.headers?.["x-upsert"];
    if (request.method === "GET" || (request.method === "POST" && (upsert === undefined || upsert === "false"))) {
      return path.slice("/storage".length);
    }
  }
  const read = request.method === "GET" || request.method === "HEAD";
  const write = request.method === "POST" || request.method === "PUT";
  const parts = rest.split("/");
  const variant = ["authenticated", "list", "info"].includes(parts[0]) ? parts.shift() : "";
  if (!buckets.has(parts.shift())) return null;
  const hasKey = parts.length > 0;
  for (const encoded of parts) {
    let segment;
    try { segment = decodeURIComponent(encoded); } catch { return null; }
    if (!segment || [".", ".."].includes(segment) || /[\\/%]/.test(segment) || [...segment].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return null;
  }

  if (kind === "render/image" && read && variant === "authenticated" && hasKey) {
    const options = new URLSearchParams(query);
    if ([...options.keys()].some((key) => !["width", "height", "resize", "quality", "format"].includes(key))) return null;
  } else if (query !== undefined ||
    !(kind === "object" && (
      (read && ["", "authenticated", "info"].includes(variant) && hasKey) ||
      (write && !variant && hasKey) ||
      (request.method === "POST" && variant === "list" && !hasKey) ||
      (request.method === "DELETE" && !variant)
    ))) {
    return null;
  }
  return request.url.slice("/storage".length);
}

export async function proxyStorage(request, response, path, token) {
  // Só cabeçalhos do contrato do Storage chegam ao upstream. Nunca envia chave administrativa.
  const headers = { authorization: `Bearer ${token}` };
  for (const name of ["content-type", "content-length", "cache-control", "x-upsert", "range"]) {
    if (request.headers[name] !== undefined) headers[name] = request.headers[name];
  }
  const abort = new AbortController();
  const stop = () => abort.abort();
  response.once("close", stop);
  try {
    const upstream = await new Promise((resolve, reject) => {
      const outgoing = upstreamRequest({
        hostname: "storage", port: 5000, path, headers, method: request.method,
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30_000)]),
      }, resolve);
      outgoing.once("error", reject);
      request.once("error", () => outgoing.destroy());
      request.pipe(outgoing);
    });
    const output = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
    for (const name of readableHeaders) {
      if (upstream.headers[name] !== undefined) output[name] = upstream.headers[name];
    }
    response.writeHead(upstream.statusCode, output);
    await pipeline(upstream, response);
  } finally {
    response.off("close", stop);
  }
}
