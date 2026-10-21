import { inflateSync } from "fflate";

/**
 * Bounded reader for the static OOXML spreadsheet profile exported by the ERP.
 * Port of the reviewed reader from The-Vonky/CurvaABC-Gaucha (intranet ingestion/xlsx.py).
 * Untrusted input: every structural rule fails closed with a stable code.
 */
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const DOC_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const ALLOWED_FIXED = new Set([
  "[Content_Types].xml", "_rels/.rels", "docProps/core.xml", "docProps/app.xml",
  "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/sharedStrings.xml",
  // D13: canonical, inert Excel theme; its bytes are never interpreted as business data.
  "xl/theme/theme1.xml",
]);
const SHEET_PART = /^xl\/worksheets\/sheet[1-9][0-9]*\.xml$/;
const CELL_REF = /^([A-Z]+)([1-9][0-9]*)$/;
const RELATIONSHIP_TYPES: Record<string, string> = {
  [`${DOC_REL}/officeDocument`]: "officeDocument",
  [`${DOC_REL}/worksheet`]: "worksheet",
  [`${DOC_REL}/sharedStrings`]: "sharedStrings",
  [`${DOC_REL}/styles`]: "styles",
  [`${DOC_REL}/theme`]: "theme",
  [`${DOC_REL}/extended-properties`]: "extended-properties",
  "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties": "core-properties",
};

export class XlsxError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export type XlsxLimits = {
  maxFileBytes: number;
  maxUncompressedBytes: number;
  maxPartBytes: number;
  maxMembers: number;
  maxRatio: number;
  maxSheets: number;
  maxRows: number;
  maxCells: number;
  maxTextChars: number;
};
export const DEFAULT_LIMITS: XlsxLimits = {
  maxFileBytes: 10 * 1024 ** 2,
  maxUncompressedBytes: 200 * 1024 ** 2,
  maxPartBytes: 16 * 1024 ** 2,
  maxMembers: 256,
  maxRatio: 200,
  maxSheets: 20,
  maxRows: 100000,
  maxCells: 2000000,
  maxTextChars: 32767,
};

export type CellKind = "n" | "s" | "inlineStr" | "blank";
export type Cell = { reference: string; kind: CellKind; raw: string | null; value: string | null; numberFormat: string };
export type Row = { number: number; cells: Cell[] };
export type Sheet = { name: string; rows: Row[] };
export type Workbook = { sheets: Sheet[] };

type Rels = Map<string, [kind: string, target: string]>;

export function readXlsx(data: Uint8Array, limits: XlsxLimits = DEFAULT_LIMITS): Workbook {
  if (data.length > limits.maxFileBytes) throw new XlsxError("file_too_large", "Spreadsheet exceeds the file-size limit");
  const parts = readParts(data, limits);
  return buildWorkbook(parts, limits);
}

// ---------------------------------------------------------------- ZIP

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function invalidZip(): never {
  throw new XlsxError("invalid_zip", "Spreadsheet package is invalid");
}

