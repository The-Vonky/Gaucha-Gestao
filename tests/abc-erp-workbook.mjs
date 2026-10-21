import { strToU8, unzipSync, zipSync } from "fflate";

/**
 * Synthetic workbook shaped like the ERP export "Curva ABC Geral (Realizado)": shared strings,
 * styles with number formats, styled empty cells, merged ranges, docProps and the A/B/C groups.
 * Values and names are invented; no company data. Shared by Vitest and the real integration.
 */
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Exact decimal helpers (BigInt fixed point) so expected values never pass through floats.
function fixed(v) {
  const [i, f = ""] = v.split(".");
  return { units: BigInt(i + f), scale: f.length };
}
function text(units, scale) {
  const neg = units < 0n;
  const digits = (neg ? -units : units).toString().padStart(scale + 1, "0");
  const int = digits.slice(0, digits.length - scale);
  const frac = scale ? digits.slice(digits.length - scale).replace(/0+$/, "") : "";
  return (neg ? "-" : "") + (frac ? `${int}.${frac}` : int);
}
export function decMul(a, b) {
  const x = fixed(a), y = fixed(b);
  return text(x.units * y.units, x.scale + y.scale);
}
export function decAdd(a, b) {
  const x = fixed(a), y = fixed(b), s = Math.max(x.scale, y.scale);
  return text(x.units * 10n ** BigInt(s - x.scale) + y.units * 10n ** BigInt(s - y.scale), s);
}
export const decSum = (values) => values.reduce(decAdd, "0");
/** part/whole as a fraction truncated to 12 places, like a printed float share. */
function share(part, whole) {
  const p = fixed(part), w = fixed(whole), s = Math.max(p.scale, w.scale);
  const pu = p.units * 10n ** BigInt(s - p.scale), wu = w.units * 10n ** BigInt(s - w.scale);
  return wu === 0n ? "0" : text((pu * 10n ** 12n) / wu, 12);
}

/** Deterministic synthetic catalogue: `count` products, decreasing totals, ERP classes by position. */
export function syntheticProducts(count = 234, seed = 7) {
  let state = seed;
  const next = () => (state = (state * 1103515245 + 12345) % 2147483648);
  const units = ["KG", "UN", "LT", "PC", "G", "ML", "UND", "L"];
  const products = [];
  for (let i = 0; i < count; i++) {
    const quantity = `${1 + (next() % 900)}.${String(next() % 1000).padStart(3, "0")}`;
    const unitCost = `${1 + Math.floor((count - i) * 3 / 2)}.${String(next() % 100000).padStart(5, "0")}`;
    // Leading zeros and dotted ERP codes are identity: they must survive as text.
    // Canonical decimal text (no trailing zeros), as the parser normalizes the XML lexeme.
    products.push({ code: `0${1 + (i % 3)}.${String(i).padStart(4, "0")}.${String(next() % 100).padStart(2, "0")}`,
      name: `Produto Sintético ${i + 1} — Ç/Á`, unit: units[i % units.length], quantity: decAdd(quantity, "0"), unitCost: decAdd(unitCost, "0") });
  }
  const withTotals = products.map((p) => ({ ...p, total: decMul(p.quantity, p.unitCost) }));
  const desc = (a, b) => (BigInt(fixed(b.total).units) * 10n ** BigInt(fixed(a.total).scale) > BigInt(fixed(a.total).units) * 10n ** BigInt(fixed(b.total).scale) ? 1 : -1);
  // ERP classes as printed groups (not recalculated here): top 10% A, next 20% B, rest C.
  return withTotals.sort(desc).map((p, i) => ({ ...p, cls: i < count * 0.1 ? "A" : i < count * 0.3 ? "B" : "C" }));
}

const BR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * Builds the workbook bytes. `products` carry string decimals; totals are exact q×p unless
 * the caller overrides `total` (to exercise tolerances).
 */
