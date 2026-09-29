import { describe, expect, it } from "vitest";
import writeExcelFile from "write-excel-file/node";
import readExcelFile from "read-excel-file/node";
import { unzipSync } from "fflate";
import { filename } from "../apps/web/src/modules/audit/reporting/download";
import { sheets } from "../apps/web/src/modules/audit/reporting/workbook";
import type { Counts, HistoryReport, InspectionReport } from "../apps/web/src/modules/audit/reporting/types";

const id = "00000000-0000-0000-0000-000000000001";
const counts: Counts = { total: 158, answered: 1, unanswered: 157, applicable: 1, at: 0, ap: 1, nat: 0, nap: 0 };
const common = { schema_version: 1 as const, generated_at: "2026-09-29T12:13:14.000Z", display_timezone: "America/Sao_Paulo" as const,
  generated_by: { id, name: "=NOME\n😀" }, unit: { id, code: "+CODE", name: "@Unidade Á" } };
const inspection: InspectionReport = { ...common, kind: "inspection", record_count: 1,
  inspection: { id, template_version: "v1", applied_on: "2026-09-29", previous_visit_on: null,
    responsible_id: id, responsible_name: "-Responsável", status: "draft", counts,
    progress_percent: 100 / 158, score: 50, classification: null,
    finalized_at: null, finalized_by: null, version: 1, created_at: common.generated_at, updated_at: common.generated_at },
  sections: Array.from({ length: 9 }, (_, index) => ({ key: `section-${index}`, position: index + 1,
    name: `Seção ${index + 1}`, counts, score: index === 0 ? 50 : null, complete: false, classification: null,
    items: Array.from({ length: index === 0 ? 22 : 17 }, (_, position) => ({ key: `item-${index}-${position}`,
      position: position + 1, number: position + 1, text: "Critério <script>" + "Á".repeat(300),
      response: index === 0 && position === 0 ? "AP" as const : null,
      observation: index === 0 && position === 0 ? "=SUM(1,2)\n+cmd\n-1\n@evil <img> 😀" : "",
      version: 1, updated_at: common.generated_at })) })) };
// 22 + 8 × 17 = 158.
const history: HistoryReport = { ...common, kind: "unit_history", filters: { from: null, to: null },
  ordering: "applied_on DESC, created_at DESC, id DESC", record_count: 1,
  records: [{ ...inspection.inspection, delta_pp: null }] };

async function inspect(report: InspectionReport | HistoryReport) {
  const buffer = await writeExcelFile(sheets(report)).toBuffer();
  const parsed = await readExcelFile(buffer);
  const entries = unzipSync(new Uint8Array(buffer));
  const names = Object.keys(entries);
  expect(names.some((name) => /externalLinks|vbaProject|\.bin$|connections\.xml/i.test(name))).toBe(false);
  for (const [name, value] of Object.entries(entries)) {
    if (!name.endsWith(".xml") && !name.endsWith(".rels")) continue;
    const xml = new TextDecoder().decode(value);
    expect(xml, name).not.toMatch(/<f(?:\s|>)/);
    expect(xml, name).not.toMatch(/TargetMode="External"|<hyperlink(?:\s|>)/i);
  }
  return { parsed, entries };
}
describe("Audit XLSX", () => {
  it("writes all 158 criteria and nine sections as strings and numbers without executable content", async () => {
    const { parsed, entries } = await inspect(inspection);
    expect(parsed.map((sheet) => sheet.sheet)).toEqual(["Resumo", "Checklist", "Secoes"]);
    const checklist = parsed[1].data;
    expect(checklist).toHaveLength(159);
    expect(checklist[1][2]).toBe("item-0-0");
    expect(typeof checklist[1][2]).toBe("string");
    expect(checklist[1][6]).toBe("=SUM(1,2)\n+cmd\n-1\n@evil <img> 😀");
    expect(typeof checklist[1][3]).toBe("number");
    expect(parsed[2].data).toHaveLength(10);
    const resumo = parsed[0].data;
    expect(resumo.find((r) => r[0] === "Unidade")?.[1]).toBe("@Unidade Á");
    expect(resumo.find((r) => r[0] === "Conformidade parcial (%)")?.[1]).toBe(50);
    expect(resumo.find((r) => r[0] === "Sem resposta")?.[1]).toBe(157);
    expect(Object.keys(entries).filter((name) => name.startsWith("xl/worksheets/sheet"))).toHaveLength(3);
    expect(filename(inspection)).toBe(`auditoria-${id}-20260929121314.xlsx`);
  });
  it("keeps an undefined result blank and zero history explicit", async () => {
    const blank = { ...inspection, inspection: { ...inspection.inspection, score: null } };
    const result = await inspect(blank);
    expect(result.parsed[0].data.find((r) => r[0] === "Conformidade parcial (%)")?.[1]).toBeNull();
    const empty: HistoryReport = { ...history, record_count: 0, records: [] };
    const parsed = (await inspect(empty)).parsed;
    expect(parsed.map((sheet) => sheet.sheet)).toEqual(["Historico", "Metadados"]);
    expect(parsed[0].data).toHaveLength(1);
    expect(parsed[1].data.find((r) => r[0] === "Registros")?.[1]).toBe(0);
  });
  it("labels draft partial and finalized results and keeps deltas numeric", async () => {
    const final: HistoryReport = { ...history, record_count: 2, records: [
      { ...inspection.inspection, status: "finalized", score: 76, classification: "adequate", delta_pp: 25, finalized_at: common.generated_at },
      history.records[0],
    ] };
    const rows = (await inspect(final)).parsed[0].data;
    expect(rows[1][17]).toBeNull();
    expect(rows[1][18]).toBe(76);
    expect(rows[1][20]).toBe(25);
    expect(rows[2][17]).toBe(50);
    expect(rows[2][18]).toBeNull();
    expect(rows[2][20]).toBeNull();
  });
  it("serializes all 5000 history rows within the supported bound", async () => {
    const maximum: HistoryReport = { ...history, record_count: 5000,
      records: Array.from({ length: 5000 }, (_, index) => ({ ...history.records[0],
        id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}` })) };
    const before = performance.now();
    const buffer = await writeExcelFile(sheets(maximum)).toBuffer();
    const parsed = await readExcelFile(buffer);
    expect(parsed[0].data).toHaveLength(5001);
    expect(parsed[1].data.find((r) => r[0] === "Registros")?.[1]).toBe(5000);
    console.info(`Reporting 5000 XLSX Node: ${Math.round(performance.now() - before)}ms, ${buffer.byteLength} bytes`);
  }, 30000);
});
