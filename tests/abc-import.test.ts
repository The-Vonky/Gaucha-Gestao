// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { DEFAULT_LIMITS, readXlsx, XlsxError, type XlsxLimits } from "../apps/web/src/modules/abc/import/xlsx";
import { buildPayload, parseReport, type ParseContext } from "../apps/web/src/modules/abc/import/parser";
import { NumberError, parseDecimal, parseShare } from "../apps/web/src/modules/abc/import/numbers";
import { add, canonical, cmp, differsBy, mul, sub } from "../apps/web/src/modules/abc/import/decimal";
import { canonicalContent } from "../apps/web/src/modules/abc/import/contentHash";
import { makeXlsx, reportRows, zipParts, type Rows } from "./abc-fixture";

function code(data: Uint8Array, limits: Partial<XlsxLimits> = {}) {
  try {
    readXlsx(data, { ...DEFAULT_LIMITS, ...limits });
  } catch (e) {
    if (e instanceof XlsxError) return e.code;
    throw e;
  }
  return "ok";
}
const part = (data: Uint8Array, name: string) => strFromU8(unzipSync(data)[name]);
function mutate(data: Uint8Array, opts: { replace?: Record<string, string | Uint8Array>; remove?: string[]; add?: Record<string, string | Uint8Array> }) {
  const parts: Record<string, string | Uint8Array> = {};
  for (const [k, v] of Object.entries(unzipSync(data))) if (!opts.remove?.includes(k)) parts[k] = v;
  return zipParts({ ...parts, ...opts.replace, ...opts.add });
}
function offsets(data: Uint8Array, name: string) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let eocd = data.length - 22;
  while (view.getUint32(eocd, true) !== 0x06054b50) eocd--;
  let central = view.getUint32(eocd + 16, true);
  for (;;) {
    const nameLength = view.getUint16(central + 28, true);
    const entry = strFromU8(data.subarray(central + 46, central + 46 + nameLength));
    if (entry === name) break;
    central += 46 + nameLength + view.getUint16(central + 30, true) + view.getUint16(central + 32, true);
  }
  const local = view.getUint32(central + 42, true);
  const payload = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  return { view, local, central, payload, size: view.getUint32(central + 20, true) };
}
function patch(data: Uint8Array, name: string, p: { method?: number; flags?: number; crc?: number; usize?: number }) {
  const copy = data.slice();
  const { view, local, central } = offsets(copy, name);
  if (p.method !== undefined) { view.setUint16(local + 8, p.method, true); view.setUint16(central + 10, p.method, true); }
  if (p.flags !== undefined) { view.setUint16(local + 6, p.flags, true); view.setUint16(central + 8, p.flags, true); }
  if (p.crc !== undefined) { view.setUint32(local + 14, p.crc, true); view.setUint32(central + 16, p.crc, true); }
  if (p.usize !== undefined) { view.setUint32(local + 22, p.usize, true); view.setUint32(central + 24, p.usize, true); }
  return copy;
}

