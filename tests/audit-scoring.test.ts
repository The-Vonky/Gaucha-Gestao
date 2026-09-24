import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classify,
  evaluate,
  formatScore,
  tally,
  trend,
  type Response,
} from "../apps/web/src/modules/audit/scoring";
const catalog = JSON.parse(
  readFileSync("docs/reference/AUDIT_CHECKLIST_V1.json", "utf8"),
) as {
  catalogVersion: string;
  sections: {
    key: string;
    name: string;
    items: { key: string; number: number }[];
  }[];
};
const items = catalog.sections.flatMap((s) => s.items);
const of = (...groups: [Response | null, number][]) =>
  groups.flatMap(([r, n]) => Array<Response | null>(n).fill(r));
describe("canonical checklist reference", () => {
  it("has the expected version, 9 sections and 158 items", () => {
    expect(catalog.catalogVersion).toBe("checklist-geral-2026-09-22-v1");
    expect(catalog.sections).toHaveLength(9);
    expect(items).toHaveLength(158);
  });
  it("has unique keys and numbers, missing exactly 32, 117 and 135", () => {
    expect(new Set(items.map((i) => i.key)).size).toBe(158);
    const numbers = items.map((i) => i.number);
    expect(new Set(numbers).size).toBe(158);
    const missing = Array.from({ length: 161 }, (_, i) => i + 1).filter(
      (n) => !numbers.includes(n),
    );
    expect(missing).toEqual([32, 117, 135]);
    expect(items.every((i) => /^item-\d{3}$/.test(i.key))).toBe(true);
  });
  it("matches the reference section distribution", () => {
    expect(catalog.sections.map((s) => [s.name, s.items.length])).toEqual([
      ["ESTRUTURA", 13],
      ["ORGANIZAÇÃO E LIMPEZA DA ESTRUTURA", 22],
      ["ORGANIZAÇÃO E LIMPEZA DOS EQUIPAMENTOS E UTENSÍLIOS", 16],
      ["FUNCIONAMENTO DE EQUIPAMENTOS", 21],
      ["MANIPULADORES DE ALIMENTOS", 12],
      ["PROCEDIMENTOS", 31],
      ["ESTOQUE", 10],
      ["PREPARO DO ALIMENTO", 21],
      ["PLANEJAMENTO", 12],
    ]);
  });
});
describe("audit scoring", () => {
  it("has no score and zero progress without answers", () => {
    const r = evaluate(tally(of([null, 158])));
    expect(r).toMatchObject({
      score: null,
      complete: false,
      classification: null,
    });
    expect(r.tally.answered).toBe(0);
    expect(formatScore(r.score)).toBe("—");
  });
  it("shows one AT in a draft as 100% partial without classification", () => {
    const r = evaluate(tally(of(["AT", 1], [null, 157])));
    expect(r.score).toBe(100);
    expect(r.complete).toBe(false);
    expect(r.classification).toBeNull();
  });
  it("finalizes 158 AT as 100% Adequada", () => {
    expect(evaluate(tally(of(["AT", 158])))).toMatchObject({
      score: 100,
      complete: true,
      classification: "adequate",
    });
  });
  it("finalizes 79 AT + 79 NAT as 50% Inadequada", () => {
    expect(evaluate(tally(of(["AT", 79], ["NAT", 79])))).toMatchObject({
      score: 50,
      classification: "inadequate",
    });
  });
  it("counts AP as half and excludes NAP from the denominator", () => {
    expect(evaluate(tally(of(["AP", 158]))).score).toBe(50);
    const r = evaluate(tally(of(["AT", 100], ["AP", 50], ["NAP", 8])));
    expect(r.score).toBeCloseTo((125 / 150) * 100, 10);
    expect(evaluate(tally(of(["AT", 1], ["NAP", 157]))).score).toBe(100);
  });
  it("applies the same formula to a section subset", () => {
    const section = evaluate(tally(of(["AT", 10], ["NAT", 2], ["AP", 1])));
    expect(section.score).toBeCloseTo(((10 + 0.5) / 13) * 100, 10);
    expect(section.classification).toBe("adequate");
  });
  it("leaves all-NAP undefined without dividing by zero", () => {
    expect(evaluate(tally(of(["NAP", 158])))).toMatchObject({
      score: null,
      complete: true,
      classification: null,
    });
  });
  it("classifies on the unrounded score", () => {
    expect(classify(50.99)).toBe("inadequate");
    expect(classify(51)).toBe("partial");
    expect(classify(75.99)).toBe("partial");
    expect(classify(75.96)).toBe("partial");
    expect(formatScore(75.96)).toBe("76,0%");
    expect(classify(76)).toBe("adequate");
    // Exact integer thresholds reached from counts.
    expect(evaluate(tally(of(["AT", 19], ["NAT", 6]))).score).toBe(76);
    expect(evaluate(tally(of(["AT", 51], ["NAT", 49]))).score).toBe(51);
  });
  it("treats deltas below 0.5 p.p. as stable", () => {
    expect(trend(80, 79.6)?.direction).toBe("stable");
    expect(trend(80, 79.5)?.direction).toBe("up");
    expect(trend(70, 80)?.direction).toBe("down");
    expect(trend(null, 80)).toBeNull();
  });
});
