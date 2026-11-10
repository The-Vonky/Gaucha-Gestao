import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AA, contrastRatio, isHexColor, parseColor } from "../apps/web/src/shared/theme/contrast";
import {
  BRAND_SCALES,
  DEFAULT_BRAND,
  SCALE_STEPS,
  brandStyle,
  sanitizeBrand,
  type BrandConfig,
} from "../apps/web/src/shared/theme/brand";
import { CONTRAST_PAIRS } from "../apps/web/src/shared/theme/contrastPairs";
import { DEMO_BRANDS, EMPRESA_A, EMPRESA_B, findDemoBrand } from "../apps/web/src/design-system/brands";

const read = (path: string) => readFileSync(new URL(`../apps/web/src/${path}`, import.meta.url), "utf8");

/** Declarations of each top-level rule (theme.css has no nesting or @media). */
function rules(css: string): Map<string, Record<string, string>> {
  const result = new Map<string, Record<string, string>>();
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [, selector, body] of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations: Record<string, string> = {};
    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
      declarations[name] = value.replace(/\s+/g, " ").trim();
    result.set(selector.trim(), declarations);
  }
  return result;
}

function resolver(env: Record<string, string>) {
  const resolve = (value: string, depth = 0): string => {
    if (depth > 10) throw new Error(`Referência circular: ${value}`);
    return value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => {
      if (!(name in env)) throw new Error(`Token não definido: ${name}`);
      return resolve(env[name], depth + 1);
    });
  };
  return (token: string) => resolve(`var(${token})`);
}

const theme = rules(read("shared/theme/theme.css"));
const primitives = theme.get(":root")!;
const common = theme.get(".hub-theme")!;
const modes = {
  light: theme.get('.hub-theme[data-theme="light"]')!,
  dark: theme.get('.hub-theme[data-theme="dark"]')!,
};

describe("contraste WCAG", () => {
  it("calcula as razões de referência", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });
  it("lê hex e rgb opacos e recusa cores translúcidas ou inválidas", () => {
    expect(parseColor("rgb(47, 85, 212)")).toEqual([47, 85, 212]);
    expect(parseColor("rgb(47 85 212 / 1)")).toEqual([47, 85, 212]);
    expect(parseColor("rgb(0 0 0 / 0.5)")).toBeNull();
    expect(parseColor("red")).toBeNull();
    expect(contrastRatio("#fff", "#000000")).toBeNull();
    expect(isHexColor("#12abef")).toBe(true);
    expect(isHexColor("#12abef; background:url(x)")).toBe(false);
  });
});

describe("marca da organização (dados, não CSS)", () => {
  it("as três configurações de demonstração são válidas e identificadas como fictícias", () => {
    expect(DEMO_BRANDS.map((b) => b.id)).toEqual(["hub", "empresa-a", "empresa-b"]);
    for (const brand of DEMO_BRANDS) {
      expect(sanitizeBrand(brand)).toEqual(brand);
      expect(brand.fictitious).toBe(true);
    }
    expect(EMPRESA_A.name).toMatch(/fictícia/);
    expect(EMPRESA_B.name).toMatch(/fictícia/);
  });
  it("recusa valores que poderiam injetar CSS ou marcação", () => {
    const tamper = (patch: (b: Record<string, unknown>) => void) => {
      const copy = structuredClone(EMPRESA_A) as unknown as Record<string, unknown>;
      patch(copy);
      return sanitizeBrand(copy);
    };
    expect(tamper((b) => ((b.colors as BrandConfig["colors"]).primary[600] = "red;background:url(//x)"))).toBeNull();
    expect(tamper((b) => ((b.colors as BrandConfig["colors"]).accent[50] = "var(--x)"))).toBeNull();
    expect(tamper((b) => delete (b.colors as Record<string, Record<number, string>>).primary[950])).toBeNull();
    expect(tamper((b) => (b.id = "../empresa"))).toBeNull();
    expect(tamper((b) => (b.name = "<img src=x>"))).toBeNull();
    expect(tamper((b) => (b.monogram = "ABCD"))).toBeNull();
    expect(sanitizeBrand(null)).toBeNull();
    expect(sanitizeBrand("empresa-a")).toBeNull();
  });
  it("descarta chaves desconhecidas e normaliza hex", () => {
    const input = { ...structuredClone(EMPRESA_B), css: "body{display:none}", logoUrl: "https://x" };
    input.colors.primary[600] = "#137D55";
    const safe = sanitizeBrand(input)!;
    expect(Object.keys(safe).sort()).toEqual(["colors", "fictitious", "id", "monogram", "name", "shortName"]);
    expect(Object.keys(safe.colors).sort()).toEqual(["accent", "primary"]);
    expect(safe.colors.primary[600]).toBe("#137d55");
  });
  it("gera somente propriedades --brand-* conhecidas", () => {
    const style = brandStyle(DEFAULT_BRAND);
    expect(Object.keys(style)).toHaveLength(BRAND_SCALES.length * SCALE_STEPS.length);
    for (const [name, value] of Object.entries(style)) {
      expect(name).toMatch(/^--brand-(primary|accent)-\d{2,3}$/);
      expect(isHexColor(value)).toBe(true);
    }
  });
  it("marca desconhecida no endereço volta ao Hub padrão", () => {
    expect(findDemoBrand("empresa-a")).toBe(EMPRESA_A);
    expect(findDemoBrand("inexistente")).toBe(DEFAULT_BRAND);
    expect(findDemoBrand(null)).toBe(DEFAULT_BRAND);
  });
});

