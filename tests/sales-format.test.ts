import { describe, expect, it } from "vitest";
import { amountInput, money, parseAmount, validDate } from "../apps/web/src/modules/sales/format";
describe("VEN-04A — dinheiro e data civil", () => {
  it.each([["0,01", "0.01"], ["1.250,30", "1250.30"], ["999.999.999.999,99", "999999999999.99"], ["0001,2", "1.20"], ["1", "1.00"], ["0,29", "0.29"]])("preserva %s exatamente", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
    expect(parseAmount(amountInput(expected))).toBe(expected);
  });
  it.each(["0", "0,00", "-1", "+1", "1.23", "1,234", "1e2", "NaN", "1,", "1.000.000.000.000", "1.25,30", ""]) ("rejeita %s sem arredondar", input => expect(() => parseAmount(input)).toThrow());
  it("formata limite e centavos sem conversão numérica", () => {
    expect(money("999999999999.99")).toBe("R$ 999.999.999.999,99");
    expect(money("0.01")).toBe("R$ 0,01");
    expect(validDate("2024-02-29")).toBe(true);
    for (const date of ["2026-02-29", "0000-01-01", "infinity", "2026-2-1"]) expect(validDate(date)).toBe(false);
  });
});