function readParts(data: Uint8Array, limits: XlsxLimits): Map<string, Uint8Array> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u16 = (o: number) => (o + 2 <= data.length ? view.getUint16(o, true) : invalidZip());
  const u32 = (o: number) => (o + 4 <= data.length ? view.getUint32(o, true) : invalidZip());
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 65535); i--) {
    if (u32(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) invalidZip();
  if (u16(eocd + 4) !== 0 || u16(eocd + 6) !== 0) invalidZip();
  const count = u16(eocd + 10);
  if (count !== u16(eocd + 8)) invalidZip();
  if (count > limits.maxMembers) throw new XlsxError("too_many_members", "Spreadsheet has too many package parts");
  let offset = u32(eocd + 16);
  if (offset + u32(eocd + 12) > eocd) invalidZip();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const parts = new Map<string, Uint8Array>();
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (u32(offset) !== 0x02014b50) invalidZip();
    const flags = u16(offset + 8);
    const method = u16(offset + 10);
    const crc = u32(offset + 16);
    const csize = u32(offset + 20);
    const usize = u32(offset + 24);
    const nameLength = u16(offset + 28);
    const next = offset + 46 + nameLength + u16(offset + 30) + u16(offset + 32);
    const localOffset = u32(offset + 42);
    if (next > data.length || csize === 0xffffffff || usize === 0xffffffff || localOffset === 0xffffffff) invalidZip();
    let name: string;
    try {
      name = decoder.decode(data.subarray(offset + 46, offset + 46 + nameLength));
    } catch {
      return invalidZip();
    }
    offset = next;
    if (parts.has(name)) throw new XlsxError("duplicate_part", "Spreadsheet contains a duplicate package part");
    if (!name || name.startsWith("/") || name.includes("\\") || name.split("/").some((p) => p === "" || p === "." || p === ".."))
      throw new XlsxError("invalid_part_name", "Spreadsheet contains an unsafe package path");
    if (flags & 1) throw new XlsxError("encrypted_part", "Encrypted package parts are not supported");
    if (method !== 0 && method !== 8) throw new XlsxError("unsupported_compression", "Package compression is not supported");
    if (usize > limits.maxPartBytes) throw new XlsxError("part_too_large", "A package part exceeds its size limit");
    if (usize && usize > Math.max(1, csize) * limits.maxRatio)
      throw new XlsxError("compression_ratio", "A package part exceeds its compression ratio limit");
    total += usize;
    if (total > limits.maxUncompressedBytes) throw new XlsxError("package_too_large", "Spreadsheet exceeds the expanded-size limit");
    if (!ALLOWED_FIXED.has(name) && !SHEET_PART.test(name))
      throw new XlsxError("unsupported_part", "Spreadsheet contains an unsupported package part");
    if (u32(localOffset) !== 0x04034b50) invalidZip();
    const start = localOffset + 30 + u16(localOffset + 26) + u16(localOffset + 28);
    if (start + csize > data.length) invalidZip();
    const compressed = data.subarray(start, start + csize);
    let payload: Uint8Array;
    if (method === 0) {
      if (csize !== usize) invalidZip();
      payload = compressed;
    } else {
      try {
        // A fixed output buffer truncates oversized streams; the CRC check below rejects them.
        payload = usize ? inflateSync(compressed, { out: new Uint8Array(usize) }) : inflateSync(compressed);
      } catch {
        return invalidZip();
      }
    }
    if (payload.length !== usize) throw new XlsxError("part_too_large", "A package part exceeds its size limit");
    if (crc32(payload) !== crc) invalidZip();
    parts.set(name, payload);
  }
  return parts;
}

// ---------------------------------------------------------------- XML

function xml(parts: Map<string, Uint8Array>, name: string): Document {
  const payload = parts.get(name);
  if (!payload) throw new XlsxError("missing_part", "Spreadsheet is missing a required package part");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(payload);
  } catch {
    throw new XlsxError("invalid_xml", "Spreadsheet XML is invalid");
  }
  if (/<!DOCTYPE/i.test(text)) throw new XlsxError("xml_doctype", "Document type declarations are not supported");
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new XlsxError("invalid_xml", "Spreadsheet XML is invalid");
  if (depth(doc.documentElement) > 64) throw new XlsxError("xml_depth", "XML nesting exceeds the supported limit");
  return doc;
}

function depth(node: Element): number {
  let max = 0;
  const stack: [Element, number][] = [[node, 1]];
  while (stack.length) {
    const [el, d] = stack.pop()!;
    if (d > max) max = d;
    if (max > 64) return max;
    for (const child of Array.from(el.children)) stack.push([child, d + 1]);
  }
  return max;
}

const children = (el: Element, ns: string, local: string) =>
  Array.from(el.children).filter((c) => c.namespaceURI === ns && c.localName === local);
const child = (el: Element, ns: string, local: string) => children(el, ns, local)[0] ?? null;

