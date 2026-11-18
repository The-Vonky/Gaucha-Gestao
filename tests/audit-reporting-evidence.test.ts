import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkEvidence, imageSize, prepareEvidence, reportImage, sourceSize } from "../apps/web/src/modules/audit/reporting/evidence";
import { report, evidenceRows } from "./fixtures/audit-report";
const mocks = vi.hoisted(() => ({ listEvidence: vi.fn(), downloadUrl: vi.fn(), epoch: 1 }));
vi.mock("../apps/web/src/modules/audit/evidence", () => ({ ...mocks, BUCKET: "audit-checklist-evidence" }));
vi.mock("../apps/web/src/shared/privateImageCache", () => ({ PRIVATE_IMAGE_TTL: 60000, privateImages: { getAccessVersion: () => mocks.epoch } }));
const jpeg = new Uint8Array([255,216,255,192,0,8,8,0,100,0,200,0,255,217]);
const bitmapClose = vi.fn();
let outputBytes = 1024;
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(jpeg, { headers: { "content-type": "image/jpeg" } })));
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 200, height: 100, close: bitmapClose }));
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0,
    getContext: () => ({ fillRect() {}, drawImage() {}, fillStyle: "" }),
    toBlob: (done: (b: Blob) => void) => done(new Blob([new Uint8Array(outputBytes)], { type: "image/jpeg" })),
  }) });
  outputBytes = 1024; mocks.epoch = 1;
  mocks.downloadUrl.mockResolvedValue("https://private.example.test/image");
  mocks.listEvidence.mockResolvedValue([]);
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
const rows = (count: number) => evidenceRows(count).map(row => ({ ...row, size_bytes: jpeg.length }));
describe("Imagens privadas nos relatórios", () => {
  it.each([0, 1, 5, 100])("prepara %s evidências sem omitir critérios nem metadados", async count => {
    mocks.listEvidence.mockResolvedValue(rows(count));
    const progress = vi.fn();
    const result = await prepareEvidence(report, new AbortController().signal, progress);
    expect(result).toHaveLength(count); expect(progress).toHaveBeenCalledTimes(count);
    expect(result.filter(e => e.image)).toHaveLength(count);
    expect(fetch).toHaveBeenCalledTimes(count);
    for (const row of result) {
      expect(row.question).toContain("está adequada"); expect(row.uploadedBy).toBe("Pessoa sintética");
      expect(row.image?.blob.size).toBe(1024);
    }
    if (count) expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cache: "no-store", credentials: "omit", redirect: "error", signal: expect.any(AbortSignal) }));
    expect(bitmapClose).toHaveBeenCalledTimes(count);
  });
  it("inclui documentos como metadados sem baixar/renderizar", async () => {
    mocks.listEvidence.mockResolvedValue([{ ...rows(1)[0], content_type: "application/pdf", original_name: "ata.pdf" }]);
    const [result] = await prepareEvidence(report, new AbortController().signal, () => {});
    expect(result.name).toBe("Evidência 1.pdf"); expect(result.image).toBeUndefined(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404, 500])("falha integralmente ao receber HTTP %s", async status => {
    mocks.listEvidence.mockResolvedValue(rows(5));
    vi.mocked(fetch).mockResolvedValue(new Response("", { status }));
    await expect(prepareEvidence(report, new AbortController().signal, () => {})).rejects.toThrow(/Critério 1, Evidência 1.jpg:.*Nenhum arquivo/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("não vaza mensagens de assinatura com URL/token", async () => {
    mocks.listEvidence.mockResolvedValue(rows(1));
    mocks.downloadUrl.mockRejectedValueOnce(new Error("https://private.invalid/?token=segredo"));
    await expect(prepareEvidence(report, new AbortController().signal, () => {})).rejects.toThrow(/Verifique o acesso/);
  });
  it("recusa bytes truncados, MIME inesperado e download interrompido", async () => {
    const row = rows(1)[0];
    vi.mocked(fetch).mockResolvedValueOnce(new Response(jpeg.slice(0, 5), { headers: { "content-type": "image/jpeg" } }));
    await expect(reportImage(row, 1, new AbortController().signal)).rejects.toThrow();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(jpeg, { headers: { "content-type": "text/html" } }));
    await expect(reportImage(row, 1, new AbortController().signal)).rejects.toThrow();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new ReadableStream({ start(c) { c.error(new Error("interrompido")); } }), { headers: { "content-type": "image/jpeg" } }));
    await expect(reportImage(row, 1, new AbortController().signal)).rejects.toThrow();
    expect(createImageBitmap).not.toHaveBeenCalled();
  });
  it("cancela antes do download e descarta uma mudança de sessão", async () => {
    mocks.listEvidence.mockResolvedValue(rows(1));
    const c = new AbortController(); c.abort();
    await expect(prepareEvidence(report, c.signal, () => {})).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(fetch).mockImplementationOnce(async () => { mocks.epoch++; return new Response(jpeg, { headers: { "content-type": "image/jpeg" } }); });
    await expect(prepareEvidence(report, new AbortController().signal, () => {})).rejects.toThrow(/Nenhum arquivo/);
    expect(bitmapClose).toHaveBeenCalled();
  });
  it("recusa órfãos, excesso de anexos, imagem >1 MB e conjunto >24 MB", async () => {
    const c = new AbortController();
    mocks.listEvidence.mockResolvedValue([{ ...rows(1)[0], item_key: "inexistente" }]);
    await expect(prepareEvidence(report, c.signal, () => {})).rejects.toThrow(/sem critério/);
    mocks.listEvidence.mockResolvedValue(rows(101));
    await expect(prepareEvidence(report, c.signal, () => {})).rejects.toThrow(/100 evidências/);
    mocks.listEvidence.mockResolvedValue(rows(1)); outputBytes = 1024 * 1024 + 1;
    await expect(prepareEvidence(report, c.signal, () => {})).rejects.toThrow(/acima de 1 MB/);
    mocks.listEvidence.mockResolvedValue(rows(25)); outputBytes = 1024 * 1024;
    await expect(prepareEvidence(report, c.signal, () => {})).rejects.toThrow(/24 MB/);
  });
  it("recusa um anexo alterado depois da preparação", async () => {
    mocks.listEvidence.mockResolvedValue(rows(1));
    const prepared = await prepareEvidence(report, new AbortController().signal, () => {});
    await expect(checkEvidence(report, prepared)).resolves.toBeUndefined();
    mocks.listEvidence.mockResolvedValue([]);
    await expect(checkEvidence(report, prepared)).rejects.toThrow(/evidências mudaram/);
  });
  it("limita dimensões JPEG/PNG antes de decodificar e mantém proporção", async () => {
    await expect(sourceSize(new Blob([jpeg], { type: "image/jpeg" }))).resolves.toEqual({ width: 200, height: 100 });
    const png = new Uint8Array(24); const view = new DataView(png.buffer);
    view.setUint32(0, 0x89504e47); view.setUint32(4, 0x0d0a1a0a); view.setUint32(12, 0x49484452);
    view.setUint32(16, 10000); view.setUint32(20, 10000);
    await expect(sourceSize(new Blob([png], { type: "image/png" }))).rejects.toThrow(/40 megapixels/);
    const size = imageSize(4000, 3000, 100);
    expect(size.width / size.height).toBeCloseTo(4 / 3, 2); expect(size.width * size.height * 100).toBeLessThan(48_100_000);
  });
});
