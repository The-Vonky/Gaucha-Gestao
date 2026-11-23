import { identityEnabled } from "../../../core/auth/identity";
import { fetchPrivateObject } from "../../../core/auth/privateStorage";
import { client } from "../../../core/client";
import { privateImages } from "../../../shared/privateImageCache";
import { MAX_BYTES } from "../../../shared/evidenceFiles";
import { BUCKET, downloadUrl, listEvidence } from "../evidence";
import { AUDIT_STORAGE_TRANSFORMS } from "../evidenceImages";
import type { ChecklistEvidence } from "../types";
import type { InspectionReport } from "./types";

export type ReportEvidence = {
  id: string; itemKey: string; section: string; number: number; question: string;
  name: string; originalName: string; uploadedAt: string; uploadedBy: string; contentType: string;
  image?: { blob: Blob; width: number; height: number };
};
export class ReportEvidenceError extends Error {}
export const REPORT_MAX_BYTES = 24 * 1024 * 1024;
export const REPORT_MAX_IMAGES = 100;
const unavailable = () => new ReportEvidenceError("Não foi possível carregar a imagem. Verifique o acesso e tente novamente.");
function abortable<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
export function imageSize(width: number, height: number, count: number) {
  const scale = Math.min(1, 1280 / Math.max(width, height), Math.sqrt(Math.min(1_200_000, 48_000_000 / Math.max(1, count)) / (width * height)));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
// Lê as dimensões antes da decodificação para limitar o uso de memória de um original.
export async function sourceSize(blob: Blob) {
  const v = new DataView(await blob.arrayBuffer());
  let width = 0, height = 0;
  if (blob.type === "image/png" && v.byteLength >= 24 && v.getUint32(0) === 0x89504e47 && v.getUint32(4) === 0x0d0a1a0a && v.getUint32(12) === 0x49484452) {
    width = v.getUint32(16); height = v.getUint32(20);
  } else if (blob.type === "image/jpeg" && v.byteLength >= 4 && v.getUint16(0) === 0xffd8) {
    for (let offset = 2; offset + 4 <= v.byteLength;) {
      if (v.getUint8(offset++) !== 0xff) break;
      while (offset < v.byteLength && v.getUint8(offset) === 0xff) offset++;
      if (offset + 3 > v.byteLength) break;
      const marker = v.getUint8(offset++), length = v.getUint16(offset);
      if (length < 2 || offset + length > v.byteLength || marker === 0xda || marker === 0xd9) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) { height = v.getUint16(offset + 3); width = v.getUint16(offset + 5); break; }
      offset += length;
    }
  }
  if (!width || !height || width * height > 40_000_000) throw new ReportEvidenceError("Imagem inválida ou acima de 40 megapixels. Gere uma versão menor e anexe novamente.");
  return { width, height };
}
async function readImage(row: ChecklistEvidence, signal: AbortSignal): Promise<Blob> {
  if (!Number.isSafeInteger(row.size_bytes) || row.size_bytes <= 0 || row.size_bytes > MAX_BYTES) throw unavailable();
  const transformed = AUDIT_STORAGE_TRANSFORMS && row.size_bytes > 256 * 1024;
  const transform = { width: 1280, height: 1280, resize: "contain", quality: 82, format: "origin" } as const;
  let response: Response;
  if (identityEnabled) {
    response = await fetchPrivateObject(BUCKET, row.object_key, signal, transformed ? transform : undefined);
  } else {
    let url: string;
    if (transformed) {
      if (!client) throw unavailable();
      const result = await abortable(client.storage.from(BUCKET).createSignedUrl(row.object_key, 60, {
        transform,
      }), signal);
      if (result.error || !result.data?.signedUrl) throw unavailable();
      const signed = new URL(result.data.signedUrl);
      if (signed.origin !== new URL(import.meta.env.VITE_SUPABASE_URL).origin ||
          !signed.pathname.endsWith(`/render/image/sign/${BUCKET}/${row.object_key}`)) throw unavailable();
      url = signed.href;
    } else url = await abortable(downloadUrl(row), signal);
    signal.throwIfAborted();
    response = await fetch(url, { signal, cache: "no-store", credentials: "omit", redirect: "error" });
  }
  const mime = response.headers.get("content-type")?.split(";")[0].trim();
  if (!response.ok || !["image/jpeg", "image/png"].includes(mime ?? "")) { await response.body?.cancel(); throw unavailable(); }
  const reader = response.body?.getReader();
  if (!reader) throw unavailable();
  const parts: BlobPart[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > (transformed ? 2 * 1024 * 1024 : row.size_bytes)) throw unavailable();
      parts.push(value as Uint8Array<ArrayBuffer>);
    }
    if (!bytes || (!transformed && bytes !== row.size_bytes)) throw unavailable();
    return new Blob(parts, { type: mime });
  } finally { await reader.cancel(); }
}
export async function reportImage(row: ChecklistEvidence, count: number, signal: AbortSignal) {
  const blob = await readImage(row, signal);
  const size = await sourceSize(blob);
  signal.throwIfAborted();
  // Bitmap aplica a orientação EXIF; dimensões finais seguem a orientação decodificada.
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  try {
    const dimensions = imageSize(bitmap.width || size.width, bitmap.height || size.height, count);
    canvas.width = dimensions.width; canvas.height = dimensions.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw unavailable();
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const output = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(unavailable()), "image/jpeg", .82));
    signal.throwIfAborted();
    if (output.size > 1024 * 1024) throw new ReportEvidenceError("Imagem de relatório acima de 1 MB. Anexe uma versão menor e tente novamente.");
    return { blob: output, ...dimensions };
  } finally { bitmap.close(); canvas.width = 0; canvas.height = 0; }
}
export async function prepareEvidence(report: InspectionReport, signal: AbortSignal, progress: (text: string) => void): Promise<ReportEvidence[]> {
  const epoch = privateImages.getAccessVersion();
  const rows = await abortable(listEvidence(report.inspection.id), AbortSignal.any([signal, AbortSignal.timeout(30_000)]));
  signal.throwIfAborted();
  if (rows.length > REPORT_MAX_IMAGES) throw new ReportEvidenceError("Mais de 100 evidências. Reduza o conjunto antes de exportar.");
  const images = rows.filter(row => ["image/jpeg", "image/png"].includes(row.content_type)).length;
  const result: ReportEvidence[] = [];
  let bytes = 0;
  for (const section of report.sections) for (const item of section.items) {
    const attached = rows.filter(row => row.item_key === item.key);
    for (const [index, row] of attached.entries()) {
      const name = `Evidência ${index + 1}${row.original_name.match(/\.[a-z0-9]+$/i)?.[0] ?? ""}`;
      progress(`Preparando evidência ${result.length + 1} de ${rows.length} · critério ${item.number}…`);
      try {
        signal.throwIfAborted();
        const imageSignal = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
        const image = ["image/jpeg", "image/png"].includes(row.content_type) ? await reportImage(row, images, imageSignal) : undefined;
        bytes += image?.blob.size ?? 0;
        if (bytes > REPORT_MAX_BYTES) throw new ReportEvidenceError("As imagens do relatório ultrapassam 24 MB. Utilize anexos menores.");
        if (epoch !== privateImages.getAccessVersion()) throw unavailable();
        result.push({ id: row.id, itemKey: item.key, section: section.name, number: item.number, question: item.text,
          name, originalName: row.original_name, uploadedAt: row.uploaded_at, uploadedBy: row.uploaded_by_name,
          contentType: row.content_type, image });
      } catch (error) {
        signal.throwIfAborted();
        throw new ReportEvidenceError(`Critério ${item.number}, ${name}: ${error instanceof ReportEvidenceError ? error.message : unavailable().message} Nenhum arquivo foi exportado.`);
      }
      // Dá ao browser oportunidade de pintar o progresso e receber cancelamento.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  if (result.length !== rows.length) throw new ReportEvidenceError("Há evidências sem critério correspondente no relatório. Atualize e tente novamente.");
  return result;
}

export async function checkEvidence(report: InspectionReport, prepared: ReportEvidence[]) {
  const rows = await listEvidence(report.inspection.id);
  if (rows.length !== prepared.length || rows.some(row => !prepared.some(e => e.id === row.id && e.itemKey === row.item_key &&
      e.originalName === row.original_name && e.uploadedAt === row.uploaded_at && e.uploadedBy === row.uploaded_by_name && e.contentType === row.content_type)))
    throw new ReportEvidenceError("As evidências mudaram durante a preparação. Gere o relatório novamente.");
}
