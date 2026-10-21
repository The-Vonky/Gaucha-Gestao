import { contentHash, sha256Hex } from "./contentHash";
import { cmp, differsBy, mul, sub, sum } from "./decimal";
import { NumberError, parseDecimal, parseShare } from "./numbers";
import { readXlsx, XlsxError, type Cell, type Row } from "./xlsx";
import type { CostBasis, ErpClass, ReportPayload } from "../types";

/**
 * Parser and reconciliation for the approved ERP report "Curva ABC Geral (Realizado)".
 * Port of ingestion/parser.py from The-Vonky/CurvaABC-Gaucha; same codes and thresholds.
 * The preview is advisory: abc.publish_revision re-validates everything it can.
 */
// D13: new ingestion profile; original workbook bytes and SHA-256 remain unchanged.
export const PARSER_VERSION = "erp-curva-realizado-v2";
export const SHEET_NAME = "Curva ABC Geral (Realizado)";
const BASIS: Record<string, CostBasis> = {
  "custo medio liquido da epoca": "NET_PERIOD",
  "custo medio bruto da epoca": "GROSS_PERIOD",
};
const UNITS: Record<string, string> = { KG: "KG", G: "G", LT: "L", L: "L", ML: "ML", UN: "UN", UND: "UN", PC: "PC" };
const EXPECTED_HEADER: Record<string, string> = {
  A: "codigo", B: "nome do produto", D: "un", E: "realizado", F: "custo unit.", G: "custo total", H: "sobre total",
};
/** Limits enforced by abc.publish_revision; checked here so a clean preview never fails to publish. */
export const MAX_PRODUCTS = 20000;
const TEXT_LIMITS = { code: 60, name: 500, unit: 40, branch: 40, basis: 200 } as const;
/** U+0000–U+001F or U+007F: the range abc_private.clean_text rejects. */
function hasControl(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}
/** Operator guidance for the reader's stable codes (the file is never repaired or partially read). */
const XLSX_MESSAGES: Record<string, string> = {
  invalid_zip: "O arquivo não é um pacote XLSX válido ou está corrompido.",
  file_too_large: "O arquivo excede o limite de 10 MB.",
  unsupported_part:
    "O XLSX contém componentes não permitidos, como imagens, macros ou partes extras. O tema padrão do Excel (xl/theme/theme1.xml) é aceito, mas os demais componentes continuam bloqueados. Reexportar diretamente do ERP pode resolver.",
  formula: "O arquivo contém fórmulas. Envie a exportação estática do ERP, sem fórmulas.",
  encrypted_part: "O arquivo está protegido por senha ou criptografado.",
  external_relationship: "O arquivo contém vínculos externos, que não são aceitos.",
  unsupported_cell_type: "O arquivo contém células de tipo não suportado (data, booleano, erro ou fórmula de texto).",
  xml_doctype: "O arquivo contém declarações XML não permitidas.",
  invalid_xml: "O conteúdo XML do arquivo é inválido ou não está em UTF-8.",
};
export function xlsxMessage(code: string): string {
  return `${XLSX_MESSAGES[code] ?? "A estrutura do arquivo XLSX não é suportada."} (código: ${code})`;
}

export type Severity = "BLOCKER" | "WARNING";
export type Issue = { code: string; severity: Severity; message: string; row: number | null; cell: string | null };
export type RowKind = "METADATA" | "HEADER" | "GROUP" | "PRODUCT" | "SUBTOTAL" | "TOTAL" | "EMPTY" | "UNKNOWN";
export type ProductLine = {
  row: number;
  code: string;
  description: string;
  unitRaw: string;
  unit: string | null;
  quantity: string | null;
  unitCost: string | null;
  total: string | null;
  /** Fraction 0–1. */
  sourceShare: string | null;
  sourceClass: ErpClass | null;
};
export type Metadata = {
  branchCode: string | null;
  branchName: string | null;
  start: string | null;
  end: string | null;
  costBasis: CostBasis | null;
  costBasisRaw: string | null;
};
export type Preview = {
  parserVersion: string;
  sourceSha256: string;
  sheetName: string;
  metadata: Metadata | null;
  lines: ProductLine[];
  rows: { row: number; kind: RowKind }[];
  issues: Issue[];
  subtotals: { class: ErpClass; total: string | null; row: number }[];
  declaredTotal: string | null;
  calculatedTotal: string | null;
  blocked: boolean;
};
export type ParseContext = {
  expectedBranchCode: string;
  /** ISO date; the current or a future month is not a closed period. */
  today: string;
  filename?: string;
};

