import { isEvidenceImage, MAX_BYTES } from "../../shared/evidenceFiles";
import { privateImages, PRIVATE_IMAGE_TTL } from "../../shared/privateImageCache";

const THUMBNAIL_DIMENSION = 480;
export const THUMBNAIL_MAX_BYTES = 1024 * 1024;
const SMALL_ORIGINAL_MAX_BYTES = 64 * 1024;
const TRANSFORM = { width: THUMBNAIL_DIMENSION, height: THUMBNAIL_DIMENSION, resize: "contain", quality: 75, format: "origin" } as const;

export type EvidenceImageFile = {
  id: string;
  object_key: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
};

export const evidenceImageKey = (prefix: string, file: EvidenceImageFile, mode: string) =>
  prefix + mode + ":" + JSON.stringify([file.id, file.object_key, file.content_type, file.size_bytes, file.uploaded_at]);
export const storageThumbnailKey = (prefix: string, file: EvidenceImageFile, authenticated: boolean) =>
  evidenceImageKey(prefix, file, authenticated ? "authenticated:storage-480-v1" : "signed:storage-480-v1");
export const originalImageKey = (prefix: string, file: EvidenceImageFile, authenticated: boolean) =>
  evidenceImageKey(prefix, file, authenticated ? "authenticated:original" : "signed:original");

export function invalidateEvidenceImages(prefix: string, id: string) {
  privateImages.invalidateMatching(key => key.startsWith(prefix) && key.includes(":[" + JSON.stringify(id) + ","));
}

type ReadObject = (signal: AbortSignal, transform?: typeof TRANSFORM) => Promise<Response>;

function validateImage(file: EvidenceImageFile) {
  if (!isEvidenceImage(file.content_type) || !Number.isSafeInteger(file.size_bytes) ||
    file.size_bytes <= 0 || file.size_bytes > MAX_BYTES) throw new Error("Imagem indisponível.");
}

export function loadOriginalImage(key: string, file: EvidenceImageFile, read: ReadObject) {
  return privateImages.load(key, async signal => {
    validateImage(file);
    const expiresAt = Date.now() + PRIVATE_IMAGE_TTL;
    return readImage(await read(signal), file.content_type, file.size_bytes, MAX_BYTES, expiresAt);
  });
}

export function loadNativeThumbnail(key: string, file: EvidenceImageFile, read: ReadObject) {
  return privateImages.load(key, async signal => {
    validateImage(file);
    const expiresAt = Date.now() + PRIVATE_IMAGE_TTL;
    if (file.size_bytes <= SMALL_ORIGINAL_MAX_BYTES) {
      const preview = await readImage(await read(signal), file.content_type, file.size_bytes, SMALL_ORIGINAL_MAX_BYTES, expiresAt);
      if (await isCompactPreview(preview.blob)) return preview;
    }
    if (signal.aborted) throw new Error("Miniatura indisponível.");
    const maxBytes = Math.min(THUMBNAIL_MAX_BYTES, file.size_bytes - 1);
    return readImage(await read(signal, TRANSFORM), file.content_type, null, maxBytes, expiresAt);
  });
}

export async function readImage(response: Response, mime: string, expectedBytes: number | null, maxBytes: number, expiresAt: number) {
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
