/**
 * Exact decimal arithmetic on canonical strings using BigInt fixed point. Money and
 * quantities must never be converted to JS numbers (binary floating point).
 * Canonical form: optional "-", integer without leading zeros, fraction without trailing zeros.
 */
type Fixed = { units: bigint; scale: number };

const CANONICAL = /^-?(0|[1-9]\d*)(\.\d*[1-9])?$/;

export function isCanonical(value: string): boolean {
  return CANONICAL.test(value) && value !== "-0";
}

function parse(value: string): Fixed {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!m) throw new Error(`Decimal inválido: ${value}`);
  const fraction = m[3] ?? "";
  const units = BigInt(m[2] + fraction);
  return { units: m[1] ? -units : units, scale: fraction.length };
}

function align(a: Fixed, b: Fixed): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale);
  return [a.units * 10n ** BigInt(scale - a.scale), b.units * 10n ** BigInt(scale - b.scale), scale];
}

function format(units: bigint, scale: number): string {
  const negative = units < 0n;
  let digits = (negative ? -units : units).toString().padStart(scale + 1, "0");
  let int = digits.slice(0, digits.length - scale);
  let fraction = scale ? digits.slice(digits.length - scale) : "";
  fraction = fraction.replace(/0+$/, "");
  int = int.replace(/^0+(?=\d)/, "");
  digits = fraction ? `${int}.${fraction}` : int;
  return negative && digits !== "0" ? `-${digits}` : digits;
}

/** Normalizes any plain decimal ("1.500", "007") to canonical form. */
export function canonical(value: string): string {
  const v = parse(value);
  return format(v.units, v.scale);
}

export function add(a: string, b: string): string {
  const [x, y, s] = align(parse(a), parse(b));
  return format(x + y, s);
}

export function sub(a: string, b: string): string {
  const [x, y, s] = align(parse(a), parse(b));
  return format(x - y, s);
}

export function mul(a: string, b: string): string {
  const x = parse(a);
  const y = parse(b);
  return format(x.units * y.units, x.scale + y.scale);
}

export function cmp(a: string, b: string): -1 | 0 | 1 {
  const [x, y] = align(parse(a), parse(b));
  return x < y ? -1 : x > y ? 1 : 0;
}

export function abs(a: string): string {
  return a.startsWith("-") ? a.slice(1) : a;
}

export function sum(values: string[]): string {
  return values.reduce(add, "0");
}

/** |a − b| ≥ limit, compared exactly. */
export function differsBy(a: string, b: string, limit: string): boolean {
  return cmp(abs(sub(a, b)), limit) >= 0;
}
