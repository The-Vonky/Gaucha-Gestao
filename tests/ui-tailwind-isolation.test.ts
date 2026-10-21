import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("UI-00 — isolamento do Tailwind", () => {
  const main = read("../apps/web/src/main.tsx");
  const styles = read("../apps/web/src/poc/tailwind.css");
  const poc = read("../apps/web/src/poc/main.tsx");
  const vite = read("../apps/web/vite.config.ts");

  it("não importa Tailwind na entrada da aplicação", () => {
    expect(main).not.toMatch(/tailwind|\/poc\//i);
  });
  it("não injeta Preflight nem faz varredura indiscriminada", () => {
    expect(styles).not.toMatch(/@import\s+["']tailwindcss["']/);
    expect(styles).not.toMatch(/tailwindcss\/preflight/);
    expect(styles).toContain("source(none)");
    expect(styles).toContain('@source "./main.tsx"');
  });
  it("usa tokens Elo e classes explícitas na prova", () => {
    expect(styles).toContain("var(--color-action)");
    expect(styles).toContain("var(--radius-control)");
    expect(styles).toContain("var(--color-focus)");
    expect(poc).toContain("sm:tw:grid-cols-2");
    expect(poc).toContain("lg:tw:grid-cols-3");
    expect(poc).toContain("aria-pressed");
  });
  it("reserva o bundle normal e separa o build exploratório", () => {
    expect(vite).toContain('mode === "ui-poc"');
    expect(vite).toContain('input: "tailwind-poc.html"');
  });
});
