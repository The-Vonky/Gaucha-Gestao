import { describe, expect, it } from "vitest";
import { chartScale, compactMoney, compactPercent, stackCoordinates, unitColor, comparisonLabel, dashboardFilters, dashboardMoney, defaultSelection, intensity, monthStatus, percent, readSelection, selectionError, selectionParams, visualMaximum, visualRatio } from "../apps/web/src/modules/sales/dashboard";
import { dashboardFixture, A } from "./fixtures/sales-dashboard";

describe("VEN-04B — apresentação exata e geometria isolada", () => {
  it.each([["0.01", "R$ 0,01"], ["9007199254740993.01", "R$ 9.007.199.254.740.993,01"], ["-0.01", "−R$ 0,01"], [null, "Indisponível"]])("formata %s sem float", (value, output) => expect(dashboardMoney(value)).toBe(output));
  it("formata percentual sem inventar base ou arredondar dinheiro", () => {
    expect(percent(null)).toBe("Sem comparação"); expect(percent("-0.012345")).toBe("-0,012345%"); expect(percent("100.000000")).toBe("100%");
  });
  it("limita Number à geometria mesmo com valores além de MAX_VALUE", () => {
    const huge = `1${"0".repeat(400)}.00`;
    expect(visualRatio(huge, huge)).toBe(1); expect(visualRatio("-0.01", "0.02")).toBe(-0.5);
    expect(visualRatio("0.00", "0.00")).toBe(0); expect(visualMaximum(["0.01", "-50.01", "40.00"])).toBe("-50.01");
    expect(intensity("0.234567")).toBe(0.234567);
  });
  it("não transforma status indeterminado em fechado, nem null derivado em histórico indisponível", () => {
    const m = dashboardFixture().months[0];
    expect(monthStatus({ ...m, partial: null, is_closed: null, status_basis: "historical_unavailable" })).toMatch(/histórico indisponível/);
    expect(monthStatus({ ...m, partial: false, is_closed: null, status_basis: "derived" })).toBe("Completo sem fechamento confirmado · derivado");
    expect(monthStatus({ ...m, partial: false, is_closed: true })).toBe("Fechado confirmado");
    expect(monthStatus({ ...m, partial: false })).toBe("Completo sem fechamento confirmado");
    expect(comparisonLabel(m)).toBe("Referência 07/2026 · corte até dia 2");
  });
});
describe("VEN-04B — competências civis, limites e URL", () => {
  const selection = { ...defaultSelection(), from: "2026-01", to: "2026-09", baseFrom: "2026-01", baseTo: "2026-09", daily: "2026-09", unit: A };
  it("padrão Stone, roundtrip da URL e contrato RPC dia 01", () => {
    expect(defaultSelection().scope).toBe("stone"); expect(readSelection(selectionParams(selection))).toEqual(selection);
    expect(dashboardFilters(selection)).toEqual({ from: "2026-01-01", to: "2026-09-01", daily_month: "2026-09-01", unit_ids: [A], scope: "stone" });
  });
  it.each([
    { from: "2026-13" }, { from: "0000-01" }, { from: "2026-10" }, { daily: "2026-10" }, { unit: "externo" }, { scope: "PIX" },
    { day: "31", daily: "2026-09" }, { day: "0" }, { baseFrom: "2020-01" }, { from: "2024-09" },
  ])("recusa seleção inválida %j sem normalizar para todas", values => expect(selectionError({ ...selection, ...values } as typeof selection)).not.toBe(""));
  it("aceita exatamente 24 competências e datas bissextas", () => {
    expect(selectionError({ ...selection, from: "2024-10", baseFrom: "2024-10" })).toBe("");
    expect(selectionError({ ...selection, from: "2024-02", to: "2024-02", daily: "2024-02", day: "29" })).toBe("");
  });
});

describe("VEN-04B — escalas e apresentação compacta", () => {
  it("arredonda percentuais em string, com sinal, carry e valor exato preservável", () => {
    expect(compactPercent("116.666667")).toBe("116,7%");
    expect(compactPercent("-20.123456")).toBe("-20,1%");
    expect(compactPercent("99.999999")).toBe("100%");
    expect(compactPercent("0.000001")).toBe("<0,1%");
    expect(compactPercent("-0.000001")).toBe(">-0,1%");
    expect(compactPercent(null)).toBe("Sem comparação");
    expect(percent("116.666667")).toBe("116,666667%");
    expect(compactPercent("9007199254740993.150000")).toBe("9007199254740993,2%");
  });
  it("produz eixos monotônicos para negativos, zero, centavos e strings gigantes", () => {
    for (const values of [["0.00"], ["-0.01", "0.01"], ["-200.00", "-10.00"], ["0.01"], [`1${"0".repeat(400)}.00`]]) {
      const scale = chartScale(values);
      expect(scale.ticks.length).toBeGreaterThan(1);
      expect(scale.ticks.length).toBeLessThan(12);
      expect(scale.ticks.map(scale.y).every(Number.isFinite)).toBe(true);
      expect(scale.y(scale.ticks[0])).toBeGreaterThan(scale.y(scale.ticks.at(-1)!));
      for (const value of values) expect(scale.y(value)).toBeGreaterThanOrEqual(32);
    }
    expect(compactMoney("-1234567.89")).toBe("−R$ 1,2 mi");
    expect(compactMoney("0.01")).toBe("R$ 0,01");
  });
  it("mantém cores por UUID e separa pilhas positivas/negativas em centavos exatos só para geometria", () => {
    expect(unitColor(A)).toBe(unitColor(A.toUpperCase()));
    expect(stackCoordinates(["9007199254740993.01", "0.01", "-5.00", "-0.01"])).toEqual([
      { start: "0.00", end: "9007199254740993.01" },
      { start: "9007199254740993.01", end: "9007199254740993.02" },
      { start: "0.00", end: "-5.00" }, { start: "-5.00", end: "-5.01" },
    ]);
  });
});
