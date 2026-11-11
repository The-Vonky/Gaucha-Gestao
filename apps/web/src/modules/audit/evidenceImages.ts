import { privateImages, PRIVATE_IMAGE_TTL } from "../../shared/privateImageCache";
import { MAX_BYTES } from "../../shared/evidenceFiles";
import type { ChecklistEvidence } from "./types";
import { downloadUrl } from "./evidence";
import { client } from "../../core/client";
import { db } from "./api";
export const AUDIT_THUMBNAILS_ENABLED = import.meta.env.VITE_AUDIT_EVIDENCE_THUMBNAILS === "true";
export const SMALL_ORIGINAL_PREVIEW_BYTES = 64 * 1024;
export const THUMBNAIL_WAIT_MS = 15_000;
export const THUMBNAIL_VERSION = "img-480-v1";
export type ImageEvidence = Pick<ChecklistEvidence, "id" | "inspection_id" | "object_key" | "content_type" | "size_bytes" | "uploaded_at">;
export async function evidenceThumbnailState(id: string, signal: AbortSignal) {
  const { data, error } = await db().rpc("checklist_evidence_thumbnail_state", { p_evidence: id }).abortSignal(signal);
  const row = data?.[0];
  if (error) throw new Error("Estado da miniatura indisponível.");
  if (!row) return { state: "absent", reason: null, retryable: false };
  if (!["absent", "pending", "processing", "failed", "ready"].includes(row.state) || typeof row.retryable !== "boolean")
    throw new Error("Estado da miniatura indisponível.");
  return { state: row.state as string, reason: row.reason as string | null, retryable: row.retryable as boolean };
}
export const imagePrefix = (inspection: string) => `audit:${inspection}:`;
export const imageKey = (e: ImageEvidence) => imagePrefix(e.inspection_id) + JSON.stringify([e.id, e.object_key, e.content_type, e.size_bytes, e.uploaded_at]);
export const thumbnailKey = (e: ImageEvidence) => imagePrefix(e.inspection_id) + "thumb:" + THUMBNAIL_VERSION + ":" + imageKey(e).slice(imagePrefix(e.inspection_id).length);
export function reconcileEvidenceImages(inspection: string, rows: ChecklistEvidence[]) {
  privateImages.reconcile(imagePrefix(inspection), new Set(rows.flatMap(e => [imageKey(e), thumbnailKey(e)])));
}
export function loadEvidenceImage(e: ImageEvidence) {
  return privateImages.load(imageKey(e), async signal => {
    if (!["image/jpeg", "image/png"].includes(e.content_type) || e.size_bytes <= 0 || e.size_bytes > MAX_BYTES)
      throw new Error("Imagem indisponível.");
    // O prazo começa antes da assinatura. O blob nunca prolonga os 60s do link original.
    const expiresAt = Date.now() + PRIVATE_IMAGE_TTL;
    const url = await downloadUrl(e, "Evidência");
    if (signal.aborted) throw new Error("Imagem indisponível.");
    return readImage(url, e.content_type, e.size_bytes, MAX_BYTES, expiresAt, signal);
  });
}

async function readImage(url: string, mime: string, expectedBytes: number, maxBytes: number, expiresAt: number, signal: AbortSignal) {
  const response = await fetch(url, { cache: "no-store", signal, credentials: "omit", redirect: "error" });
  if (!response.ok || response.headers.get("content-type")?.split(";")[0].trim() !== mime) {
    await response.body?.cancel();
    throw new Error("Imagem indisponível.");
  }
  // Limita também respostas com tamanho incorreto/chunked antes de formar um Blob.
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Imagem indisponível.");
  const chunks: BlobPart[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > expectedBytes || bytes > maxBytes) throw new Error("Imagem indisponível.");
      chunks.push(value as Uint8Array<ArrayBuffer>);
    }
    if (bytes !== expectedBytes) throw new Error("Imagem indisponível.");
    return { blob: new Blob(chunks, { type: mime }), expiresAt };
  } finally { await reader.cancel(); }
}

// Falhas/ausência terminam aqui: jamais chamam downloadUrl do original.
export function loadEvidenceThumbnail(e: ImageEvidence) {
  return privateImages.load(thumbnailKey(e), async signal => {
    if (!client || !["image/jpeg", "image/png"].includes(e.content_type)) throw new Error("Miniatura indisponível.");
    const expiresAt = Date.now() + PRIVATE_IMAGE_TTL;
    const { data, error } = await db().rpc("checklist_evidence_thumbnail", { p_evidence: e.id });
    const row = data?.[0];
    if (error || !row || row.evidence_id !== e.id || row.encoder_version !== THUMBNAIL_VERSION ||
      !["image/jpeg", "image/png"].includes(row.mime) || !/^[a-f0-9]{64}$/.test(row.derived_sha256) ||
      !Number.isSafeInteger(Number(row.bytes)) || Number(row.bytes) <= 0 || Number(row.bytes) >= e.size_bytes ||
      Number(row.bytes) > 1_048_576 || typeof row.derived_object_key !== "string" ||
      !new RegExp(`^${e.id}/${THUMBNAIL_VERSION}/[a-f0-9]{64}/${row.derived_sha256}\\.${row.mime === "image/png" ? "png" : "jpg"}$`).test(row.derived_object_key) ||
      signal.aborted) throw new Error("Miniatura indisponível.");
    const signed = await client.storage.from("audit-evidence-thumbnails").createSignedUrl(row.derived_object_key, 60);
    if (signed.error || !signed.data?.signedUrl || signal.aborted) throw new Error("Miniatura indisponível.");
    const url = new URL(signed.data.signedUrl);
    const origin = import.meta.env.VITE_SUPABASE_URL;
    if (origin && url.origin !== new URL(origin).origin) throw new Error("Miniatura indisponível.");
    return readImage(url.href, row.mime, Number(row.bytes), 1_048_576, expiresAt, signal);
  });
}
