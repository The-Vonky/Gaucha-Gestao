// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
const http = vi.hoisted(() => vi.fn());
vi.mock("../apps/web/src/core/client", () => ({
  client: createClient("http://127.0.0.1:54321", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: http },
  }),
}));
import {
  beginUpload,
  checkFile,
  downloadUrl,
  EvidenceFileError,
  evidenceMessage,
  finishUpload,
  normalizeName,
  retryable,
} from "../apps/web/src/modules/action-plans/evidence";
import type { Evidence } from "../apps/web/src/modules/action-plans/types";
afterEach(() => http.mockReset());
const bytes = (...b: number[]) => new Uint8Array(b);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04);
const file = (content: BlobPart[], name: string, type = "") =>
  new File(content, name, { type });
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const rtlOverride = String.fromCodePoint(0x202e);
describe("evidence file names", () => {
  it("proposes a safe name without path, control, bidi or reserved characters", () => {
    expect(normalizeName("C:\\fotos\\antes.jpg")).toBe("antes.jpg");
    expect(normalizeName("../../etc/laudo.pdf")).toBe("laudo.pdf");
    expect(normalizeName('rel:"a"<b>|c?.pdf')).toBe("rel__a__b__c_.pdf");
    expect(normalizeName(`fdp${rtlOverride}fdp.pdf`)).toBe("fdpfdp.pdf");
    expect(normalizeName("linha\r\n.pdf")).toBe("linha.pdf");
    expect(normalizeName("..oculto.pdf. ")).toBe("oculto.pdf");
    expect(normalizeName("e\u0301.pdf")).toBe("é.pdf".normalize("NFC"));
    const long = normalizeName(`${"á".repeat(300)}.pdf`);
    expect(Array.from(long)).toHaveLength(180);
    expect(long.endsWith(".pdf")).toBe(true);
  });
});
describe("evidence file checks", () => {
  it("accepts the allowlist by extension and magic bytes, with the canonical type", async () => {
    expect(await checkFile(file([JPEG], "foto.JPG"))).toEqual({
      name: "foto.JPG",
      type: "image/jpeg",
    });
    expect((await checkFile(file([JPEG], "foto.jpeg"))).type).toBe(
      "image/jpeg",
    );
    expect((await checkFile(file([PNG], "tela.png"))).type).toBe("image/png");
    expect(
      (await checkFile(file(["\n\n%PDF-1.7"], "Relatório ação.pdf"))).type,
    ).toBe("application/pdf");
    // Browser-reported types are ignored (Windows often reports "" for Office files).
    expect((await checkFile(file([ZIP], "planilha.xlsx"))).type).toBe(XLSX);
    expect(
      (await checkFile(file([ZIP], "texto.docx", "text/plain"))).type,
    ).toBe(DOCX);
  });
  it("rejects other formats, spoofed content, empty/oversized files and bad names", async () => {
    for (const name of [
      "planilha.xls",
      "texto.doc",
      "macro.xlsm",
      "macro.docm",
      "foto.heic",
      "logo.svg",
      "pagina.html",
      "setup.exe",
      "script.js",
      "pacote.zip",
      "sem-extensao",
    ])
      await expect(checkFile(file([ZIP], name))).rejects.toThrow(
        /Formato não permitido/,
      );
    await expect(
      checkFile(file(["<html><script>"], "foto.png")),
    ).rejects.toThrow(/não corresponde ao formato .png/);
    await expect(checkFile(file([ZIP], "laudo.pdf"))).rejects.toThrow(
      /não corresponde/,
    );
    await expect(checkFile(file([PNG], "foto.jpg"))).rejects.toThrow(
      /não corresponde/,
    );
    await expect(checkFile(file([], "vazio.pdf"))).rejects.toThrow(/vazio/);
    await expect(
      checkFile(file([new Uint8Array(10 * 1024 * 1024 + 1)], "grande.pdf")),
    ).rejects.toThrow(/10 MB/);
    await expect(checkFile(file(["%PDF-"], ".pdf"))).rejects.toThrow(
      EvidenceFileError,
    );
  });
});
function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
describe("evidence Storage contract", () => {
  it("begins with the normalized name and canonical type, uploads write-once and confirms", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    http.mockImplementation(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("begin_evidence_upload"))
        return respond([{ evidence_id: "e1", object_key: "p1/e1" }]);
      if (url.includes("/storage/v1/object/"))
        return respond({ Key: "action-plan-evidence/p1/e1", Id: "o1" });
      return new Response(null, { status: 204 });
    });
    const attempt = await beginUpload(
      "p1",
      "execution",
      file([ZIP], "C:\\docs\\Relatório:final.xlsx", ""),
    );
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      p_plan: "p1",
      p_kind: "execution",
      p_original_name: "Relatório_final.xlsx",
      p_content_type: XLSX,
      p_size: 4,
    });
    await finishUpload(attempt);
    const upload = calls[1];
    expect(upload.url).toBe(
      "http://127.0.0.1:54321/storage/v1/object/action-plan-evidence/p1/e1",
    );
    expect(new Headers(upload.init.headers).get("x-upsert")).toBe("false");
    const form = upload.init.body as FormData;
    expect(form.get("cacheControl")).toBe("0");
    expect((form.get("") as Blob).type).toBe(XLSX);
    expect(calls[2].url).toContain("/rpc/confirm_evidence_upload");
    expect(JSON.parse(String(calls[2].init.body))).toEqual({
      p_evidence: "e1",
    });
  });
  it("confirms when the object already exists from a lost response, and stops on other Storage errors", async () => {
    const attempt = { evidenceId: "e1", key: "p1/e1", body: new Blob(["x"]) };
    http.mockImplementation(async (url: string) =>
      url.includes("/storage/")
        ? respond(
            {
              statusCode: "409",
              error: "Duplicate",
              message: "The resource already exists",
            },
            400,
          )
        : new Response(null, { status: 204 }),
    );
    await finishUpload(attempt);
    expect(http.mock.calls.at(-1)?.[0]).toContain("confirm_evidence_upload");
    http.mockReset();
    http.mockImplementation(async () =>
      respond(
        {
          statusCode: "413",
          error: "Payload too large",
          message: "The object exceeded the maximum allowed size",
        },
        400,
      ),
    );
    const error = await finishUpload(attempt).catch((e: unknown) => e);
    expect(evidenceMessage(error)).toMatch(/10 MB/);
    expect(retryable(error)).toBe(false);
    expect(http).toHaveBeenCalledTimes(1);
  });
  it("keeps real supabase-js network failures of upload and confirm retryable", async () => {
    const attempt = { evidenceId: "e1", key: "p1/e1", body: new Blob(["x"]) };
    // Storage request never reaches the server.
    http.mockRejectedValue(new TypeError("Failed to fetch"));
    const upload = await finishUpload(attempt).catch((e: unknown) => e);
    expect(retryable(upload)).toBe(true);
    expect(evidenceMessage(upload)).toMatch(/Verifique sua conexão/);
    // Object stored, but the confirm request (or its response) is lost.
    http.mockReset();
    http.mockImplementation(async (url: string) => {
      if (url.includes("/storage/"))
        return respond({ Key: "action-plan-evidence/p1/e1", Id: "o1" });
      throw new TypeError("Failed to fetch");
    });
    const confirm = await finishUpload(attempt).catch((e: unknown) => e);
    expect(retryable(confirm)).toBe(true);
    expect(evidenceMessage(confirm)).toMatch(/Verifique sua conexão/);
  });
  it("signs for 60 seconds and sets the download name with single encoding", async () => {
    http.mockImplementation(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toEqual({ expiresIn: 60 });
      return respond({
        signedURL: "/object/sign/action-plan-evidence/p1/e1?token=t",
      });
    });
    const url = new URL(
      await downloadUrl({
        object_key: "p1/e1",
        original_name: "Relatório ação.pdf",
      } as Evidence),
    );
    expect(http.mock.calls[0][0]).toBe(
      "http://127.0.0.1:54321/storage/v1/object/sign/action-plan-evidence/p1/e1",
    );
    expect(url.searchParams.get("download")).toBe("Relatório ação.pdf");
    expect(url.searchParams.get("token")).toBe("t");
    expect(url.href).not.toContain("%25");
  });
});
describe("evidence messages", () => {
  it("maps server/Storage rejections and keeps only network failures retryable", () => {
    const cases: [unknown, RegExp][] = [
      [{ code: "23514", message: "Evidence limit reached" }, /Limite de 20/],
      [{ code: "23514", message: "Evidence type not allowed" }, /Formato/],
      [
        { code: "23514", message: "Evidence extension does not match type" },
        /Formato/,
      ],
      [{ code: "23514", message: "Evidence name not allowed" }, /Nome/],
      [{ code: "55000", message: "Upload expired" }, /expirou/],
      [
        { code: "23514", message: "Uploaded object does not match" },
        /não confere/,
      ],
      [
        { code: "55000", message: "Verified plan is locked" },
        /já foi verificada/,
      ],
      [
        { code: "55000", message: "Verification round is closed" },
        /já foi registrada/,
      ],
      [
        {
          code: "23514",
          message: "Only completed plans accept verification evidence",
        },
        /planos concluídos/,
      ],
      [
        { statusCode: "415", message: "mime type text/html is not supported" },
        /Formato/,
      ],
      [{ code: "42501", message: "Forbidden" }, /permissão/],
    ];
    for (const [error, text] of cases) {
      expect(evidenceMessage(error)).toMatch(text);
      expect(retryable(error)).toBe(false);
    }
    expect(retryable(new TypeError("Failed to fetch"))).toBe(true);
    expect(retryable(new EvidenceFileError("x"))).toBe(false);
  });
});
