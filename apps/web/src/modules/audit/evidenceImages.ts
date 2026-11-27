import { identityEnabled } from "../../core/auth/identity";
import { fetchPrivateObject } from "../../core/auth/privateStorage";
import { privateImages, PRIVATE_IMAGE_TTL } from "../../shared/privateImageCache";
import { evidenceImageKey, loadNativeThumbnail, loadOriginalImage, originalImageKey, readImage, storageThumbnailKey, THUMBNAIL_MAX_BYTES } from "../../core/auth/evidenceImages";
import type { ChecklistEvidence } from "./types";
import { BUCKET, downloadUrl } from "./evidence";
import { client } from "../../core/client";
import { db } from "./api";
export const AUDIT_THUMBNAILS_ENABLED = import.meta.env.VITE_AUDIT_EVIDENCE_THUMBNAILS === "true";
export const AUDIT_STORAGE_TRANSFORMS = import.meta.env.VITE_AUDIT_EVIDENCE_STORAGE_TRANSFORMS === "true";
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
export const imageKey = (e: ImageEvidence, authenticated = identityEnabled) =>
  originalImageKey(imagePrefix(e.inspection_id), e, authenticated);
const derivedKey = (e: ImageEvidence) => evidenceImageKey(imagePrefix(e.inspection_id), e, THUMBNAIL_VERSION);
export const thumbnailKey = (e: ImageEvidence, authenticated = identityEnabled, native = AUDIT_STORAGE_TRANSFORMS) =>
  native
    ? storageThumbnailKey(imagePrefix(e.inspection_id), e, authenticated)
    : derivedKey(e);
export function reconcileEvidenceImages(inspection: string, rows: ChecklistEvidence[]) {
  privateImages.reconcile(imagePrefix(inspection), new Set(rows.flatMap(e =>
    [imageKey(e, false), imageKey(e, true), derivedKey(e), thumbnailKey(e, false, true), thumbnailKey(e, true, true)])));
}
export function loadEvidenceImage(e: ImageEvidence, authenticated = identityEnabled) {
  return loadOriginalImage(imageKey(e, authenticated), e, signal => readOriginal(e, signal, authenticated));
}

const fetchSigned = (url: string, signal: AbortSignal) =>
  fetch(url, { cache: "no-store", signal, credentials: "omit", redirect: "error" });

async function readOriginal(e: ImageEvidence, signal: AbortSignal, authenticated: boolean) {
  if (authenticated) return fetchPrivateObject(BUCKET, e.object_key, signal);
  return fetchSigned(await downloadUrl(e, "Evidência"), signal);
}

export function loadStorageThumbnail(e: ImageEvidence, authenticated = identityEnabled) {
  return loadNativeThumbnail(thumbnailKey(e, authenticated, true), e, async (signal, transform) => {
    if (!transform) return readOriginal(e, signal, authenticated);
    if (authenticated) return fetchPrivateObject(BUCKET, e.object_key, signal, transform);
    if (!client) throw new Error("Miniatura indisponível.");
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(e.object_key, SIGNED_URL_SECONDS, { transform });
    if (error || !data?.signedUrl || signal.aborted) throw new Error("Miniatura indisponível.");
    const url = new URL(data.signedUrl);
    const origin = import.meta.env.VITE_SUPABASE_URL;
    if ((origin && url.origin !== new URL(origin).origin) ||
      !url.pathname.endsWith(`/render/image/sign/${BUCKET}/${e.object_key}`) || !url.searchParams.has("token"))
      throw new Error("Miniatura indisponível.");
    return fetchSigned(url.href, signal);
  });
}

// Falhas/ausência terminam aqui: jamais chamam downloadUrl do original.
export function loadEvidenceThumbnail(e: ImageEvidence) {
  return privateImages.load(derivedKey(e), async signal => {
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
    if (identityEnabled) {
      const response = await fetchPrivateObject("audit-evidence-thumbnails", row.derived_object_key, signal);
      return readImage(response, row.mime, Number(row.bytes), THUMBNAIL_MAX_BYTES, expiresAt);
    }
    const signed = await client.storage.from("audit-evidence-thumbnails").createSignedUrl(row.derived_object_key, 60);
    if (signed.error || !signed.data?.signedUrl || signal.aborted) throw new Error("Miniatura indisponível.");
    const url = new URL(signed.data.signedUrl);
    const origin = import.meta.env.VITE_SUPABASE_URL;
    if (origin && url.origin !== new URL(origin).origin) throw new Error("Miniatura indisponível.");
    return readImage(await fetchSigned(url.href, signal), row.mime, Number(row.bytes), THUMBNAIL_MAX_BYTES, expiresAt);
  });
}