describe("camada semântica (theme.css)", () => {
  it("claro e escuro definem exatamente os mesmos tokens", () => {
    expect(Object.keys(modes.light).sort()).toEqual(Object.keys(modes.dark).sort());
  });
  it("redefine todos os tokens semânticos que os componentes do tema Elo consomem", () => {
    const elo = rules(read("shared/styles/tokens.css")).get(":root")!;
    const semantic = Object.keys(elo).filter((name) =>
      /^--(color-|success|warning|danger|info|neutral(-bg|-border|-solid)?$|shadow-|focus-ring|on-brand)/.test(name),
    );
    expect(semantic.length).toBeGreaterThan(50);
    const themed = new Set([...Object.keys(common), ...Object.keys(modes.light)]);
    const missing = semantic.filter((name) => !themed.has(name) && !["--color-surface-brand"].includes(name) && !name.startsWith("--shadow-tile"));
    expect(missing).toEqual([]);
  });
  for (const brand of DEMO_BRANDS)
    for (const mode of ["light", "dark"] as const)
      it(`${brand.shortName} / ${mode}: todos os pares atendem WCAG AA`, () => {
        const token = resolver({ ...primitives, ...brandStyle(brand), ...common, ...modes[mode] });
        const failures = CONTRAST_PAIRS.flatMap((pair) => {
          const ratio = contrastRatio(token(pair.foreground), token(pair.background));
          return ratio !== null && ratio >= pair.min ? [] : [`${pair.label}: ${ratio?.toFixed(2) ?? "ilegível"}`];
        });
        expect(failures).toEqual([]);
      });
  it("status não depende da marca", () => {
    for (const mode of Object.values(modes))
      for (const [name, value] of Object.entries(mode))
        if (/^--(success|warning|danger|info)/.test(name)) expect(value).not.toMatch(/--brand-/);
  });
  it("cobre os pares mínimos exigidos para texto e componentes", () => {
    expect(CONTRAST_PAIRS.filter((p) => p.min === AA.text).length).toBeGreaterThan(15);
    expect(CONTRAST_PAIRS.some((p) => p.foreground === "--color-focus")).toBe(true);
  });
});

describe("compatibilidade com o tema atual (Elo)", () => {
  it("componentes base não leem primitivos de cor diretamente", () => {
    const base = read("shared/styles/base.css");
    expect(base.match(/var\(--(neutral-\d|brand-(green|orange|lime))/g) ?? []).toEqual([]);
  });
  it("os novos papéis semânticos mantêm os valores anteriores", () => {
    const elo = rules(read("shared/styles/tokens.css")).get(":root")!;
    expect({
      control: elo["--color-text-control"],
      iconStrong: elo["--color-icon-strong"],
      controlHover: elo["--color-border-control-hover"],
      inputDisabled: elo["--color-input-disabled-bg"],
      selection: elo["--color-selection-bg"],
      backdrop: elo["--color-backdrop"],
      disabledBg: elo["--color-action-disabled-bg"],
      disabledText: elo["--color-action-disabled-text"],
    }).toEqual({
      control: "var(--neutral-800)",
      iconStrong: "var(--neutral-700)",
      controlHover: "var(--neutral-600)",
      inputDisabled: "var(--neutral-100)",
      selection: "var(--brand-green-100)",
      backdrop: "rgb(10 39 21 / 0.45)",
      disabledBg: "var(--brand-green-200)",
      disabledText: "var(--brand-green-900)",
    });
  });
});
