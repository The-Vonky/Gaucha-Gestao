import { describe, expect, it } from "vitest";
import writeExcelFile from "write-excel-file/node";
import readExcelFile from "read-excel-file/node";
import { unzipSync } from "fflate";
import { exportSheets, moneyCell, textCell } from "../apps/web/src/modules/sales/export/workbook";
import { cents } from "../apps/web/src/modules/sales/export/api";
import { exportFilename } from "../apps/web/src/modules/sales/export/download";
import { exportFixture } from "./fixtures/sales-export";
import type { SalesExport } from "../apps/web/src/modules/sales/export/types";

async function inspect(report: SalesExport) {
  const buffer = await writeExcelFile(exportSheets(report)).toBuffer();
  const parsed = await readExcelFile(buffer, { trim: false });
  const archive = unzipSync(buffer);
  for (const [name, content] of Object.entries(archive)) {
    if (!/\.xml$|\.rels$/.test(name)) continue;
    const xml = new TextDecoder().decode(content);
    expect(xml, name).not.toMatch(/<f(?:\s|>)/i);
    expect(xml, name).not.toMatch(/<hyperlinks?|TargetMode="External"|oleObject|ddeLink|externalLink|vbaProject/i);
  }
  return { parsed, buffer, styles: new TextDecoder().decode(archive["xl/styles.xml"]), xml: new TextDecoder().decode(archive["xl/worksheets/sheet1.xml"]) };
}
describe("VEN-05A — XLSX real e precisão de readback", () => {
  it("abas, colunas, competência sem dia, fuso e metadados", async () => {
    const report = exportFixture(), { parsed, xml, styles } = await inspect(report);
    expect(parsed.map(s => s.sheet)).toEqual(["Lançamentos", "Ajustes mensais", "Resumo"]);
    expect(parsed[0].data[4].slice(0, 5)).toEqual(["01/09/2026", report.units[0].name, "A", "Stone", 0.01]);
    expect(parsed[1].data[1][0]).toBe("09/2026");
    const meta = parsed[2].data;
    expect(meta.find(r => r[0] === "Total consolidado (R$)")?.[1]).toBe(0.11);
    expect(meta.find(r => r[0] === "Gerado em (America/Sao_Paulo)")?.[1]).toContain("02/11/2026");
    expect(meta.find(r => r[0] === "Gerado em (America/Sao_Paulo)")?.[1]).toContain("23:59:59");
    expect(parsed[0].data[3]).toEqual(["Data", "Unidade", "Código da unidade", "Forma de pagamento", "Valor (R$)", "Lançado por", "Última atualização (America/Sao_Paulo)"]);
    expect(parsed[0].data[4][5]).toBe("Pessoa sintética Á 😀");
    expect(parsed[0].data.at(-1)?.[0]).toBe("Total exportado");
    expect(parsed[0].data.at(-1)?.[4]).toBe(0.01);
    expect(parsed[0].data[4]).toHaveLength(7);
    expect(parsed[1].data[0]).toEqual(["Competência", "Unidade", "Código da unidade", "Forma de pagamento", "Valor do ajuste (R$)", "Justificativa", "ID do ajuste", "ID da unidade"]);
    expect(parsed[1].data[1][4]).toBe(0.10);
    expect(meta.filter(r => /Total/.test(String(r[0]))).map(r => r[0])).toEqual(["Total de lançamentos (R$)", "Total de ajustes (R$)", "Total consolidado (R$)"]);
    expect(styles).toContain('formatCode="&quot;R$&quot; #,##0.00"');
    expect(xml).toContain('state="frozen"');
    expect(xml).toContain('ySplit="4"');
    expect(xml).toContain('mergeCell ref="A1:G1"');
    expect(xml).toMatch(/<c[^>]*r="E5"[^>]*><v>0\.01<\/v>/);
    expect(xml).toMatch(/<c[^>]*r="F5"[^>]*t="(?:s|inlineStr)"/);
    expect(exportFilename(report)).toBe("historico-filtrado-01-09-2026-30-09-2026-1total.xlsx");
    expect(exportFilename({ ...report, mode: "full" })).toBe("historico-completo-01-09-2026-30-09-2026-1total.xlsx");
  });
  it.each(["0.01", "0.10", "0.29", "1.15", "999999999999.99", "9999999999999.99", "10000000000000.01", "99999999999999.99", "19999999999999999.98"])("roundtrip de %s e política de 15 algarismos", async value => {
    const cell = moneyCell(value);
    const b = await writeExcelFile([{ sheet: "Precisão", data: [[cell]] }]).toBuffer();
    const data = (await readExcelFile(b))[0].data;
    const readback = typeof data[0][0] === "number" ? data[0][0].toFixed(2) : String(data[0][0]);
    expect(cents(readback)).toBe(cents(value));
    expect(data[0]).toHaveLength(1);
    expect(cell?.type).toBe(cents(value).toString().length > 15 ? String : Number);
  });
  it.each(["=HYPERLINK(\"https://evil.test\",\"x\")", "+cmd", "-1+1", "@SUM(A1)", " \t=1+1", "\r\n+cmd", "\u0000\u0001\u000b=1", "Unicode Á 汉字 😀 �", "X".repeat(8000)])("texto de unidade/código/justificativa é dado: %s", async value => {
    const report = exportFixture();
    report.units[0].name = value; report.units[0].code = value; report.rows[1].reason = value; report.rows[0].created_by_name = value;
    const { parsed } = await inspect(report);
    const expected = textCell(value)?.value;
    expect(parsed[0].data[4][1]).toBe(expected);
    expect(parsed[0].data[4][2]).toBe(expected);
    expect(parsed[0].data[4][5]).toBe(expected);
    expect(parsed[1].data[1][5]).toBe(expected);
    expect(typeof parsed[1].data[1][5]).toBe("string");
  });
  it("sem ajuste omite a aba; vazio mantém cabeçalho e resumo de zero", async () => {
    const report = exportFixture(); report.rows = [report.rows[0]];
    report.record_count = report.entry_count = report.next_offset = 1;
    report.adjustment_count = 0; report.adjustment_total = "0.00"; report.total = "0.01";
    expect((await inspect(report)).parsed.map(s => s.sheet)).toEqual(["Lançamentos", "Resumo"]);
    report.rows = []; report.record_count = report.entry_count = report.next_offset = 0;
    report.entry_total = report.total = "0.00";
    expect((await inspect(report)).parsed[0].data).toHaveLength(5);
    expect(() => textCell("A".repeat(32768))).toThrow("limite");
  });
  it("20.000 linhas reconciliadas pelo readback, total grande vira texto sem arredondar", async () => {
    const report = exportFixture(), n = 20000;
    report.rows = Array.from({ length: n }, (_, i) => ({ ...report.rows[0], id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`, amount: "999999999999.99" }));
    report.entry_count = report.record_count = report.next_offset = n; report.adjustment_count = 0;
    report.entry_total = report.total = "19999999999999800.00"; report.adjustment_total = "0.00";
    const start = performance.now(); const { parsed, buffer } = await inspect(report);
    const amounts = parsed[0].data.slice(4, -1);
    expect(amounts).toHaveLength(n);
    const total = amounts.reduce((sum, r) => sum + cents((r[4] as number).toFixed(2)), 0n);
    expect(total).toBe(cents(report.total));
    expect(amounts.every(r => r.length === 7 && cents((r[4] as number).toFixed(2)) === 99999999999999n)).toBe(true);
    expect(parsed[0].data.at(-1)?.[4]).toBe(report.entry_total);
    const meta = parsed.at(-1)!.data;
    expect(meta.find(r => r[0] === "Total consolidado (R$)")?.[1]).toBe(report.total);
    expect(buffer.byteLength).toBeLessThan(20 * 1024 * 1024);
    console.info(`VEN-05A XLSX 20000: ${Math.round(performance.now() - start)}ms, ${buffer.byteLength} bytes; diferença=0 centavos`);
  }, 30_000);
  it("nome de arquivo usa recorte aplicado, conta só lançamentos e trata extremos abertos", () => {
    const report = exportFixture();
    report.filters = { from: "2026-01-01", to: "2026-12-31", method: null };
    report.entry_count = 56;
    expect(exportFilename(report)).toBe("historico-filtrado-01-01-2026-31-12-2026-56total.xlsx");
    report.filters = { from: null, to: "2026-12-31", method: null };
    expect(exportFilename(report)).toBe("historico-filtrado-01-09-2026-31-12-2026-56total.xlsx");
    report.mode = "full";
    expect(exportFilename(report)).toBe("historico-completo-01-09-2026-30-09-2026-56total.xlsx");
    report.entry_count = 0; report.entry_from = report.entry_to = null;
    expect(exportFilename(report)).toBe("historico-completo-01-09-2026-30-09-2026-0total.xlsx");
    report.adjustment_from = report.adjustment_to = null;
    expect(exportFilename(report)).toBe("historico-completo-02-11-2026-02-11-2026-0total.xlsx");
    report.entry_from = "0001-01-01"; report.entry_to = "9999-12-31";
    expect(exportFilename(report)).toBe("historico-completo-01-01-0001-31-12-9999-0total.xlsx");
  });
  it.each([undefined, null, "", "   "])("nome indisponível %s usa fallback neutro", async name => {
    const report = exportFixture(); report.rows[0].created_by_name = name;
    expect((await inspect(report)).parsed[0].data[4][5]).toBe("Não identificado");
  });
  it("não gera arquivo com total inconsistente", () => {
    const report = exportFixture(); report.total = "0.12";
    expect(() => exportSheets(report)).toThrow("reconciliação");
  });
});
