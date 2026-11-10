/** WCAG 2.x contrast helpers. Pure functions, used by the gallery and the tests. */
const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

/** Accepts `#rrggbb` or the `rgb(r, g, b)` / `rgb(r g b)` form browsers report. */
export function parseColor(value: string): [number, number, number] | null {
  const text = value.trim();
  if (HEX.test(text))
    return [1, 3, 5].map((i) => parseInt(text.slice(i, i + 2), 16)) as [
      number,
      number,
      number,
    ];
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i.exec(text);
  if (!rgb) return null;
  // Translucent colours cannot be measured without knowing what is behind them.
  if (rgb[4] !== undefined && parseFloat(rgb[4]) < (rgb[4].endsWith("%") ? 100 : 1)) return null;
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** Contrast ratio between two opaque colours, or null when one cannot be read. */
export function contrastRatio(a: string, b: string): number | null {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return null;
  const [hi, lo] = [relativeLuminance(ca), relativeLuminance(cb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA thresholds: body text 4.5, large text and UI parts (borders, focus) 3. */
export const AA = { text: 4.5, ui: 3 } as const;
