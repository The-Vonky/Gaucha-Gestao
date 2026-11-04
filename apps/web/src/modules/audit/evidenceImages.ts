import { privateImages, PRIVATE_IMAGE_TTL } from "../../shared/privateImageCache";
import { MAX_BYTES } from "../../shared/evidenceFiles";
import type { ChecklistEvidence } from "./types";
import { downloadUrl } from "./evidence";
export type ImageEvidence = Pick<ChecklistEvidence, "id" | "inspection_id" | "object_key" | "content_type" | "size_bytes" | "uploaded_at">;
export const imagePrefix = (inspection: string) => `audit:${inspection}:`;
export const imageKey = (e: ImageEvidence) => imagePrefix(e.inspection_id) + JSON.stringify([e.id, e.object_key, e.content_type, e.size_bytes, e.uploaded_at]);
export function reconcileEvidenceImages(inspection: string, rows: ChecklistEvidence[]) {
  privateImages.reconcile(imagePrefix(inspection), new Set(rows.map(imageKey)));
}
export function loadEvidenceImage(e: ImageEvidence) {
  return privateImages.load(imageKey(e), async signal => {
    if (!["image/jpeg", "image/png"].includes(e.content_type) || e.size_bytes <= 0 || e.size_bytes > MAX_BYTES)
      throw new Error("Imagem indisponível.");
    // O prazo começa antes da assinatura. O blob nunca prolonga os 60s do link original.
    const expiresAt = Date.now() + PRIVATE_IMAGE_TTL;
    const url = await downloadUrl(e, "Evidência");
    if (signal.aborted) throw new Error("Imagem indisponível.");
    const response = await fetch(url, { cache: "no-store", signal, credentials: "omit", redirect: "error" });
    if (!response.ok || response.headers.get("content-type")?.split(";")[0].trim() !== e.content_type)
      throw new Error("Imagem indisponível.");
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
        if (bytes > e.size_bytes || bytes > MAX_BYTES) throw new Error("Imagem indisponível.");
        chunks.push(value as Uint8Array<ArrayBuffer>);
      }
      if (bytes !== e.size_bytes) throw new Error("Imagem indisponível.");
      return { blob: new Blob(chunks, { type: e.content_type }), expiresAt };
    } finally { await reader.cancel(); }
  });
}
