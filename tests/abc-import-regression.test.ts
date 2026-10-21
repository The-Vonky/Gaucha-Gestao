// @vitest-environment jsdom
import { createHash, randomBytes } from "node:crypto";
import { strToU8, unzipSync, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256Portable } from "../apps/web/src/modules/abc/import/sha256";
import { sha256Hex } from "../apps/web/src/modules/abc/import/contentHash";
import { buildPayload, clientWarnings, parseReport, type Issue } from "../apps/web/src/modules/abc/import/parser";
import { sum } from "../apps/web/src/modules/abc/import/decimal";
import { makeXlsx, reportRows } from "./abc-fixture";
import { erpWorkbook, syntheticProducts, withExcelTheme } from "./abc-erp-workbook.mjs";

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const nodeSha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe("Curva ABC import P0 regressions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("computes SHA-256 without Web Crypto, matching FIPS vectors and Node at block boundaries", () => {
    expect(hex(sha256Portable(new Uint8Array()))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(hex(sha256Portable(new TextEncoder().encode("abc")))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    for (const size of [1, 55, 56, 63, 64, 65, 119, 120, 1000, 1 << 20]) {
      const data = new Uint8Array(randomBytes(size));
      expect(hex(sha256Portable(data)), `size ${size}`).toBe(nodeSha(data));
    }
  });

  it("parses and hashes in a non-secure context (plain-HTTP LAN), where crypto.subtle is undefined", async () => {
    const data = makeXlsx(reportRows());
    const secure = await parseReport(data, { expectedBranchCode: "0001", today: "2026-10-21" });
    // Reproduces the shared DEV at http://<LAN IP>:5173: before the fix this threw a TypeError.
    vi.stubGlobal("crypto", {});
    const insecure = await parseReport(data, { expectedBranchCode: "0001", today: "2026-10-21" });
    expect(insecure.sourceSha256).toBe(nodeSha(data));
    expect(insecure.sourceSha256).toBe(secure.sourceSha256);
    expect((await buildPayload(insecure)).content_hash).toBe((await buildPayload(secure)).content_hash);
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("reads an ERP-shaped workbook (shared strings, styles, merges, docProps) with exact values", async () => {
    const products = syntheticProducts(234);
    const { bytes, grand, start, end } = erpWorkbook({ products });
    const preview = await parseReport(bytes, { expectedBranchCode: "0001", today: "2026-10-21", filename: "curva_01-08_ate_31-08.xlsx" });
    expect(preview.issues.filter((i) => i.severity === "BLOCKER")).toEqual([]);
    expect(preview.lines).toHaveLength(234);
    // 5 metadata/header rows + 3 group markers + 3 subtotals + Total Geral (= 246, as in the origin's check).
    expect(preview.rows).toHaveLength(246);
    expect(preview.metadata).toMatchObject({ branchCode: "0001", start, end, costBasis: "NET_PERIOD" });
    expect(preview.declaredTotal).toBe(grand);
    expect(preview.calculatedTotal).toBe(sum(products.map((p) => p.total)));
    for (const [i, p] of products.entries())
      expect(preview.lines[i], p.code).toMatchObject({ code: p.code, description: p.name, quantity: p.quantity, unitCost: p.unitCost, total: p.total, sourceClass: p.cls });
    expect(preview.lines[0].code.startsWith("0")).toBe(true);
    const payload = await buildPayload(preview);
    expect(payload.lines.map((l) => l.code)).toEqual(products.map((p) => p.code));
  });

  it("reads a canonical inert Excel theme without changing any business values", async () => {
    const { bytes } = erpWorkbook();
    const context = { expectedBranchCode: "0001", today: "2026-10-21" };
    const original = await parseReport(bytes, context);
    const withTheme = await parseReport(withExcelTheme(bytes), context);
    expect(original.blocked).toBe(false);
    expect(withTheme.blocked).toBe(false);
    expect(withTheme.metadata).toEqual(original.metadata);
    expect(withTheme.lines).toEqual(original.lines);
    expect(withTheme.declaredTotal).toBe(original.declaredTotal);
    expect(withTheme.calculatedTotal).toBe(original.calculatedTotal);
    expect(withTheme.sourceSha256).not.toBe(original.sourceSha256);
    expect((await buildPayload(withTheme)).content_hash).toBe((await buildPayload(original)).content_hash);
    expect(withTheme.parserVersion).toBe("erp-curva-realizado-v2");
  });

  it.each([
    "xl/media/image1.png",
    "xl/vbaProject.bin",
    "xl/calcChain.xml",
    "xl/externalLinks/externalLink1.xml",
    "docProps/custom.xml",
    "xl/theme/theme2.xml",
  ])("continues to reject unexpected XLSX part %s", async (name) => {
    const parts = unzipSync(withExcelTheme(erpWorkbook().bytes));
    parts[name] = strToU8("unexpected");
    const preview = await parseReport(zipSync(parts), { expectedBranchCode: "0001", today: "2026-10-21" });
    expect(preview.blocked).toBe(true);
    expect(preview.issues[0]).toMatchObject({ code: "XLSX_INVALID", severity: "BLOCKER" });
    expect(preview.issues[0].message).toContain("unsupported_part");
  });

  it("rejects a theme without a matching canonical workbook relationship", async () => {
    const parts = unzipSync(withExcelTheme(erpWorkbook().bytes));
    const rels = "xl/_rels/workbook.xml.rels";
    parts[rels] = strToU8(new TextDecoder().decode(parts[rels]).replace(
      'Target="theme/theme1.xml"', 'Target="theme/theme2.xml"',
    ));
    const preview = await parseReport(zipSync(parts), { expectedBranchCode: "0001", today: "2026-10-21" });
    expect(preview.blocked).toBe(true);
    expect(preview.issues[0].message).toContain("missing_part");
  });

  it("rejects external theme relationships", async () => {
    const parts = unzipSync(withExcelTheme(erpWorkbook().bytes));
    const rels = "xl/_rels/workbook.xml.rels";
    parts[rels] = strToU8(new TextDecoder().decode(parts[rels]).replace(
      'Target="theme/theme1.xml"', 'Target="theme/theme1.xml" TargetMode="External"',
    ));
    const preview = await parseReport(zipSync(parts), { expectedBranchCode: "0001", today: "2026-10-21" });
    expect(preview.blocked).toBe(true);
    expect(preview.issues[0].message).toContain("external_relationship");
  });

  it("blocks texts the database would reject, with the cell location", async () => {
    const preview = await parseReport(makeXlsx(reportRows({ B7: "Produto\nquebrado", A7: "1".repeat(61), D7: "PC" })), { expectedBranchCode: "0001", today: "2026-10-21" });
    const cells = preview.issues.filter((i) => i.code === "INVALID_TEXT").map((i) => i.cell);
    expect(cells).toEqual(["A7", "B7"]);
    expect(preview.blocked).toBe(true);
  });

  it("keeps client warnings within the database contract (≤ 50, ≤ 200 chars) without losing rows", () => {
    const issues: Issue[] = Array.from({ length: 180 }, (_, i) => ({
      code: "NO_ANALYTIC_PRICE", severity: "WARNING", message: "Linha sem preço analítico.", row: 100 + i, cell: `F${100 + i}`,
    }));
    issues.push({ code: "FILENAME_PERIOD_MISMATCH", severity: "WARNING", message: "Nome do arquivo diverge do período interno.", row: null, cell: null });
    issues.push({ code: "SHARE_MISMATCH", severity: "WARNING", message: "Derivado pelo banco.", row: 9, cell: null });
    const warnings = clientWarnings(issues);
    expect(warnings).toHaveLength(2);
    expect(warnings.every((w) => w.length <= 200)).toBe(true);
    expect(warnings[0]).toMatch(/^Linha sem preço analítico\. \(linhas 100, 101, .* e mais \d+\)$/);
    const shown = warnings[0].match(/\d+(?=,|\s+e mais)/g)!.length;
    expect(shown + Number(warnings[0].match(/e mais (\d+)/)![1])).toBe(180);
    expect(warnings[1]).toBe("Nome do arquivo diverge do período interno.");
  });

  it("publishes a report with many zero/zero lines under the warning limit", async () => {
    const products = [
      ...syntheticProducts(5),
      ...Array.from({ length: 80 }, (_, i) => ({ code: `9.${i}`, name: `Sem movimento ${i}`, unit: "KG", quantity: "0", unitCost: "0", total: "0", cls: "C" })),
    ];
    const preview = await parseReport(erpWorkbook({ products }).bytes, { expectedBranchCode: "0001", today: "2026-10-21" });
    expect(preview.blocked).toBe(false);
    expect(preview.issues.filter((i) => i.code === "NO_ANALYTIC_PRICE")).toHaveLength(80);
    const payload = await buildPayload(preview);
    expect(payload.warnings.length).toBeLessThanOrEqual(50);
    expect(payload.warnings.every((w) => w.length <= 200)).toBe(true);
  });
});
