// Browser-side preparation of a unit cover (Unit Cover v1). The user's original file is
// only read locally; the canonical JPEG produced here is the only thing ever uploaded.
// Re-encoding also drops EXIF metadata (e.g. GPS location) from the uploaded image.
// Client checks are a usability/safety layer; the server bounds metadata independently.
export const COVER_INPUT_MAX_BYTES = 8 * 1024 * 1024;
export const COVER_MAX_SIDE = 2560;
export const COVER_TARGET_BYTES = 512 * 1024;
export const COVER_HARD_MAX_BYTES = 1024 * 1024;
/** Decoding beyond this would need hundreds of MB of RGBA memory. */
export const COVER_MAX_SOURCE_PIXELS = 40_000_000;
export const COVER_MAX_SOURCE_SIDE = 16_384;
export const COVER_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
export const COVER_FORMATS_HINT = "JPEG, PNG ou WebP, até 8 MB.";
const SCALES = [1, 0.8, 0.64];
const QUALITIES = [0.86, 0.8, 0.72, 0.64];
export class CoverImageError extends Error {}
export type ImageFormat = "jpeg" | "png" | "webp";
export type PreparedCover = { blob: Blob; width: number; height: number };
export type DecodedImage = { width: number; height: number; close(): void };
/** Decode/encode boundary, injectable for tests. */
export type CoverCodec = {
  decode(source: Blob): Promise<DecodedImage>;
  encode(image: DecodedImage, width: number, height: number, quality: number): Promise<Blob>;
};
const MIME: Record<ImageFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const ascii = (b: Uint8Array, at: number, text: string) =>
  [...text].every((c, i) => b[at + i] === c.charCodeAt(0));
/** Real format from magic bytes; the declared MIME type and extension are ignored. */
export function sniffFormat(b: Uint8Array): ImageFormat | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "png";
  if (ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) return "webp";
  return null;
}
const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
/** Pixel dimensions from the file header, without decoding the image. */
export function readDimensions(b: Uint8Array, format: ImageFormat): { width: number; height: number } | null {
  let width = 0;
  let height = 0;
  if (format === "png") {
    if (!ascii(b, 12, "IHDR")) return null;
    width = u32be(b, 16);
    height = u32be(b, 20);
  } else if (format === "webp") {
    if (ascii(b, 12, "VP8X")) {
      width = 1 + u24le(b, 24);
      height = 1 + u24le(b, 27);
    } else if (ascii(b, 12, "VP8L") && b[20] === 0x2f) {
      width = 1 + (b[21] | ((b[22] & 0x3f) << 8));
      height = 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10));
    } else if (ascii(b, 12, "VP8 ") && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
      width = u16le(b, 26) & 0x3fff;
      height = u16le(b, 28) & 0x3fff;
    } else return null;
  } else {
    // Walk JPEG segments up to the first start-of-frame marker.
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xff) {
        i++;
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) return null;
      const length = u16be(b, i + 2);
      if (length < 2) return null;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        height = u16be(b, i + 5);
        width = u16be(b, i + 7);
        break;
      }
      i += 2 + length;
    }
  }
  return width > 0 && height > 0 ? { width, height } : null;
}
async function isJpeg(blob: Blob) {
  const head = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
  return blob.type === "image/jpeg" && sniffFormat(head) === "jpeg";
}
/**
 * Validates and converts a user-selected JPEG/PNG/WebP into the canonical cover:
 * JPEG, longest side <= 2560 px, aiming at <= 512 KiB and never above 1 MiB.
 */
export async function prepareCoverImage(file: Blob, codec: CoverCodec = browserCodec): Promise<PreparedCover> {
  if (file.size === 0) throw new CoverImageError("O arquivo está vazio.");
  if (file.size > COVER_INPUT_MAX_BYTES) throw new CoverImageError("A foto excede o limite de 8 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = sniffFormat(bytes);
  if (!format) throw new CoverImageError(`Formato não suportado. Use ${COVER_FORMATS_HINT.replace(", até 8 MB.", ".")}`);
  const header = readDimensions(bytes, format);
  if (!header) throw new CoverImageError("Não foi possível ler esta imagem. O arquivo pode estar corrompido.");
  if (
    header.width > COVER_MAX_SOURCE_SIDE ||
    header.height > COVER_MAX_SOURCE_SIDE ||
    header.width * header.height > COVER_MAX_SOURCE_PIXELS
  )
    throw new CoverImageError("A imagem tem resolução alta demais (máximo de 40 megapixels).");
  let image: DecodedImage;
  try {
    // Decode as the sniffed type, never the declared one.
    image = await codec.decode(new Blob([bytes], { type: MIME[format] }));
  } catch {
    throw new CoverImageError("Não foi possível abrir esta imagem. O arquivo pode estar corrompido.");
  }
  try {
    if (!(image.width > 0 && image.height > 0))
      throw new CoverImageError("Não foi possível abrir esta imagem. O arquivo pode estar corrompido.");
    let best: PreparedCover | null = null;
    for (const factor of SCALES) {
      const scale = Math.min(1, COVER_MAX_SIDE / Math.max(image.width, image.height)) * factor;
      const width = Math.max(1, Math.min(COVER_MAX_SIDE, Math.round(image.width * scale)));
      const height = Math.max(1, Math.min(COVER_MAX_SIDE, Math.round(image.height * scale)));
      for (const quality of QUALITIES) {
        let blob: Blob;
        try {
          blob = await codec.encode(image, width, height, quality);
        } catch {
          throw new CoverImageError("Não foi possível processar esta imagem neste navegador.");
        }
        if (!(await isJpeg(blob)))
          throw new CoverImageError("Este navegador não conseguiu gerar a imagem em JPEG.");
        if (blob.size <= COVER_TARGET_BYTES) return { blob, width, height };
        if (blob.size <= COVER_HARD_MAX_BYTES && (!best || blob.size < best.blob.size))
          best = { blob, width, height };
      }
    }
    if (best) return best;
    throw new CoverImageError("Não foi possível reduzir a foto para até 1 MB. Tente outra imagem.");
  } finally {
    image.close();
  }
}

type Drawable = DecodedImage & { source: CanvasImageSource };
/** Real browser codec: EXIF-aware decode and a white-backed canvas re-encode. */
export const browserCodec: CoverCodec = {
  async decode(source) {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
      return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() } as Drawable;
    }
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } finally {
      URL.revokeObjectURL(url);
    }
    return { width: img.naturalWidth, height: img.naturalHeight, source: img, close: () => img.removeAttribute("src") } as Drawable;
  },
  async encode(image, width, height, quality) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    try {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      // JPEG has no alpha: transparent PNG/WebP areas become white, not black.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.imageSmoothingQuality = "high";
      context.drawImage((image as Drawable).source, 0, 0, width, height);
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Encoding failed"))), "image/jpeg", quality),
      );
    } finally {
      // Release the backing store promptly (large canvases are memory-heavy on phones).
      canvas.width = 0;
      canvas.height = 0;
    }
  },
};
