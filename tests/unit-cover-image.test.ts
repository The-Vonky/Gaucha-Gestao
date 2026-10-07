import { describe, expect, it, vi } from "vitest";
import {
  COVER_HARD_MAX_BYTES,
  COVER_TARGET_BYTES,
  CoverImageError,
  prepareCoverImage,
  readDimensions,
  sniffFormat,
  type CoverCodec,
} from "../apps/web/src/core/unitCoverImage";
const u16be = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u16le = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const u24le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const text = (s: string) => [...s].map((c) => c.charCodeAt(0));
/** JPEG with an APP0 and an APP1 (EXIF-sized) segment before SOF0. */
function jpeg(width: number, height: number, marker = 0xc0) {
  const app0 = [0xff, 0xe0, ...u16be(16), ...text("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const app1 = [0xff, 0xe1, ...u16be(2 + 300), ...new Array(300).fill(0)];
  const sof = [0xff, marker, ...u16be(17), 8, ...u16be(height), ...u16be(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, 0xff, 0xff, ...app0.slice(1), ...app1, ...sof, 0xff, 0xd9]);
}
function png(width: number, height: number) {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...text("IHDR"), ...u32be(width), ...u32be(height), 8, 6, 0, 0, 0, 0, 0, 0, 0]);
}
const riff = (chunk: number[]) => new Uint8Array([...text("RIFF"), ...u32be(chunk.length + 4).reverse(), ...text("WEBP"), ...chunk]);
const webpX = (w: number, h: number) => riff([...text("VP8X"), 10, 0, 0, 0, 0, 0, 0, 0, ...u24le(w - 1), ...u24le(h - 1)]);
const webpLossy = (w: number, h: number) => riff([...text("VP8 "), 20, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(w), ...u16le(h), 0, 0]);
function webpLossless(w: number, h: number) {
  const a = w - 1, b = h - 1;
  return riff([...text("VP8L"), 5, 0, 0, 0, 0x2f, a & 0xff, ((a >> 8) & 0x3f) | ((b & 0x3) << 6), (b >> 2) & 0xff, (b >> 10) & 0x0f]);
}
const file = (bytes: Uint8Array, type = "image/jpeg", name = "foto.jpg") => new File([bytes], name, { type });
const jpegBlob = (size: number) => {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff]);
  return new Blob([bytes], { type: "image/jpeg" });
};
/** Fake codec: records calls; output size can depend on dimensions/quality. */
function codec(width: number, height: number, size: (w: number, h: number, q: number) => number = () => 200_000) {
  const close = vi.fn();
  const fake = {
    close,
    decode: vi.fn(async (blob: Blob) => {
      void blob;
      return { width, height, close };
    }),
    encode: vi.fn(async (_image: unknown, w: number, h: number, q: number) => jpegBlob(size(w, h, q))),
  };
  return fake satisfies CoverCodec & { close: unknown };
}
describe("unit cover header parsing", () => {
  it.each([
    ["jpeg", jpeg(4032, 3024), { width: 4032, height: 3024 }],
    ["jpeg progressive", jpeg(800, 600, 0xc2), { width: 800, height: 600 }],
    ["png", png(1920, 1080), { width: 1920, height: 1080 }],
    ["webp VP8X", webpX(3000, 2000), { width: 3000, height: 2000 }],
    ["webp VP8", webpLossy(640, 480), { width: 640, height: 480 }],
    ["webp VP8L", webpLossless(1234, 567), { width: 1234, height: 567 }],
  ])("reads %s dimensions without decoding", (_name, bytes, expected) => {
    const format = sniffFormat(bytes);
    expect(format).not.toBeNull();
    expect(readDimensions(bytes, format!)).toEqual(expected);
  });
  it("identifies formats only by magic bytes", () => {
    expect(sniffFormat(new Uint8Array(text("GIF89a")))).toBeNull();
    expect(sniffFormat(new Uint8Array(text("%PDF-1.4")))).toBeNull();
    expect(sniffFormat(new Uint8Array([0x3c, 0x73, 0x76, 0x67]))).toBeNull();
    expect(readDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]), "jpeg")).toBeNull();
  });
});
describe("prepareCoverImage", () => {
  it.each([
    ["JPEG", jpeg(1600, 900), "image/jpeg"],
    ["PNG", png(1600, 900), "image/png"],
    ["WebP", webpX(1600, 900), "image/webp"],
  ])("converts a valid %s into the canonical JPEG", async (_name, bytes, sniffed) => {
    const c = codec(1600, 900);
    const out = await prepareCoverImage(file(bytes, "application/octet-stream", "x.bin"), c);
    expect(c.decode.mock.calls[0][0].type).toBe(sniffed);
    expect(out).toMatchObject({ width: 1600, height: 900 });
    expect(out.blob.type).toBe("image/jpeg");
    expect(new Uint8Array(await out.blob.slice(0, 3).arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
    expect(c.close).toHaveBeenCalledTimes(1);
  });
  it("rejects files above 8 MiB and empty files before reading pixels", async () => {
    const c = codec(10, 10);
    const big = new Uint8Array(8 * 1024 * 1024 + 1);
    big.set(jpeg(10, 10));
    await expect(prepareCoverImage(file(big), c)).rejects.toThrow("excede o limite de 8 MB");
    await expect(prepareCoverImage(file(new Uint8Array()), c)).rejects.toBeInstanceOf(CoverImageError);
    expect(c.decode).not.toHaveBeenCalled();
  });
  it("rejects formats by content even when the declared type is an image", async () => {
    const c = codec(10, 10);
    await expect(prepareCoverImage(file(new Uint8Array(text("GIF89a......")), "image/png", "x.png"), c)).rejects.toThrow("Formato não suportado");
    await expect(prepareCoverImage(file(new Uint8Array(text("<svg xmlns='http://www.w3.org/2000/svg'/>")), "image/jpeg"), c)).rejects.toThrow("Formato não suportado");
    expect(c.decode).not.toHaveBeenCalled();
  });
  it("rejects images that cannot be decoded with a safe message", async () => {
    const c = codec(10, 10);
    c.decode.mockRejectedValueOnce(new DOMException("The source image cannot be decoded.", "InvalidStateError"));
    const error = await prepareCoverImage(file(jpeg(1000, 800)), c).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CoverImageError);
    expect((error as Error).message).toBe("Não foi possível abrir esta imagem. O arquivo pode estar corrompido.");
    await expect(prepareCoverImage(file(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 0, 0, 0, 0, 0, 0])), c)).rejects.toThrow("corrompido");
  });
  it("refuses oversized pixel dimensions from the header without decoding", async () => {
    const c = codec(20000, 20000);
    await expect(prepareCoverImage(file(png(20000, 20000), "image/png"), c)).rejects.toThrow("40 megapixels");
    await expect(prepareCoverImage(file(jpeg(16385, 100)), c)).rejects.toThrow("40 megapixels");
    expect(c.decode).not.toHaveBeenCalled();
  });
  it("scales large images so the longest side is at most 2560 px", async () => {
    const c = codec(6000, 4000);
    const out = await prepareCoverImage(file(jpeg(6000, 4000)), c);
    expect(out).toMatchObject({ width: 2560, height: 1707 });
    const portrait = codec(3000, 8000);
    expect(await prepareCoverImage(file(jpeg(3000, 8000)), portrait)).toMatchObject({ width: 960, height: 2560 });
    const small = codec(800, 600);
    expect(await prepareCoverImage(file(jpeg(800, 600)), small)).toMatchObject({ width: 800, height: 600 });
  });
  it("lowers quality, then resolution, to reach the 512 KiB target", async () => {
    const c = codec(2560, 1440, (w, _h, q) => (w === 2560 ? 900_000 : q <= 0.72 ? COVER_TARGET_BYTES : 600_000));
    const out = await prepareCoverImage(file(jpeg(2560, 1440)), c);
    expect(out.blob.size).toBeLessThanOrEqual(COVER_TARGET_BYTES);
    expect(out.width).toBe(2048);
    expect(c.encode.mock.calls.map((call) => call[3])).toEqual([0.86, 0.8, 0.72, 0.64, 0.86, 0.8, 0.72]);
  });
  it("falls back to the smallest result within the 1 MiB hard limit", async () => {
    const c = codec(2000, 2000, (w, _h, q) => 600_000 + w * 10 + Math.round(q * 1000));
    const out = await prepareCoverImage(file(jpeg(2000, 2000)), c);
    expect(out.blob.size).toBeLessThanOrEqual(COVER_HARD_MAX_BYTES);
    // Smallest candidate: 1280 px (0.64 scale) at quality 0.64.
    expect(out).toMatchObject({ width: 1280, height: 1280 });
    expect(out.blob.size).toBe(600_000 + 12_800 + 640);
  });
  it("never returns an output above 1 MiB", async () => {
    const c = codec(2560, 2560, () => COVER_HARD_MAX_BYTES + 1);
    await expect(prepareCoverImage(file(jpeg(2560, 2560)), c)).rejects.toThrow("até 1 MB");
    expect(c.close).toHaveBeenCalled();
  });
  it("fails safely when the browser does not produce a JPEG", async () => {
    const c = codec(100, 100);
    c.encode.mockResolvedValueOnce(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }));
    await expect(prepareCoverImage(file(jpeg(100, 100)), c)).rejects.toThrow("JPEG");
    c.encode.mockRejectedValueOnce(new Error("canvas exhausted"));
    await expect(prepareCoverImage(file(jpeg(100, 100)), c)).rejects.toThrow("neste navegador");
    expect(c.close).toHaveBeenCalledTimes(2);
  });
});