export function erpWorkbook({
  branch = "0001", branchName = "Filial Sintética", month = "2026-08",
  basis = "Custo Médio Líquido da Época", products = syntheticProducts(), sheetName = "Curva ABC Geral (Realizado)",
} = {}) {
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const start = `${month}-01`, end = `${month}-${String(last).padStart(2, "0")}`;
  const strings = [], index = new Map();
  const s = (value) => {
    if (!index.has(value)) { index.set(value, strings.length); strings.push(value); }
    return index.get(value);
  };
  // Style indexes: 0 default, 1 bold text, 2 #,##0.000 quantity, 3 #,##0.00000 cost, 4 #,##0.00 money, 5 0.00% share.
  const rows = [];
  const row = (n, cells) => rows.push(`<row r="${n}" spans="1:8">${cells.join("")}</row>`);
  const t = (ref, value, style = 0) => `<c r="${ref}" s="${style}" t="s"><v>${s(value)}</v></c>`;
  const n = (ref, value, style) => `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  const blank = (ref) => `<c r="${ref}" s="1"/>`;
  row(1, [t("A1", "Unidade:", 1), t("B1", branch), t("C1", branchName), blank("D1"), t("E1", "Estoque: Todos"), blank("F1"), t("G1", "Depósito: Todos"), blank("H1")]);
  row(2, [t("A2", `Período: ${BR(start)} a ${BR(end)}`, 1), blank("B2"), t("E2", `Tipo de Custo: ${basis}`), blank("F2")]);
  row(3, [t("A3", "Produto: Todos")]);
  row(4, [blank("A4"), t("E4", "Consumo", 1), t("H4", "Percentual", 1)]);
  row(5, ["Código", "Nome do Produto", null, "UN", "Realizado", "Custo Unit.", "Custo Total", "Sobre Total"]
    .map((h, i) => (h ? t(`${"ABCDEFGH"[i]}5`, h, 1) : blank("C5"))));
  const grand = decSum(products.map((p) => p.total));
  let r = 6;
  for (const cls of ["A", "B", "C"]) {
    const group = products.filter((p) => p.cls === cls);
    if (!group.length) continue;
    row(r++, [t(`A${r - 1}`, `Curva ${cls}`, 1)]);
    for (const p of group) {
      const x = r++;
      row(x, [t(`A${x}`, p.code), t(`B${x}`, p.name), t(`D${x}`, p.unit), n(`E${x}`, p.quantity, 2), n(`F${x}`, p.unitCost, 3),
        n(`G${x}`, p.total, 4), n(`H${x}`, share(p.total, grand), 5)]);
    }
    const sub = decSum(group.map((p) => p.total));
    row(r, [t(`E${r}`, `Total da Curva ${cls}`, 1), n(`G${r}`, sub, 4), n(`H${r}`, share(sub, grand), 5)]);
    r++;
  }
  row(r, [t(`E${r}`, "Total Geral", 1), n(`G${r}`, grand, 4)]);
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${MAIN}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:H${r}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="18" customWidth="1"/><col min="2" max="2" width="48" customWidth="1"/></cols><sheetData>${rows.join("")}</sheetData><mergeCells count="2"><mergeCell ref="C1:D1"/><mergeCell ref="A2:D2"/></mergeCells><pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
  const shared = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="${MAIN}" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((v) => `<si><t xml:space="preserve">${esc(v)}</t></si>`).join("")}</sst>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${MAIN}"><numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0.000"/><numFmt numFmtId="165" formatCode="#,##0.00000"/><numFmt numFmtId="166" formatCode="#,##0.00"/><numFmt numFmtId="167" formatCode="0.00%"/></numFmts><fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const T = "application/vnd.openxmlformats-officedocument";
  const parts = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${T}.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${T}.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="${T}.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="${T}.spreadsheetml.sharedStrings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="${T}.extended-properties+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    "docProps/core.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>ERP sintético</dc:creator></cp:coreProperties>`,
    "docProps/app.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>ERP sintético</Application></Properties>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${MAIN}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    "xl/styles.xml": styles,
    "xl/sharedStrings.xml": shared,
    "xl/worksheets/sheet1.xml": sheet,
  };
  const bytes = zipSync(Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, [strToU8(v), { level: 6 }]])));
  return { bytes, start, end, grand, rowCount: r, products };
}

/** What "open and save in Excel" typically adds: a theme part the ERP export does not have. */
export function withExcelTheme(bytes) {
  const parts = Object.fromEntries(Object.entries(unzipSync(bytes)).map(([k, v]) => [k, new TextDecoder().decode(v)]));
  parts["xl/theme/theme1.xml"] = '<?xml version="1.0"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office"/>';
  parts["[Content_Types].xml"] = parts["[Content_Types].xml"].replace("</Types>",
    '<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>');
  parts["xl/_rels/workbook.xml.rels"] = parts["xl/_rels/workbook.xml.rels"].replace("</Relationships>",
    '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>');
  return zipSync(Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, [strToU8(v), { level: 6 }]])));
}