function norm(value: string | null | undefined): string {
  const text = (value ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean).join(" ");
  return text.normalize("NFD").replace(/\p{Mn}/gu, "");
}
type Cells = Map<string, Cell>;
function cellsOf(row: Row): Cells {
  return new Map(row.cells.map((c) => [/^[A-Z]+/.exec(c.reference)![0], c]));
}
const valueOf = (cells: Cells | undefined, column: string) => cells?.get(column)?.value ?? null;
const nonempty = (cells: Cells) =>
  new Set([...cells].filter(([, c]) => c.value !== null && c.value !== "").map(([k]) => k));
const isText = (cell: Cell | undefined) => cell !== undefined && (cell.kind === "s" || cell.kind === "inlineStr");

class Issues {
  list: Issue[] = [];
  add(code: string, message: string, row: number | null = null, cell: string | null = null, severity: Severity = "BLOCKER") {
    this.list.push({ code, severity, message, row, cell });
  }
}

function toUint8(data: ArrayBuffer | Uint8Array) {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

export async function parseReport(input: ArrayBuffer | Uint8Array, ctx: ParseContext): Promise<Preview> {
  if (!ctx.expectedBranchCode) throw new Error("expectedBranchCode is required");
  const data = toUint8(input);
  const sha = await sha256Hex(data);
  const empty = (issue: Issue): Preview => ({
    parserVersion: PARSER_VERSION, sourceSha256: sha, sheetName: SHEET_NAME, metadata: null, lines: [], rows: [],
    issues: [issue], subtotals: [], declaredTotal: null, calculatedTotal: null, blocked: true,
  });
  let workbook;
  try {
    workbook = readXlsx(data);
  } catch (e) {
    // An unexpected exception still comes from untrusted bytes: fail closed, but keep it diagnosable.
    if (!(e instanceof XlsxError)) console.error("Curva ABC: falha inesperada ao ler o XLSX", e);
    const code = e instanceof XlsxError ? e.code : "unreadable";
    return empty({ code: "XLSX_INVALID", severity: "BLOCKER", message: xlsxMessage(code), row: null, cell: null });
  }
  const issues = new Issues();
  let target = workbook.sheets.filter((s) => norm(s.name) === norm(SHEET_NAME));
  if (target.length !== 1) {
    issues.add("SHEET_LAYOUT", "A planilha esperada deve existir uma única vez.");
    target = workbook.sheets.slice(0, 1);
  }
  for (const sheet of workbook.sheets)
    if (!target.includes(sheet) && sheet.rows.some((r) => r.cells.some((c) => c.value !== null && c.value !== "")))
      issues.add("EXTRA_SHEET_CONTENT", "Abas adicionais devem estar vazias.");
  const sheet = target[0];
  const indexed = new Map(sheet.rows.map((r) => [r.number, cellsOf(r)]));

  const wanted = Object.values(EXPECTED_HEADER);
  const candidates = [...indexed].filter(([n, cells]) => {
    const labels = new Set([...cells.values()].map((c) => norm(c.value)));
    return n <= 20 && wanted.every((w) => labels.has(w));
  }).map(([n]) => n);
  if (candidates.length !== 1) issues.add("HEADER_LAYOUT", "Cabeçalho deve aparecer uma única vez até a linha 20.");
  const header = candidates[0] ?? null;
  if (header !== null) {
    const hc = indexed.get(header)!;
    const columns = nonempty(hc);
    if (Object.entries(EXPECTED_HEADER).some(([col, label]) => norm(valueOf(hc, col)) !== label)
      || columns.size !== Object.keys(EXPECTED_HEADER).length || [...columns].some((c) => !(c in EXPECTED_HEADER)))
      issues.add("HEADER_LAYOUT", "Colunas do cabeçalho não correspondem ao layout homologado.", header);
  }

  const metadata = parseMetadata(indexed, header, ctx, issues);
  let lines: ProductLine[] = [];
  const rows: Preview["rows"] = [];
  let subtotals: Preview["subtotals"] = [];
  let declared: string | null = null;
  let calculated: string | null = null;
  if (header !== null) {
    for (const r of sheet.rows) if (r.number <= header) rows.push({ row: r.number, kind: r.number === header ? "HEADER" : "METADATA" });
    const body = parseBody(sheet.rows, header, issues);
    ({ lines, declared, subtotals } = body);
    rows.push(...body.rows);
    if (lines.length && body.complete && lines.every((l) => l.total !== null)) calculated = sum(lines.map((l) => l.total!));
    reconcile(lines, declared, calculated, issues);
  } else {
    for (const r of sheet.rows) rows.push({ row: r.number, kind: nonempty(cellsOf(r)).size ? "UNKNOWN" : "EMPTY" });
  }
  return {
    parserVersion: PARSER_VERSION, sourceSha256: sha, sheetName: sheet.name, metadata, lines, rows,
    issues: issues.list, subtotals, declaredTotal: declared, calculatedTotal: calculated,
    blocked: issues.list.some((i) => i.severity === "BLOCKER"),
  };
}

const DATE_BR = /^(\d{2})\/(\d{2})\/(\d{4})$/;
function isoDate(text: string): string | null {
  const m = DATE_BR.exec(text);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function lastDay(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${iso.slice(0, 8)}${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

function parseMetadata(indexed: Map<number, Cells>, header: number | null, ctx: ParseContext, issues: Issues): Metadata {
  const [c1, c2, c3, c4] = [1, 2, 3, 4].map((n) => indexed.get(n) ?? new Map<string, Cell>());
  const branch = valueOf(c1, "B");
  const name = valueOf(c1, "C");
  if (norm(valueOf(c1, "A")) !== "unidade:" || !branch || !name) issues.add("METADATA_LAYOUT", "Metadado Unidade inválido.", 1);
  if (c1.has("B") && !isText(c1.get("B"))) issues.add("INVALID_BRANCH_CODE", "Código da filial deve ser textual.", 1, "B1");
  else if (branch && branch !== ctx.expectedBranchCode)
    issues.add("BRANCH_MISMATCH", "Filial não corresponde à unidade selecionada.", 1, "B1");
  if (c1.has("C") && !isText(c1.get("C"))) issues.add("INVALID_BRANCH_NAME", "Nome da filial deve ser textual.", 1, "C1");
  if (branch && (branch.length > TEXT_LIMITS.branch || hasControl(branch)))
    issues.add("INVALID_TEXT", `Código da filial deve ter até ${TEXT_LIMITS.branch} caracteres, sem caracteres de controle.`, 1, "B1");

  let start: string | null = null;
  let end: string | null = null;
  const m = /^periodo:\s*(\d{2}\/\d{2}\/\d{4}) a (\d{2}\/\d{2}\/\d{4})$/.exec(norm(valueOf(c2, "A")));
  if (m) {
    start = isoDate(m[1]);
    end = isoDate(m[2]);
  }
  if (!start || !end || !start.endsWith("-01") || end !== lastDay(start)) {
    issues.add("INVALID_PERIOD", "Período deve cobrir um mês completo.", 2, "A2");
    start = end = null;
  }
  if (end && end.slice(0, 7) >= ctx.today.slice(0, 7))
    issues.add("PERIOD_NOT_CLOSED", "Período atual ou futuro não está fechado.", 2, "A2");

  const rawBasis = valueOf(c2, "E");
  const nb = norm(rawBasis);
  const basis = nb.startsWith("tipo de custo:") ? BASIS[nb.slice("tipo de custo:".length).trim()] ?? null : null;
  if (!basis) issues.add("INVALID_COST_BASIS", "Modalidade de custo não homologada.", 2, "E2");

  const allowed: Record<number, string[]> = { 1: ["A", "B", "C", "E", "G"], 2: ["A", "E"], 3: ["A"], 4: ["E", "H"] };
  const validLabels = norm(valueOf(c3, "A")).startsWith("produto:") && norm(valueOf(c4, "E")) === "consumo"
    && norm(valueOf(c4, "H")) === "percentual";
  if (!validLabels || Object.entries(allowed).some(([n, cols]) =>
    [...nonempty(indexed.get(Number(n)) ?? new Map())].some((c) => !cols.includes(c))))
    issues.add("METADATA_LAYOUT", "Área de metadados não corresponde ao layout homologado.");
  if (header !== null && header !== 5)
    for (let n = 5; n < header; n++)
      if (nonempty(indexed.get(n) ?? new Map()).size) issues.add("METADATA_LAYOUT", "Conteúdo desconhecido antes do cabeçalho.", n);
  if (ctx.filename && start && end) {
    const f = /01-(\d{2})_ate_(\d{2})-(\d{2})/.exec(ctx.filename);
    if (!f || Number(f[1]) !== Number(start.slice(5, 7)) || Number(f[2]) !== Number(end.slice(8, 10)) || Number(f[3]) !== Number(end.slice(5, 7)))
      issues.add("FILENAME_PERIOD_MISMATCH", "Nome do arquivo diverge do período interno.", null, null, "WARNING");
  }
  // The basis text is read from the report; only the exact label after "Tipo de Custo:" is kept.
  const basisText = rawBasis?.replace(/^\s*tipo de custo:\s*/i, "").trim() ?? null;
  if (basisText && (basisText.length > TEXT_LIMITS.basis || hasControl(basisText)))
    issues.add("INVALID_TEXT", `Modalidade de custo deve ter até ${TEXT_LIMITS.basis} caracteres, sem caracteres de controle.`, 2, "E2");
  return { branchCode: branch, branchName: name, start, end, costBasis: basis, costBasisRaw: basisText };
}

function numberAt(cell: Cell | undefined, issues: Issues, row: number, share = false): string | null {
  try {
    return (share ? parseShare : parseDecimal)(cell?.value ?? null, cell?.kind === "n");
  } catch (e) {
    if (!(e instanceof NumberError)) throw e;
    issues.add(e.code, "Número ausente ou inválido.", row, cell?.reference ?? null);
    return null;
  }
}

function parseBody(rows: Row[], header: number, issues: Issues) {
  const lines: ProductLine[] = [];
  const records: Preview["rows"] = [];
  let current: ErpClass | null = null;
  const seen = new Set<ErpClass>();
  const subtotals = new Map<ErpClass, { total: string | null; share: string | null; row: number }>();
  let declared: string | null = null;
  let totalSeen = false;
  let complete = true;
  const codes = new Map<string, number>();
  for (const row of rows) {
    if (row.number <= header) continue;
    const cells = cellsOf(row);
    const filled = nonempty(cells);
    if (!filled.size) { records.push({ row: row.number, kind: "EMPTY" }); continue; }
    const a = norm(valueOf(cells, "A"));
    const e = norm(valueOf(cells, "E"));
    const group = /^curva ([abc])$/.exec(a);
    const subtotal = /^total da curva ([abc])$/.exec(e);
    const only = (allowed: string[]) => [...filled].every((c) => allowed.includes(c));
    if (group) {
      const g = group[1].toUpperCase() as ErpClass;
      records.push({ row: row.number, kind: "GROUP" });
      if (!(filled.size === 1 && filled.has("A")) || current !== null || seen.has(g) || totalSeen)
        issues.add("GROUP_STATE", "Marcador de curva fora de ordem.", row.number);
      current = g;
      seen.add(g);
    } else if (subtotal) {
      const g = subtotal[1].toUpperCase() as ErpClass;
      records.push({ row: row.number, kind: "SUBTOTAL" });
      if (!only(["E", "G", "H"]) || current !== g) issues.add("GROUP_STATE", "Subtotal não fecha a curva aberta.", row.number);
      const total = numberAt(cells.get("G"), issues, row.number);
      const share = filled.has("H") ? numberAt(cells.get("H"), issues, row.number, true) : null;
      subtotals.set(g, { total, share, row: row.number });
      current = null;
    } else if (e === "total geral") {
      records.push({ row: row.number, kind: "TOTAL" });
      if (!only(["E", "G"]) || current !== null || totalSeen) issues.add("TOTAL_STATE", "Total geral fora de ordem.", row.number);
      declared = numberAt(cells.get("G"), issues, row.number);
      totalSeen = true;
    } else if (valueOf(cells, "A") && valueOf(cells, "B")) {
      records.push({ row: row.number, kind: "PRODUCT" });
      if (totalSeen) issues.add("PRODUCT_AFTER_TOTAL", "Produto encontrado após o total geral.", row.number);
      if (current === null) issues.add("PRODUCT_OUTSIDE_GROUP", "Produto fora de uma curva aberta.", row.number);
      const extras = [...filled].filter((c) => !["A", "B", "D", "E", "F", "G", "H"].includes(c)).sort();
      if (extras.length) issues.add("UNEXPECTED_CELL", "Produto contém célula fora do layout.", row.number, `${extras[0]}${row.number}`);
      const code = valueOf(cells, "A") ?? "";
      if (!isText(cells.get("A")) || !code.trim())
        issues.add("INVALID_PRODUCT_CODE", "Código de produto deve ser texto não vazio.", row.number, `A${row.number}`);
      const first = codes.get(code);
      if (first !== undefined) {
        issues.add("DUPLICATE_PRODUCT", "Código de produto duplicado.", first, `A${first}`);
        issues.add("DUPLICATE_PRODUCT", "Código de produto duplicado.", row.number, `A${row.number}`);
      } else codes.set(code, row.number);
      const description = (valueOf(cells, "B") ?? "").trim();
      const unitRaw = (valueOf(cells, "D") ?? "").trim();
      for (const [column, text, limit] of [["A", code, TEXT_LIMITS.code], ["B", description, TEXT_LIMITS.name], ["D", unitRaw, TEXT_LIMITS.unit]] as const)
        if (text.length > limit || hasControl(text))
          issues.add("INVALID_TEXT", `Texto deve ter até ${limit} caracteres, sem quebras de linha ou caracteres de controle.`, row.number, `${column}${row.number}`);
      const unit = UNITS[unitRaw.toUpperCase()] ?? null;
      if (!unit) issues.add("UNKNOWN_UNIT", "Unidade não homologada.", row.number, `D${row.number}`);
      const quantity = numberAt(cells.get("E"), issues, row.number);
      const unitCost = numberAt(cells.get("F"), issues, row.number);
      const total = numberAt(cells.get("G"), issues, row.number);
      const sourceShare = numberAt(cells.get("H"), issues, row.number, true);
      if ([quantity, unitCost, total, sourceShare].includes(null)) complete = false;
      lines.push({ row: row.number, code, description, unitRaw, unit,
        quantity, unitCost, total, sourceShare, sourceClass: current });
    } else {
      records.push({ row: row.number, kind: "UNKNOWN" });
      complete = false;
      issues.add("UNKNOWN_ROW", "Linha não reconhecida no relatório.", row.number);
    }
  }
  if (current !== null) issues.add("UNCLOSED_GROUP", "Curva aberta sem subtotal.");
  if ([...seen].some((g) => !subtotals.has(g))) issues.add("UNCLOSED_GROUP", "Toda curva presente precisa de subtotal.");
  if (!totalSeen) issues.add("MISSING_TOTAL", "Total geral ausente.");
  if (!lines.length) issues.add("MISSING_PRODUCTS", "Relatório deve conter ao menos um produto.");
  if (lines.length > MAX_PRODUCTS) issues.add("TOO_MANY_PRODUCTS", `Relatório excede ${MAX_PRODUCTS} produtos por publicação.`);
  for (const [g, s] of subtotals) {
    const group = lines.filter((l) => l.sourceClass === g);
    if (s.total !== null && group.every((l) => l.total !== null) && differsBy(s.total, sum(group.map((l) => l.total!)), "0.05"))
      issues.add("SUBTOTAL_MISMATCH", "Subtotal diverge da soma dos produtos.", s.row);
    if (s.total !== null && s.share !== null && declared !== null) {
      const expected = cmp(declared, "0") === 0 ? "0" : null;
      const mismatch = expected !== null ? cmp(s.share, "0") !== 0 : shareDiffers(s.share, s.total, declared);
      if (mismatch) issues.add("SUBTOTAL_SHARE_MISMATCH", "Percentual do subtotal diverge do total declarado.", s.row, `H${s.row}`, "WARNING");
    }
  }
  return {
    lines, rows: records, declared, complete,
    subtotals: [...subtotals].map(([g, s]) => ({ class: g, total: s.total, row: s.row })),
  };
}

/** |share − part/whole| > 0.0001, compared without division: |share·whole − part| > 0.0001·whole. */
function shareDiffers(share: string, part: string, whole: string): boolean {
  const lhs = sub(mul(share, whole), part);
  const abs = lhs.startsWith("-") ? lhs.slice(1) : lhs;
  return cmp(abs, mul("0.0001", whole)) > 0;
}

function reconcile(lines: ProductLine[], declared: string | null, calculated: string | null, issues: Issues) {
  for (const l of lines) {
    if (l.quantity !== null && l.unitCost !== null && l.total !== null) {
      const qZero = cmp(l.quantity, "0") === 0;
      const tZero = cmp(l.total, "0") === 0;
      if (qZero && !tZero) issues.add("ZERO_QUANTITY_WITH_TOTAL", "Quantidade zero com total positivo.", l.row, `G${l.row}`);
      else if (!qZero && tZero) issues.add("ZERO_TOTAL", "Total zero requer aceite.", l.row, `G${l.row}`, "WARNING");
      else if (qZero && tZero) issues.add("NO_ANALYTIC_PRICE", "Linha sem preço analítico.", l.row, `F${l.row}`, "WARNING");
      if (differsBy(l.total, mul(l.quantity, l.unitCost), "0.01"))
        issues.add("LINE_VALUE_MISMATCH", "Total difere de quantidade vezes custo.", l.row, `G${l.row}`);
    }
    if (declared !== null && l.total !== null && l.sourceShare !== null) {
      const mismatch = cmp(declared, "0") === 0 ? cmp(l.sourceShare, "0") !== 0 : shareDiffers(l.sourceShare, l.total, declared);
      if (mismatch) issues.add("SHARE_MISMATCH", "Percentual diverge do total declarado.", l.row, null, "WARNING");
    }
  }
  if (declared !== null && calculated !== null && differsBy(declared, calculated, "0.05"))
    issues.add("TOTAL_MISMATCH", "Total geral diverge da soma dos produtos.");
}

/** Warnings only the browser can see (the database derives the others itself). */
const CLIENT_WARNINGS = new Set(["FILENAME_PERIOD_MISMATCH", "SUBTOTAL_SHARE_MISMATCH", "NO_ANALYTIC_PRICE"]);

export function warningText(issue: Issue): string {
  return issue.row !== null ? `${issue.message} (linha ${issue.row})` : issue.message;
}

/** The database accepts at most 50 client warnings of up to 200 characters: one per code, listing rows. */
export function clientWarnings(issues: Issue[]): string[] {
  const byCode = new Map<string, Issue[]>();
  for (const i of issues)
    if (i.severity === "WARNING" && CLIENT_WARNINGS.has(i.code)) {
      const group = byCode.get(i.code) ?? [];
      group.push(i);
      byCode.set(i.code, group);
    }
  return [...byCode.values()].map((group) => {
    const rows = group.map((i) => i.row).filter((r): r is number => r !== null);
    if (!rows.length) return group[0].message;
    let text = `${group[0].message} (${rows.length === 1 ? "linha" : "linhas"} `;
    let shown = 0;
    while (shown < rows.length && text.length + String(rows[shown]).length + 24 <= 200)
      text += `${shown ? ", " : ""}${rows[shown++]}`;
    return `${text}${shown < rows.length ? ` e mais ${rows.length - shown}` : ""})`;
  });
}

/** Builds the publication payload from an unblocked preview. */
export async function buildPayload(preview: Preview): Promise<ReportPayload> {
  const m = preview.metadata;
  if (preview.blocked || !m || !m.branchCode || !m.start || !m.end || !m.costBasis || !m.costBasisRaw || preview.declaredTotal === null)
    throw new Error("A prévia possui bloqueios e não pode ser publicada.");
  const lines = preview.lines.map((l, i) => ({
    line_no: i + 1,
    code: l.code,
    name: l.description,
    unit: l.unitRaw,
    quantity: l.quantity!,
    unit_cost: l.unitCost!,
    total: l.total!,
    source_share: l.sourceShare === null ? null : mul(l.sourceShare, "100"),
    erp_class: l.sourceClass,
    sheet: preview.sheetName,
    row: l.row,
  }));
  const draft = {
    unit_code: m.branchCode,
    period_start: m.start,
    period_end: m.end,
    cost_basis: m.costBasis,
    cost_basis_text: m.costBasisRaw,
    declared_total: preview.declaredTotal,
    subtotals: preview.subtotals.map((s) => ({ class: s.class, total: s.total! })),
    lines,
  };
  return {
    ...draft,
    parser_version: preview.parserVersion,
    file_sha256: preview.sourceSha256,
    warnings: clientWarnings(preview.issues),
    content_hash: await contentHash(draft),
  };
}