function dirname(path: string) {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}
function normpath(path: string): string {
  const out: string[] = [];
  for (const piece of path.split("/")) {
    if (piece === "" || piece === ".") continue;
    if (piece === "..") {
      if (!out.length || out[out.length - 1] === "..") out.push("..");
      else out.pop();
    } else out.push(piece);
  }
  return out.join("/") || ".";
}

function relationships(parts: Map<string, Uint8Array>, relPart: string, source: string): Rels {
  const root = xml(parts, relPart).documentElement;
  const result: Rels = new Map();
  const base = dirname(source);
  for (const rel of children(root, REL, "Relationship")) {
    const id = rel.getAttribute("Id");
    const type = rel.getAttribute("Type") ?? "";
    const target = rel.getAttribute("Target");
    if (!id || result.has(id)) throw new XlsxError("duplicate_relationship", "Package relationship IDs must be unique");
    const kind = RELATIONSHIP_TYPES[type];
    if (!kind) throw new XlsxError("invalid_relationship", "Package relationship type is not supported");
    if (rel.getAttribute("TargetMode") !== null)
      throw new XlsxError("external_relationship", "External package relationships are not supported");
    if (!target || target.startsWith("/") || target.includes("\\"))
      throw new XlsxError("invalid_relationship_target", "Package relationship target is invalid");
    const resolved = normpath(base ? `${base}/${target}` : target);
    if (resolved === ".." || resolved.startsWith("../"))
      throw new XlsxError("invalid_relationship_target", "Package relationship target is invalid");
    if (!parts.has(resolved)) throw new XlsxError("missing_part", "Package relationship target is invalid");
    result.set(id, [kind, resolved]);
  }
  return result;
}

function validateContentTypes(parts: Map<string, Uint8Array>) {
  const root = xml(parts, "[Content_Types].xml").documentElement;
  const nodes = Array.from(root.children).filter((n) => n.localName === "Override");
  const names = nodes.map((n) => n.getAttribute("PartName"));
  if (new Set(names).size !== names.length) throw new XlsxError("invalid_content_type", "Package content types are invalid");
  const overrides = new Map(nodes.map((n) => [n.getAttribute("PartName"), n.getAttribute("ContentType")]));
  const expected = new Map<string, string>([
    ["/xl/workbook.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"],
  ]);
  for (const name of parts.keys())
    if (SHEET_PART.test(name)) expected.set(`/${name}`, "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml");
  const optional: Record<string, string> = {
    "xl/sharedStrings.xml": "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml",
    "xl/styles.xml": "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml",
    "xl/theme/theme1.xml": "application/vnd.openxmlformats-officedocument.theme+xml",
    "docProps/core.xml": "application/vnd.openxmlformats-package.core-properties+xml",
    "docProps/app.xml": "application/vnd.openxmlformats-officedocument.extended-properties+xml",
  };
  for (const [name, type] of Object.entries(optional)) if (parts.has(name)) expected.set(`/${name}`, type);
  for (const [part, type] of expected)
    if (overrides.get(part) !== type) throw new XlsxError("invalid_content_type", "Package content types are invalid");
}

function textContent(node: Element, limits: XlsxLimits): string {
  let value = "";
  const walk = (el: Element) => {
    for (const c of Array.from(el.children)) {
      if (c.namespaceURI !== MAIN) continue;
      if (c.localName === "rPh") continue;
      if (c.localName === "t") value += c.textContent ?? "";
      else walk(c);
    }
  };
  walk(node);
  if (value.length > limits.maxTextChars) throw new XlsxError("text_too_long", "Cell text exceeds the supported limit");
  return value;
}

