import { zipSync, strToU8 } from "fflate";

/** Small synthetic OOXML packages for Curva ABC import tests (port of xlsx_fixture.py). */
export type Datum = string | [kind: string, value: string];
export type Rows = Record<number, Record<string, Datum>>;

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="xml" ContentType="application/xml"/>
 <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
 <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
const workbook = (name: string) => `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
 <sheets><sheet name="${esc(name)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
export const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;
export const worksheet = (rows: string) => `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;

export function sheetXml(rows: Rows): string {
  return Object.entries(rows).map(([number, cells]) => {
    const xml = Object.entries(cells).map(([ref, datum]) => {
      const reference = /^[A-Z]+$/.test(ref) ? `${ref}${number}` : ref;
      if (Array.isArray(datum)) return `<c r="${esc(reference)}" t="${esc(datum[0])}"><v>${esc(datum[1])}</v></c>`;
      return `<c r="${esc(reference)}" t="inlineStr"><is><t>${esc(datum)}</t></is></c>`;
    }).join("");
    return `<row r="${number}">${xml}</row>`;
  }).join("");
}

export function makeParts(rows: Rows, sheetName = "Curva ABC Geral (Realizado)"): Record<string, string | Uint8Array> {
  return {
    "[Content_Types].xml": CONTENT_TYPES,
    "_rels/.rels": ROOT_RELS,
    "xl/workbook.xml": workbook(sheetName),
    "xl/_rels/workbook.xml.rels": WORKBOOK_RELS,
    "xl/worksheets/sheet1.xml": worksheet(sheetXml(rows)),
  };
}

export function zipParts(parts: Record<string, string | Uint8Array>, level: 0 | 6 = 6): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, [typeof v === "string" ? strToU8(v) : v, { level }]])));
}

export function makeXlsx(rows: Rows, sheetName?: string): Uint8Array {
  return zipParts(makeParts(rows, sheetName));
}

export function reportRows(changes: Record<string, Datum | null> = {}): Rows {
  const rows: Rows = {
    1: { A: "Unidade:", B: "0001", C: "Filial Teste", D: ["n", ""], E: "Estoque: Todos", F: ["n", ""], G: "Depósito: Todos", H: ["n", ""] },
    2: { A: "Período: 01/08/2026 a 31/08/2026", B: ["n", ""], E: "Tipo de Custo: Custo Médio Líquido da Época", F: ["n", ""] },
    3: { A: "Produto: Todos", B: ["n", ""] },
    4: { A: ["n", ""], E: "Consumo", H: "Percentual" },
    5: { A: "Código", B: "Nome do Produto", C: ["n", ""], D: "UN", E: "Realizado", F: "Custo Unit.", G: "Custo Total", H: "Sobre Total" },
    6: { A: "Curva A" },
    7: { A: "001.02", B: "Produto Sintético", D: "PC", E: ["n", "2.5"], F: ["n", "10"], G: ["n", "25"], H: ["n", "1"] },
    8: { E: "Total da Curva A", G: ["n", "25"], H: ["n", "1"] },
    9: { E: "Total Geral", G: ["n", "25"] },
  };
  for (const [key, value] of Object.entries(changes)) {
    const row = Number(key.slice(1));
    const column = key[0];
    if (value === null) delete rows[row]?.[column];
    else (rows[row] ??= {})[column] = value;
  }
  return rows;
}
