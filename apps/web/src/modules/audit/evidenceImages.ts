import { privateImages, PRIVATE_IMAGE_TTL } from "../../shared/privateImageCache";
import { MAX_BYTES } from "../../shared/evidenceFiles";
import type { ChecklistEvidence } from "./types";
import { BUCKET, downloadUrl } from "./evidence";
import { client } from "../../core/client";
import { db } from "./api";
export const AUDIT_THUMBNAILS_ENABLED = import.meta.env.VITE_AUDIT_EVIDENCE_THUMBNAILS === "true";
export const AUDIT_STORAGE_TRANSFORMS = import.meta.env.VITE_AUDIT_EVIDENCE_STORAGE_TRANSFORMS === "true";
const THUMBNAIL_DIMENSION = 480;
const THUMBNAIL_MAX_BYTES = 1024 * 1024;
const SMALL_ORIGINAL_MAX_BYTES = 64 * 1024;
const SIGNED_URL_SECONDS = PRIVATE_IMAGE_TTL / 1000;
export const THUMBNAIL_VERSION = "img-480-v1";
export type ImageEvidence = Pick<ChecklistEvidence, "id" | "inspection_id" | "object_key" | "content_type" | "size_bytes" | "uploaded_at">;
export async function evidenceThumbnailState(id: string) {
  const { data, error } = await db().rpc("checklist_evidence_thumbnail_state", { p_evidence: id });
  const row = data?.[0];
  if (error) throw new Error("Estado da miniatura indisponível.");
  if (!row) return { state: "absent", reason: null, retryable: false };
  if (!["absent", "pending", "processing", "failed", "ready"].includes(row.state) || typeof row.retryable !== "boolean")
    throw new Error("Estado da miniatura indisponível.");
  return { state: row.state as string, reason: row.reason as string | null, retryable: row.retryable as boolean };
}
export const imagePrefix = (inspection: string) => `audit:${inspection}:`;
export const imageKey = (e: ImageEvidence) => imagePrefix(e.inspection_id) + JSON.stringify([e.id, e.object_key, e.content_type, e.size_bytes, e.uploaded_at]);
export const thumbnailKey = (e: ImageEvidence) => imagePrefix(e.inspection_id) + "thumb:" +
  (AUDIT_STORAGE_TRANSFORMS ? "storage-480-v1" : THUMBNAIL_VERSION) + ":" + imageKey(e).slice(imagePrefix(e.inspection_id).length);
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

async function readImage(url: string, mime: string, expectedBytes: number | null, maxBytes: number, expiresAt: number, signal: AbortSignal) {
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
      if (bytes > maxBytes || (expectedBytes !== null && bytes > expectedBytes)) throw new Error("Imagem indisponível.");
      chunks.push(value as Uint8Array<ArrayBuffer>);
    }
    if (bytes === 0 || (expectedBytes !== null && bytes !== expectedBytes)) throw new Error("Imagem indisponível.");
    return { blob: new Blob(chunks, { type: mime }), expiresAt };
  } finally { await reader.cancel(); }
}

function fitsThumbnail(width: number, height: number) {
  return width > 0 && width <= THUMBNAIL_DIMENSION && height > 0 && height <= THUMBNAIL_DIMENSION;
}

// Só apresenta o original compacto quando o cabeçalho indica dimensões seguras.
// PNG animado e JPEG fora dos perfis comuns seguem para transformação.
async function isCompactPreview(blob: Blob) {
  const view = new DataView(await blob.arrayBuffer());
  if (blob.type === "image/png") {
    if (view.byteLength < 33 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a ||
      view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452 ||
      !fitsThumbnail(view.getUint32(16), view.getUint32(20))) return false;
    for (let offset = 33; offset + 12 <= view.byteLength;) {
      const length = view.getUint32(offset);
      if (length > view.byteLength - offset - 12) return false;
      const type = view.getUint32(offset + 4);
      if (type === 0x6163544c) return false; // acTL
      if (type === 0x49454e44) return length === 0; // IEND
      offset += length + 12;
    }
    return false;
  }
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return false;
  for (let offset = 2; offset + 4 <= view.byteLength;) {
    if (view.getUint8(offset++) !== 0xff) return false;
    while (offset < view.byteLength && view.getUint8(offset) === 0xff) offset++;
    if (offset + 3 > view.byteLength) return false;
    const marker = view.getUint8(offset++);
    if (marker === 0xda || marker === 0xd9) return false; // SOS/EOI antes de SOF
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > view.byteLength) return false;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2)
      return length >= 8 && fitsThumbnail(view.getUint16(offset + 5), view.getUint16(offset + 3));
    offset += length;
  }
  return false;
}

export function loadStorageThumbnail(e: ImageEvidence) {
  return privateImages.load(thumbnailKey(e), async signal => {
    if (!client || !["image/jpeg", "image/png"].includes(e.content_type) ||
      !Number.isSafeInteger(e.size_bytes) || e.size_bytes <= 0 || e.size_bytes > MAX_BYTES)
      throw new Error("Miniatura indisponível.");
    if (e.size_bytes <= SMALL_ORIGINAL_MAX_BYTES) {
      const expiresAt = Date.now() + PRIVATE_IMAGE_TTL;
      const url = await downloadUrl(e, "Evidência");
      if (signal.aborted) throw new Error("Miniatura indisponível.");
      const preview = await readImage(url, e.content_type, e.size_bytes, SMALL_ORIGINAL_MAX_BYTES, expiresAt, signal);
      if (await isCompactPreview(preview.blob)) return preview;
    }
    if (signal.aborted) throw new Error("Miniatura indisponível.");
    const expiresAt = Date.now() + PRIVATE_IMAGE_TTL;
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(e.object_key, SIGNED_URL_SECONDS, {
      transform: { width: THUMBNAIL_DIMENSION, height: THUMBNAIL_DIMENSION, resize: "contain", quality: 75, format: "origin" },
    });
    if (error || !data?.signedUrl || signal.aborted) throw new Error("Miniatura indisponível.");
    const url = new URL(data.signedUrl);
    const origin = import.meta.env.VITE_SUPABASE_URL;
    if ((origin && url.origin !== new URL(origin).origin) ||
      !url.pathname.endsWith(`/render/image/sign/${BUCKET}/${e.object_key}`) || !url.searchParams.has("token"))
      throw new Error("Miniatura indisponível.");
    return readImage(url.href, e.content_type, null, Math.min(THUMBNAIL_MAX_BYTES, e.size_bytes - 1), expiresAt, signal);
  });
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
