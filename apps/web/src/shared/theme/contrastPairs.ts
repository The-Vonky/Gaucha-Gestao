/**
 * Token pairs that must meet WCAG AA in every brand and mode. Checked statically
 * in tests/design-system-tokens.test.ts and live in the gallery.
 */
import { AA } from "./contrast";

export interface ContrastPair {
  label: string;
  foreground: string;
  background: string;
  min: number;
}

const text = (label: string, foreground: string, background: string): ContrastPair => ({
  label,
  foreground,
  background,
  min: AA.text,
});
const ui = (label: string, foreground: string, background: string): ContrastPair => ({
  label,
  foreground,
  background,
  min: AA.ui,
});

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  text("Texto sobre fundo", "--color-text", "--color-bg"),
  text("Texto sobre superfície", "--color-text", "--color-surface"),
  text("Texto secundário sobre superfície", "--color-text-secondary", "--color-surface"),
  text("Texto secundário sobre fundo", "--color-text-secondary", "--color-bg"),
  text("Texto terciário sobre superfície", "--color-text-tertiary", "--color-surface"),
  text("Texto terciário sobre fundo", "--color-text-tertiary", "--color-bg"),
  text("Texto de controle sobre campo", "--color-text-control", "--color-input-bg"),
  text("Texto em ação primária", "--color-action-text", "--color-action"),
  text("Texto em ação primária (hover)", "--color-action-text", "--color-action-hover"),
  text("Link sobre superfície", "--color-link", "--color-surface"),
  text("Link sobre fundo", "--color-link", "--color-bg"),
  text("Item selecionado", "--color-selected-text", "--color-selected-bg"),
  text("Selecionado sobre superfície", "--color-selected-text", "--color-surface"),
  ui("Foco sobre superfície", "--color-focus", "--color-surface"),
  ui("Foco sobre fundo", "--color-focus", "--color-bg"),
  ui("Borda de campo sobre campo", "--color-border-control", "--color-input-bg"),
  ui("Borda de campo sobre superfície", "--color-border-control", "--color-surface"),
  ui("Ação primária sobre superfície", "--color-action", "--color-surface"),
  text("Sucesso", "--success", "--success-bg"),
  text("Atenção", "--warning", "--warning-bg"),
  text("Erro (ícone/badge)", "--danger", "--danger-bg"),
  text("Erro (texto)", "--danger-text", "--danger-bg"),
  text("Informação", "--info", "--info-bg"),
  text("Neutro", "--neutral", "--neutral-bg"),
  text("Navegação: texto", "--on-brand", "--color-surface-brand"),
  text("Navegação: secundário", "--on-brand-secondary", "--color-surface-brand"),
  text("Navegação: discreto", "--on-brand-muted", "--color-surface-brand"),
  ui("Navegação: foco/destaque", "--on-brand-accent", "--color-surface-brand"),
];
