// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { DesignSystemGallery } from "../apps/web/src/design-system/Gallery";
import { ThemeProvider, useColorMode } from "../apps/web/src/shared/theme/ThemeProvider";
import { EMPRESA_A } from "../apps/web/src/design-system/brands";

let systemDark = false;
const listeners = new Set<() => void>();
function setSystemDark(value: boolean) {
  systemDark = value;
  act(() => listeners.forEach((listener) => listener()));
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
beforeEach(() => {
  systemDark = false;
  listeners.clear();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/design-system/");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      get matches() {
        return query.includes("dark") ? systemDark : false;
      },
      media: query,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    }),
  });
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("rede não permitida"))));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const root = () => document.querySelector<HTMLElement>(".hub-theme")!;

describe("galeria do Design System", () => {
  it("exibe todas as famílias de componentes, sem rede e com aviso de dados fictícios", () => {
    render(<DesignSystemGallery />);
    for (const name of [
      "Fundamentos", "Botões", "Campos e seleção", "Badges e alertas", "Cards", "Tabela",
      "Navegação", "Métricas", "Estados vazios", "Diálogos", "Acessibilidade",
    ])
      expect(screen.getByRole("heading", { level: 2, name })).toBeTruthy();
    expect(screen.getByText(/Marcas, nomes e números são fictícios/)).toBeTruthy();
    expect(screen.getByText("Marca fictícia")).toBeTruthy();
    expect(screen.getAllByRole("table")).toHaveLength(2); // solicitações + relatório de contraste
    expect(fetch).not.toHaveBeenCalled();
  });

  it("troca marca e modo em tempo real e mantém o endereço compartilhável", () => {
    render(<DesignSystemGallery />);
    expect(root().dataset.brand).toBe("hub");
    expect(root().dataset.theme).toBe("light");
    const brand = screen.getByRole("group", { name: "Marca da organização" });
    fireEvent.click(within(brand).getByLabelText("Empresa A"));
    expect(root().dataset.brand).toBe("empresa-a");
    expect(root().style.getPropertyValue("--brand-primary-600")).toBe(EMPRESA_A.colors.primary[600]);
    fireEvent.click(within(screen.getByRole("group", { name: "Modo de cor" })).getByLabelText("Escuro"));
    expect(root().dataset.theme).toBe("dark");
    expect(window.location.search).toBe("?brand=empresa-a&mode=dark");
    expect(screen.getByText(/no modo/).textContent).toMatch(/Empresa A \(fictícia\) no modo escuro/);
  });

  it("abre com marca e modo vindos do endereço; valores inválidos usam o padrão", () => {
    window.history.replaceState(null, "", "/design-system/?brand=empresa-b&mode=dark");
    render(<DesignSystemGallery />);
    expect(root().dataset.brand).toBe("empresa-b");
    expect(root().dataset.theme).toBe("dark");
    cleanup();
    window.history.replaceState(null, "", "/design-system/?brand=%3Cscript%3E&mode=neon");
    render(<DesignSystemGallery />);
    expect(root().dataset.brand).toBe("hub");
    expect(root().dataset.colorPreference).toBe("system");
  });

  it("modo automático acompanha a mudança do sistema operacional", () => {
    render(<DesignSystemGallery />);
    expect(root().dataset.colorPreference).toBe("system");
    setSystemDark(true);
    expect(root().dataset.theme).toBe("dark");
    setSystemDark(false);
    expect(root().dataset.theme).toBe("light");
  });

  it("abas respondem às setas, Home e End", () => {
    render(<DesignSystemGallery />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Atividades" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Atividades" }));
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(screen.getByRole("tabpanel").textContent).toMatch(/Nenhum anexo/);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Resumo" }).getAttribute("aria-selected")).toBe("true");
  });

  it("diálogo abre, fecha com Esc e devolve o foco ao acionador", () => {
    render(<DesignSystemGallery />);
    const opener = screen.getByRole("button", { name: "Abrir formulário" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Nova solicitação" });
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.closest(".hub-theme")).toBe(root());
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog", { name: "Nova solicitação" })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("campo com erro é anunciado pelo aria-describedby", () => {
    render(<DesignSystemGallery />);
    const email = screen.getByLabelText("E-mail do responsável");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    const described = email.getAttribute("aria-describedby")!.split(" ").map((id) => document.getElementById(id)?.textContent);
    expect(described).toContain("Informe um e-mail válido.");
  });
});

describe("ThemeProvider", () => {
  function Probe() {
    const { preference, mode, setPreference } = useColorMode();
    return (
      <button type="button" onClick={() => setPreference("dark")}>
        {preference}:{mode}
      </button>
    );
  }

  it("persiste a preferência de modo e separa a marca da organização", () => {
    const { unmount } = render(
      <ThemeProvider brand={EMPRESA_A} storageKey="teste.modo">
        <Probe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "system:light" }));
    expect(window.localStorage.getItem("teste.modo")).toBe("dark");
    expect(root().dataset.brand).toBe("empresa-a");
    unmount();
    render(
      <ThemeProvider storageKey="teste.modo">
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByRole("button", { name: "dark:dark" })).toBeTruthy();
    expect(root().dataset.brand).toBe("hub");
  });

  it("continua funcionando com armazenamento bloqueado", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "system:light" }));
    expect(screen.getByRole("button", { name: "dark:dark" })).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("marca inválida cai no padrão em vez de chegar ao CSS", () => {
    const hostile = { ...EMPRESA_A, colors: { ...EMPRESA_A.colors, primary: { ...EMPRESA_A.colors.primary, 600: "red;}*{display:none" } } };
    render(
      <ThemeProvider brand={hostile}>
        <Probe />
      </ThemeProvider>,
    );
    expect(root().dataset.brand).toBe("hub");
    expect(root().getAttribute("style")).not.toMatch(/display/);
  });
});