function buildWorkbook(parts: Map<string, Uint8Array>, limits: XlsxLimits): Workbook {
  validateContentTypes(parts);
  const rootRels = relationships(parts, "_rels/.rels", "");
  const office = [...rootRels.values()].filter(([k]) => k === "officeDocument").map(([, t]) => t);
  if (office.length !== 1 || office[0] !== "xl/workbook.xml")
    throw new XlsxError("invalid_relationship", "Package workbook relationship is invalid");
  const workbook = xml(parts, "xl/workbook.xml").documentElement;
  const rels = relationships(parts, "xl/_rels/workbook.xml.rels", "xl/workbook.xml");
  for (const [kind] of rels.values())
    if (!["worksheet", "sharedStrings", "styles", "theme"].includes(kind))
      throw new XlsxError("invalid_relationship", "Workbook relationship type is not supported");
  for (const [kind, partName] of [["sharedStrings", "xl/sharedStrings.xml"], ["styles", "xl/styles.xml"], ["theme", "xl/theme/theme1.xml"]]) {
    const targets = [...rels.values()].filter(([k]) => k === kind).map(([, t]) => t);
    const pointsToPart = targets.length === 1 && targets[0] === partName;
    if (targets.length > 1 || parts.has(partName) !== pointsToPart)
      throw new XlsxError("invalid_relationship", "Workbook auxiliary relationship is invalid");
  }
  const sheetsNode = child(workbook, MAIN, "sheets");
  const sheetNodes = sheetsNode ? children(sheetsNode, MAIN, "sheet") : [];
  if (!sheetNodes.length || sheetNodes.length > limits.maxSheets)
    throw new XlsxError("sheet_count", "Spreadsheet has an unsupported number of sheets");
  const worksheetRels = new Map([...rels].filter(([, [k]]) => k === "worksheet").map(([id, [, t]]) => [id, t]));
  const packaged = new Set([...parts.keys()].filter((n) => SHEET_PART.test(n)));
  const nodeIds = sheetNodes.map((n) => n.getAttributeNS(DOC_REL, "id"));
  const targets = [...worksheetRels.values()];
  const sameSet = (a: Set<unknown>, b: Set<unknown>) => a.size === b.size && [...a].every((x) => b.has(x));
  if (nodeIds.some((id) => !id || !worksheetRels.has(id)) || new Set(nodeIds).size !== nodeIds.length
    || !sameSet(new Set(nodeIds), new Set(worksheetRels.keys())) || new Set(targets).size !== targets.length
    || !sameSet(new Set(targets), packaged))
    throw new XlsxError("invalid_relationship", "Worksheet relationships do not match package parts");
  const shared = sharedStrings(parts, rels, limits);
  const formats = numberFormats(parts, rels);
  const sheets: Sheet[] = [];
  let totalRows = 0;
  let totalCells = 0;
  for (const node of sheetNodes) {
    const target = worksheetRels.get(node.getAttributeNS(DOC_REL, "id")!)!;
    const [sheet, rowCount, cellCount] = readSheet(parts, target, node.getAttribute("name") ?? "", shared, formats, limits);
    totalRows += rowCount;
    totalCells += cellCount;
    if (totalRows > limits.maxRows) throw new XlsxError("too_many_rows", "Spreadsheet has too many rows");
    if (totalCells > limits.maxCells) throw new XlsxError("too_many_cells", "Spreadsheet has too many cells");
    sheets.push(sheet);
  }
  return { sheets };
}

function sharedStrings(parts: Map<string, Uint8Array>, rels: Rels, limits: XlsxLimits): string[] {
  const targets = [...rels.values()].filter(([k]) => k === "sharedStrings").map(([, t]) => t);
  if (!targets.length) return [];
  const root = xml(parts, targets[0]).documentElement;
  return children(root, MAIN, "si").map((si) => textContent(si, limits));
}

type Formats = [custom: Map<number, string>, xfs: number[]];
function numberFormats(parts: Map<string, Uint8Array>, rels: Rels): Formats {
  const targets = [...rels.values()].filter(([k]) => k === "styles").map(([, t]) => t);
  if (!targets.length) return [new Map(), []];
  const root = xml(parts, targets[0]).documentElement;
  const int = (v: string | null, fallback: number) => {
    if (v === null) return fallback;
    if (!/^-?\d+$/.test(v)) throw new XlsxError("invalid_style", "Cell style index is invalid");
    return Number(v);
  };
  const numFmts = child(root, MAIN, "numFmts");
  const custom = new Map((numFmts ? children(numFmts, MAIN, "numFmt") : [])
    .map((n) => [int(n.getAttribute("numFmtId"), -1), n.getAttribute("formatCode") ?? ""] as const));
  const cellXfs = child(root, MAIN, "cellXfs");
  const xfs = (cellXfs ? children(cellXfs, MAIN, "xf") : []).map((n) => int(n.getAttribute("numFmtId"), 0));
  return [custom, xfs];
}

