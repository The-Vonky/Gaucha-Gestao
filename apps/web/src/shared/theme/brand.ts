/*
 * Organization branding (white-label). A brand is DATA, never CSS: only the keys
 * below reach the page, always as `--brand-*` custom properties whose names are
 * fixed by this module. There is no free-form CSS, no URL and no uploaded logo.
 * See docs/decisions/ADR-009-white-label-design-tokens.md.
 */
import { isHexColor } from "./contrast";

export const SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type ScaleStep = (typeof SCALE_STEPS)[number];
export type ColorScale = Record<ScaleStep, string>;
export const BRAND_SCALES = ["primary", "accent"] as const;
export type BrandScale = (typeof BRAND_SCALES)[number];

export interface BrandConfig {
  /** Stable slug (`a-z`, `0-9`, `-`). */
  id: string;
  name: string;
  shortName: string;
  /** 1–3 letters or digits drawn as the mark; replaces a logo in this increment. */
  monogram: string;
  /** Demonstration identity: must be labelled as fictitious wherever it is shown. */
  fictitious: boolean;
  /** primary: actions, links, focus, selection. accent: brand-surface highlights only. */
  colors: Record<BrandScale, ColorScale>;
}

const ID = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const MONOGRAM = /^[\p{L}\p{N}]{1,3}$/u;

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max && !/[<>{};]/.test(trimmed)
    ? trimmed
    : null;
}

function scale(value: unknown): ColorScale | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const result = {} as ColorScale;
  for (const step of SCALE_STEPS) {
    const color = source[step];
    if (!isHexColor(color)) return null;
    result[step] = color.toLowerCase();
  }
  return result;
}

/**
 * Validates untrusted brand data (future: a tenant row). Returns a new object with
 * only the known keys, or null. Callers fall back to the default brand on null.
 */
export function sanitizeBrand(input: unknown): BrandConfig | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const colors = raw.colors as Record<string, unknown> | undefined;
  const id = typeof raw.id === "string" && ID.test(raw.id) ? raw.id : null;
  const name = text(raw.name, 60);
  const shortName = text(raw.shortName, 24);
  const monogram = typeof raw.monogram === "string" && MONOGRAM.test(raw.monogram) ? raw.monogram : null;
  const primary = scale(colors?.primary);
  const accent = scale(colors?.accent);
  if (!id || !name || !shortName || !monogram || !primary || !accent) return null;
  return { id, name, shortName, monogram, fictitious: raw.fictitious === true, colors: { primary, accent } };
}

/** The only bridge from brand data to CSS: fixed property names, validated hex values. */
export function brandStyle(brand: BrandConfig): Record<string, string> {
  const style: Record<string, string> = {};
  for (const name of BRAND_SCALES)
    for (const step of SCALE_STEPS) style[`--brand-${name}-${step}`] = brand.colors[name][step];
  return style;
}

function toScale(values: readonly string[]): ColorScale {
  return Object.fromEntries(SCALE_STEPS.map((step, i) => [step, values[i]])) as ColorScale;
}

/** Neutral platform identity used when an organization has no brand of its own. */
export const DEFAULT_BRAND: BrandConfig = {
  id: "hub",
  name: "Hub padrão",
  shortName: "Hub padrão",
  monogram: "H",
  fictitious: true,
  colors: {
    // Corporate blue: 600 carries white text at 6.2:1.
    primary: toScale(["#eef3ff", "#dce6fd", "#c0d2fb", "#94b2f7", "#6a8ff1", "#4870e8", "#2f55d4", "#2443b0", "#1f398d", "#1d3370", "#141f42"]),
    accent: toScale(["#e9fbfb", "#c9f3f3", "#9ae7e8", "#5fd3d6", "#2fb8bd", "#18999f", "#127a81", "#126268", "#134f55", "#133f45", "#062a2f"]),
  },
};

export { toScale as brandScale };