describe("Curva ABC XLSX reader", () => {
  it("preserves the numeric lexeme and provenance", () => {
    const cell = readXlsx(makeXlsx({ 1: { A: ["n", "0.1234567890123456789"] } })).sheets[0].rows[0].cells[0];
    expect(cell).toEqual({ reference: "A1", kind: "n", raw: "0.1234567890123456789", value: "0.1234567890123456789", numberFormat: "0" });
  });

  it("concatenates shared rich text and ignores phonetic runs", () => {
    const data = makeXlsx({ 1: { A1: "inline" } });
    const shared = '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><r><t>sha</t></r><rPh><t>ignore</t></rPh><r><t>red</t></r></si></sst>';
    const rels = part(data, "xl/_rels/workbook.xml.rels").replace("</Relationships>",
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>');
    const types = part(data, "[Content_Types].xml").replace("</Types>",
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>');
    const sheet = part(data, "xl/worksheets/sheet1.xml").replace('t="inlineStr"><is><t>inline</t></is>', 't="s"><v>0</v>');
    const book = readXlsx(mutate(data, { replace: { "[Content_Types].xml": types, "xl/_rels/workbook.xml.rels": rels, "xl/worksheets/sheet1.xml": sheet }, add: { "xl/sharedStrings.xml": shared } }));
    expect(book.sheets[0].rows[0].cells[0].value).toBe("shared");
  });

  it("rejects malformed packages, unlisted parts, DTD and deep XML", () => {
    expect(code(strToU8("not a zip"))).toBe("invalid_zip");
    expect(code(mutate(makeXlsx({}), { add: { "custom.xml": "<x/>" } }))).toBe("unsupported_part");
    const evil = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY x "boom">]><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>&x;</sheetData></worksheet>';
    expect(code(mutate(makeXlsx({}), { replace: { "xl/worksheets/sheet1.xml": evil } }))).toBe("xml_doctype");
    const deep = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + "<x>".repeat(64) + "</x>".repeat(64) + "</worksheet>";
    expect(code(mutate(makeXlsx({}), { replace: { "xl/worksheets/sheet1.xml": deep } }))).toBe("xml_depth");
  });

  it("rejects non-UTF-8 XML, including UTF-16 documents carrying a DTD", () => {
    const utf16 = '﻿<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE worksheet><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>';
    const bytes = new Uint8Array(utf16.length * 2);
    for (let i = 0; i < utf16.length; i++) { bytes[i * 2] = utf16.charCodeAt(i) & 0xff; bytes[i * 2 + 1] = utf16.charCodeAt(i) >> 8; }
    expect(code(mutate(makeXlsx({}), { replace: { "xl/worksheets/sheet1.xml": bytes } }))).toBe("invalid_xml");
  });

  it("enforces configured limits", () => {
    const data = makeXlsx({ 1: { A1: "abcd", B1: "y" } });
    expect(code(data, { maxFileBytes: data.length - 1 })).toBe("file_too_large");
    expect(code(makeXlsx({ 1: {}, 2: {} }), { maxRows: 1 })).toBe("too_many_rows");
    expect(code(data, { maxTextChars: 3 })).toBe("text_too_long");
    expect(code(data, { maxMembers: 4 })).toBe("too_many_members");
    expect(code(data, { maxCells: 1 })).toBe("too_many_cells");
    const sizes = Object.values(unzipSync(data)).map((p) => p.length);
    expect(code(data, { maxUncompressedBytes: sizes.reduce((a, b) => a + b) - 1 })).toBe("package_too_large");
    expect(code(data, { maxPartBytes: Math.max(...sizes) - 1 })).toBe("part_too_large");
    expect(code(data, { maxRatio: 1 })).toBe("compression_ratio");
  });

  it("rejects missing, external, duplicate, traversing and non-OOXML relationships", () => {
    const data = makeXlsx({});
    const rel = part(data, "xl/_rels/workbook.xml.rels");
    expect(code(mutate(data, { remove: ["xl/worksheets/sheet1.xml"] }))).toBe("missing_part");
    expect(code(mutate(data, { replace: { "xl/_rels/workbook.xml.rels": rel.replace('Target="worksheets', 'TargetMode="External" Target="worksheets') } }))).toBe("external_relationship");
    const dup = '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>';
    expect(code(mutate(data, { replace: { "xl/_rels/workbook.xml.rels": rel.replace("</Relationships>", dup + "</Relationships>") } }))).toBe("duplicate_relationship");
    expect(code(mutate(data, { replace: { "xl/_rels/workbook.xml.rels": rel.replace("worksheets/sheet1.xml", "../../sheet1.xml") } }))).toBe("invalid_relationship_target");
    const root = part(data, "_rels/.rels").replace("http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument", "https://invalid.example/officeDocument");
    expect(code(mutate(data, { replace: { "_rels/.rels": root } }))).toBe("invalid_relationship");
    expect(code(mutate(data, { replace: { "xl/_rels/workbook.xml.rels": rel.replace("http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet", "https://invalid.example/worksheet") } }))).toBe("invalid_relationship");
  });

  it("rejects formulas, unsupported types, shared indexes, coordinates and row order", () => {
    const data = makeXlsx({ 1: { A1: ["n", "1"] } });
    const sheet = part(data, "xl/worksheets/sheet1.xml");
    const withSheet = (s: string) => mutate(data, { replace: { "xl/worksheets/sheet1.xml": s } });
    expect(code(withSheet(sheet.replace("<v>1</v>", "<f>1+1</f><v>2</v>")))).toBe("formula");
    expect(code(withSheet(sheet.replace('t="n"', 't="b"')))).toBe("unsupported_cell_type");
    expect(code(withSheet(sheet.replace('t="n"', 't="s"')))).toBe("shared_string_index");
    const two = makeXlsx({ 1: { A1: "x" }, 2: { A2: "y" } });
    const s2 = part(two, "xl/worksheets/sheet1.xml");
    const withS2 = (s: string) => mutate(two, { replace: { "xl/worksheets/sheet1.xml": s } });
    expect(code(withS2(s2.replace('r="A1"', 'r="A2"')))).toBe("cell_row_mismatch");
    expect(code(withS2(s2.replace('r="A1"', 'r="XFE1"')))).toBe("invalid_cell_reference");
    expect(code(withS2(s2.replace('<row r="2"', '<row r="1"')))).toBe("row_order");
  });

  it("preserves explicit empty rows and sparse cells", () => {
    const book = readXlsx(makeXlsx({ 2: {}, 9: { XFD9: "edge" } }));
    expect(book.sheets[0].rows.map((r) => r.number)).toEqual([2, 9]);
    expect(book.sheets[0].rows[0].cells).toEqual([]);
  });

  it("rejects orphan or unused worksheets and wrong content types", () => {
    const data = makeXlsx({});
    const types2 = part(data, "[Content_Types].xml").replace("</Types>", '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
    expect(code(mutate(data, { replace: { "[Content_Types].xml": types2 }, add: { "xl/worksheets/sheet2.xml": part(data, "xl/worksheets/sheet1.xml") } }))).toBe("invalid_relationship");
    expect(code(mutate(data, { replace: { "[Content_Types].xml": part(data, "[Content_Types].xml").replace("spreadsheetml.worksheet+xml", "spreadsheetml.chartsheet+xml") } }))).toBe("invalid_content_type");
    const workbook = part(data, "xl/workbook.xml").replace("</sheets>", '<sheet name="Unused" sheetId="2" r:id="rId1"/></sheets>');
    const rels = part(data, "xl/_rels/workbook.xml.rels").replace("</Relationships>", '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>');
    expect(code(mutate(data, { replace: { "[Content_Types].xml": types2, "xl/workbook.xml": workbook, "xl/_rels/workbook.xml.rels": rels }, add: { "xl/worksheets/sheet2.xml": part(data, "xl/worksheets/sheet1.xml") } }))).toBe("invalid_relationship");
  });

  it("rejects duplicate and unsafe member names", () => {
    const parts = unzipSync(makeXlsx({}));
    // fflate refuses duplicate names: store a same-length name, then rename it in both headers.
    const dup = zipSync({ ...parts, "xl/workbook.xmX": parts["xl/workbook.xml"] }, { level: 0 });
    const text = strFromU8(dup, true);
    for (let at = text.indexOf("xl/workbook.xmX"); at >= 0; at = text.indexOf("xl/workbook.xmX", at + 1))
      dup[at + 14] = "l".charCodeAt(0);
    expect(code(dup)).toBe("duplicate_part");
    expect(code(zipParts({ "../bad.xml": "<x/>" }))).toBe("invalid_part_name");
    expect(code(zipParts({ "xl\\bad.xml": "<x/>" }))).toBe("invalid_part_name");
  });

  it("rejects unsupported compression, encryption, corrupt CRC, truncation, size and deflate", () => {
    const data = makeXlsx({ 1: { A: "payload" } });
    const name = "xl/worksheets/sheet1.xml";
    expect(code(patch(data, name, { method: 99 }))).toBe("unsupported_compression");
    expect(code(patch(data, name, { flags: 1 }))).toBe("encrypted_part");
    expect(code(patch(data, name, { crc: 0 }))).toBe("invalid_zip");
    expect(code(data.slice(0, -12))).toBe("invalid_zip");
    expect(code(patch(data, name, { usize: 1 }))).toBe("invalid_zip");
    const corrupt = data.slice();
    const o = offsets(corrupt, name);
    corrupt.fill(0xff, o.payload, o.payload + o.size);
    expect(code(corrupt)).toBe("invalid_zip");
  });
});

describe("Curva ABC numbers and decimals", () => {
  it("converts XML and pt-BR numbers exactly", () => {
    expect(parseDecimal("1.5E-2", true)).toBe("0.015");
    expect(parseDecimal("12E3", true)).toBe("12000");
    expect(parseDecimal("1.234,50", false)).toBe("1234.5");
    expect(parseDecimal("1.234", false)).toBe("1234");
    expect(parseDecimal("0.1234567890123456789", true)).toBe("0.1234567890123456789");
    expect(parseShare("12,345%", false)).toBe("0.12345");
    expect(() => parseShare("1", false)).toThrow(NumberError);
    expect(() => parseDecimal("-1", true)).toThrow("NUMBER_LIMIT");
    expect(() => parseDecimal("1e999999", true)).toThrow("NUMBER_LIMIT");
    expect(() => parseDecimal("1".repeat(41), true)).toThrow("NUMBER_LIMIT");
    expect(() => parseDecimal("1,2,3", false)).toThrow("INVALID_NUMBER");
  });

  it("does BigInt arithmetic on canonical strings", () => {
    expect(add("0.1", "0.2")).toBe("0.3");
    expect(sub("25", "25.06")).toBe("-0.06");
    expect(mul("2.5", "10")).toBe("25");
    expect(canonical("007.500")).toBe("7.5");
    expect(cmp("123456789012345678901.23", "123456789012345678901.22")).toBe(1);
    expect(differsBy("25", "25.05", "0.05")).toBe(true);
    expect(differsBy("25", "25.049", "0.05")).toBe(false);
  });
});

const ctx: ParseContext = { expectedBranchCode: "0001", today: "2026-09-18" };
const parse = (rows: Rows = reportRows(), over: Partial<ParseContext> = {}) => parseReport(makeXlsx(rows), { ...ctx, ...over });
const codes = async (p: ReturnType<typeof parse>) => new Set((await p).issues.map((i) => i.code));

describe("Curva ABC report parser", () => {
  it("parses a valid report and preserves evidence", async () => {
    const data = makeXlsx(reportRows());
    const preview = await parseReport(data, ctx);
    expect(preview.blocked).toBe(false);
    expect(preview.calculatedTotal).toBe("25");
    expect(preview.lines[0]).toMatchObject({ code: "001.02", unit: "PC", quantity: "2.5", sourceShare: "1", sourceClass: "A" });
    expect(preview.metadata).toMatchObject({ branchCode: "0001", start: "2026-08-01", end: "2026-08-31", costBasis: "NET_PERIOD", costBasisRaw: "Custo Médio Líquido da Época" });
    expect(preview.rows.slice(0, 5).map((r) => r.kind)).toEqual(["METADATA", "METADATA", "METADATA", "METADATA", "HEADER"]);
    expect(preview.rows).toHaveLength(9);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), (b) => b.toString(16).padStart(2, "0")).join("");
    expect(preview.sourceSha256).toBe(digest);
  });

  it("turns a bad file into a blocked preview", async () => {
    const preview = await parseReport(strToU8("not zip"), ctx);
    expect(preview.blocked).toBe(true);
    expect(preview.issues[0].code).toBe("XLSX_INVALID");
  });

  it("supports pt-BR numbers and percentages", async () => {
    const preview = await parse(reportRows({ E7: "2,5", F7: "10,00", G7: "25,00", H7: "100%", G8: "25,00", G9: "25,00" }));
    expect(preview.blocked).toBe(false);
    expect(preview.lines[0].quantity).toBe("2.5");
  });

  it("applies inclusive reconciliation thresholds", async () => {
    const preview = await parse(reportRows({ G7: ["n", "25.01"], G8: ["n", "25.06"], G9: ["n", "25.06"], H7: "12,345%" }));
    const found = new Set(preview.issues.map((i) => i.code));
    for (const c of ["LINE_VALUE_MISMATCH", "SUBTOTAL_MISMATCH", "TOTAL_MISMATCH"]) expect(found.has(c), c).toBe(true);
    expect(preview.lines[0].sourceShare).toBe("0.12345");
  });

  it("warns on percentage mismatch and blocks zero quantity with total", async () => {
    const mismatch = await parse(reportRows({ H7: ["n", "0.9"] }));
    expect(mismatch.issues.map((i) => i.code)).toContain("SHARE_MISMATCH");
    expect(mismatch.blocked).toBe(false);
    expect(await codes(parse(reportRows({ E7: ["n", "0"], F7: ["n", "10"], G7: ["n", "1"], G8: ["n", "1"], G9: ["n", "1"] })))).toContain("ZERO_QUANTITY_WITH_TOTAL");
  });

  it("points duplicate codes to both rows", async () => {
    const rows = reportRows();
    rows[8] = { ...rows[7] };
    rows[9] = { E: "Total da Curva A", G: ["n", "50"] };
    rows[10] = { E: "Total Geral", G: ["n", "50"] };
    const preview = await parse(rows);
    expect(new Set(preview.issues.filter((i) => i.code === "DUPLICATE_PRODUCT").map((i) => i.row))).toEqual(new Set([7, 8]));
  });

  it("requires textual non-empty product codes and preserves them verbatim", async () => {
    expect(await codes(parse(reportRows({ A7: ["n", "123"] })))).toContain("INVALID_PRODUCT_CODE");
    expect(await codes(parse(reportRows({ A7: "   " })))).toContain("INVALID_PRODUCT_CODE");
    const preserved = await parse(reportRows({ A7: " 001.02 " }));
    expect(preserved.blocked).toBe(false);
    expect(preserved.lines[0].code).toBe(" 001.02 ");
  });

  it("requires a % suffix on textual shares", async () => {
    const product = await parse(reportRows({ H7: "1" }));
    expect(product.issues.map((i) => i.code)).toContain("INVALID_NUMBER");
    expect(product.lines[0].sourceShare).toBeNull();
    const subtotal = await parse(reportRows({ H8: "1" }));
    const issue = subtotal.issues.find((i) => i.code === "INVALID_NUMBER")!;
    expect([issue.row, issue.cell]).toEqual([8, "H8"]);
    expect(await codes(parse(reportRows({ H7: null })))).toContain("MISSING_NUMBER");
    expect((await parse(reportRows({ H7: ["n", "1"], H8: ["n", "1"] }))).blocked).toBe(false);
  });

  it("validates branch, period, basis and filename metadata", async () => {
    expect(await codes(parse(undefined, { expectedBranchCode: "0002" }))).toContain("BRANCH_MISMATCH");
    expect(await codes(parse(undefined, { today: "2026-08-02" }))).toContain("PERIOD_NOT_CLOSED");
    expect(await codes(parse(undefined, { filename: "01-07_ate_31-07.xlsx" }))).toContain("FILENAME_PERIOD_MISMATCH");
    expect(await codes(parse(undefined, { filename: "01-08_ate_31-08.xlsx" }))).not.toContain("FILENAME_PERIOD_MISMATCH");
    expect(await codes(parse(reportRows({ B1: ["n", "0001"] })))).toContain("INVALID_BRANCH_CODE");
    const name = await parse(reportRows({ C1: ["n", "123"] }));
    expect(name.issues.find((i) => i.code === "INVALID_BRANCH_NAME")?.cell).toBe("C1");
    expect(await codes(parse(reportRows({ C1: null })))).toContain("METADATA_LAYOUT");
    expect(await codes(parse(reportRows({ E2: "Tipo de Custo: Custo Atual" })))).toContain("INVALID_COST_BASIS");
    expect((await parse(reportRows({ E2: "Tipo de Custo: Custo Médio Bruto da Época" }))).metadata?.costBasis).toBe("GROSS_PERIOD");
    expect(await codes(parse(reportRows({ A2: "Período: 01/08/2026 a 30/08/2026" })))).toContain("INVALID_PERIOD");
  });

  it("validates the subtotal share at its source cell", async () => {
    const issue = (await parse(reportRows({ H8: ["n", "1.1"] }))).issues.find((i) => i.code === "PERCENTAGE_RANGE")!;
    expect([issue.row, issue.cell]).toEqual([8, "H8"]);
  });

  it("blocks unknown rows, products after total and unclosed groups", async () => {
    let rows = reportRows();
    rows[8] = { A: "mistério" };
    expect(await codes(parse(rows))).toContain("UNKNOWN_ROW");
    rows = reportRows();
    rows[8] = { E: "Total Geral", G: ["n", "25"] };
    rows[9] = { ...rows[7] };
    expect(await codes(parse(rows))).toContain("PRODUCT_AFTER_TOTAL");
    rows = reportRows();
    delete rows[8];
    expect(await codes(parse(rows))).toContain("UNCLOSED_GROUP");
  });

  it("does not present a missing number as a valid sum", async () => {
    const preview = await parse(reportRows({ G7: null }));
    expect(preview.blocked).toBe(true);
    expect(preview.calculatedTotal).toBeNull();
    expect(preview.issues.map((i) => i.code)).toContain("MISSING_NUMBER");
  });

  it("enforces numeric limits, units and extra cells", async () => {
    expect(await codes(parse(reportRows({ E7: ["n", "1e999999"] })))).toContain("NUMBER_LIMIT");
    expect(await codes(parse(reportRows({ F7: ["n", "1".repeat(41)] })))).toContain("NUMBER_LIMIT");
    expect(await codes(parse(reportRows({ D7: "BOX" })))).toContain("UNKNOWN_UNIT");
    expect(await codes(parse(reportRows({ C7: "hidden" })))).toContain("UNEXPECTED_CELL");
  });

  it("builds a publication payload in percentage points with the canonical hash", async () => {
    const preview = await parse(reportRows({ H7: ["n", "1"] }), { filename: "01-07_ate_31-07.xlsx" });
    const payload = await buildPayload(preview);
    expect(payload).toMatchObject({
      unit_code: "0001", period_start: "2026-08-01", period_end: "2026-08-31", cost_basis: "NET_PERIOD",
      declared_total: "25", subtotals: [{ class: "A", total: "25" }], file_sha256: preview.sourceSha256,
      warnings: ["Nome do arquivo diverge do período interno."],
    });
    expect(payload.lines[0]).toEqual({ line_no: 1, code: "001.02", name: "Produto Sintético", unit: "PC", quantity: "2.5",
      unit_cost: "10", total: "25", source_share: "100", erp_class: "A", sheet: "Curva ABC Geral (Realizado)", row: 7 });
    expect(canonicalContent(payload).startsWith("abc-content-v1")).toBe(true);
    await expect(buildPayload(await parse(reportRows({ G7: null })))).rejects.toThrow("bloqueios");
  });
});