function columnNumber(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n;
}

function readSheet(parts: Map<string, Uint8Array>, target: string, name: string, shared: string[],
  formats: Formats, limits: XlsxLimits): [Sheet, number, number] {
  const root = xml(parts, target).documentElement;
  const sheetData = child(root, MAIN, "sheetData");
  const rows: Row[] = [];
  let last = 0;
  let cellCount = 0;
  for (const rowNode of sheetData ? children(sheetData, MAIN, "row") : []) {
    const r = rowNode.getAttribute("r") ?? "";
    if (!/^\d+$/.test(r)) throw new XlsxError("invalid_row", "Worksheet row number is invalid");
    const number = Number(r);
    if (number < 1 || number > 1048576 || number <= last) throw new XlsxError("row_order", "Worksheet rows must be unique and ordered");
    last = number;
    const cells: Cell[] = [];
    const seen = new Set<string>();
    for (const cellNode of children(rowNode, MAIN, "c")) {
      const reference = cellNode.getAttribute("r") ?? "";
      const m = CELL_REF.exec(reference);
      if (!m || columnNumber(m[1]) > 16384 || Number(m[2]) > 1048576)
        throw new XlsxError("invalid_cell_reference", "Cell reference is invalid");
      if (Number(m[2]) !== number) throw new XlsxError("cell_row_mismatch", "Cell reference does not match its row");
      if (seen.has(reference)) throw new XlsxError("duplicate_cell", "Cell references must be unique");
      seen.add(reference);
      cells.push(readCell(cellNode, reference, shared, formats, limits));
      if (++cellCount > limits.maxCells) throw new XlsxError("too_many_cells", "Spreadsheet has too many cells");
    }
    rows.push({ number, cells });
    if (rows.length > limits.maxRows) throw new XlsxError("too_many_rows", "Spreadsheet has too many rows");
  }
  return [{ name, rows }, rows.length, cellCount];
}

function readCell(node: Element, reference: string, shared: string[], formats: Formats, limits: XlsxLimits): Cell {
  if (child(node, MAIN, "f")) throw new XlsxError("formula", "Formula cells are not supported");
  const type = node.getAttribute("t");
  if (type !== null && !["n", "s", "inlineStr"].includes(type))
    throw new XlsxError("unsupported_cell_type", "Cell type is not supported");
  const valueNode = child(node, MAIN, "v");
  const raw = valueNode ? (valueNode.textContent ?? "") : null;
  let value: string | null;
  let kind: CellKind;
  if (type === "inlineStr") {
    const inline = child(node, MAIN, "is");
    value = inline ? textContent(inline, limits) : null;
    kind = value !== null ? "inlineStr" : "blank";
  } else if (type === "s") {
    if (raw === null || !/^\d+$/.test(raw) || Number(raw) >= shared.length)
      throw new XlsxError("shared_string_index", "Shared string index is invalid");
    value = shared[Number(raw)];
    kind = "s";
  } else if (raw === null) {
    value = null;
    kind = "blank";
  } else {
    value = raw;
    kind = "n";
  }
  if (value !== null && value.length > limits.maxTextChars) throw new XlsxError("text_too_long", "Cell text exceeds the supported limit");
  const [custom, xfs] = formats;
  const s = node.getAttribute("s") ?? "0";
  if (!/^\d+$/.test(s) || (!xfs.length && s !== "0") || (xfs.length && Number(s) >= xfs.length))
    throw new XlsxError("invalid_style", "Cell style index is invalid");
  const formatId = xfs.length ? xfs[Number(s)] : 0;
  return { reference, kind, raw, value, numberFormat: custom.get(formatId) ?? String(formatId) };
}
