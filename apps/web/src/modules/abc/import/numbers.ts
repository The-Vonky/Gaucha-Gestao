import { canonical, cmp, mul } from "./decimal";

/** Validated source-number conversion without binary floating point (port of numbers.py). */
const XML_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/;
const TEXT_NUMBER = /^[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/;

export class NumberError extends Error {
  constructor(public readonly code: "MISSING_NUMBER" | "INVALID_NUMBER" | "NUMBER_LIMIT" | "PERCENTAGE_RANGE") {
    super(code);
  }
}

function limits(digits: string, integerPlaces: number, decimalPlaces: number) {
  const significant = Math.max(1, digits.replace(/^0+/, "").length);
  if (significant > 40 || decimalPlaces > 24 || integerPlaces > 19) throw new NumberError("NUMBER_LIMIT");
}

/** Returns a canonical non-negative decimal string. */
export function parseDecimal(value: string | null, numeric: boolean): string {
  if (value === null || !value.trim()) throw new NumberError("MISSING_NUMBER");
  const text = value.trim();
  let plain: string;
  if (numeric) {
    if (!XML_NUMBER.test(text)) throw new NumberError("INVALID_NUMBER");
    const [coefficient, exponentText = ""] = text.toLowerCase().split("e");
    if (exponentText.replace(/^[+-]/, "").length > 6) throw new NumberError("NUMBER_LIMIT");
    const exponent = Number(exponentText || "0");
    const sign = coefficient.startsWith("-") ? "-" : "";
    const unsigned = coefficient.replace(/^[+-]/, "");
    const fraction = unsigned.split(".")[1] ?? "";
    const digits = unsigned.replace(".", "");
    limits(digits, digits.length - fraction.length + exponent, Math.max(0, fraction.length - exponent));
    const scale = fraction.length - exponent;
    const body = scale <= 0 ? digits + "0".repeat(-scale)
      : digits.padStart(scale + 1, "0").replace(new RegExp(`(\\d{${scale}})$`), ".$1");
    plain = canonical(sign + body);
  } else {
    if (!TEXT_NUMBER.test(text)) throw new NumberError("INVALID_NUMBER");
    const normalized = text.replace(/\./g, "").replace(",", ".");
    const unsigned = normalized.replace(/^[+-]/, "");
    const fraction = unsigned.split(".")[1] ?? "";
    const digits = unsigned.replace(".", "");
    limits(digits, digits.length - fraction.length, fraction.length);
    plain = canonical(normalized.replace(/^\+/, ""));
  }
  if (cmp(plain, "0") < 0 || cmp(plain, "1000000000000000000") > 0) throw new NumberError("NUMBER_LIMIT");
  return plain;
}

/** Share as a fraction 0–1. Text must carry an explicit "%" suffix. */
export function parseShare(value: string | null, numeric: boolean): string {
  let result: string;
  if (numeric) result = parseDecimal(value, true);
  else if (value === null || !value.trim()) result = parseDecimal(value, false);
  else if (value.trim().endsWith("%")) result = mul(parseDecimal(value.trim().slice(0, -1), false), "0.01");
  else throw new NumberError("INVALID_NUMBER");
  if (cmp(result, "0") < 0 || cmp(result, "1") > 0) throw new NumberError("PERCENTAGE_RANGE");
  return result;
}
