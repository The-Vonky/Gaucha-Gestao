// @vitest-environment jsdom
import React, { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { parseAnnouncementConfig, selectAnnouncement, type Announcement } from "../apps/web/src/shared/announcements/config";
import { InstitutionalAnnouncementBar } from "../apps/web/src/shared/announcements/InstitutionalAnnouncementBar";
import { AnnouncementLayout } from "../apps/web/src/app/AnnouncementLayout";
import defaultConfig from "./fixtures/announcements.json";

const instant = Date.parse("2026-11-04T12:00:00-03:00");
const config = (items = [item()], enabled = true) => ({ version: 1, enabled, announcements: items });
function item(changes: Partial<Announcement> = {}): Announcement {
  return { id: "testing", type: "testing", title: "Ambiente de testes", message: "Utilize somente dados autorizados.", enabled: true, startsAt: null, endsAt: null, audience: "authenticated", priority: 10, showIcon: true, action: { type: "feedback", label: "Relatar problema ou sugerir melhoria", enabled: false }, ...changes };
}
function select(value: unknown) { return selectAnnouncement(parseAnnouncementConfig(value), instant); }
const fetchMock = vi.fn();
function respond(value: unknown, status = 200) {
  fetchMock.mockResolvedValue({ ok: status === 200, text: async () => JSON.stringify(value) });
}
async function flush() { await act(async () => { await Promise.resolve(); }); }
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.useFakeTimers(); vi.setSystemTime(instant);
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); respond(config());
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("GG-10 — contrato público e seleção", () => {
  it("valida o arquivo entregue e seleciona aviso habilitado", () => {
    expect(parseAnnouncementConfig(defaultConfig)).not.toBeNull();
    expect(select(config())?.id).toBe("testing");
  });
  it("desativa globalmente, por item ou por lista vazia", () => {
    expect(select(config(undefined, false))).toBeNull();
    expect(select(config([item({ enabled: false })]))).toBeNull();
    expect(select(config([]))).toBeNull();
  });
  it.each([null, {}, [], { ...config(), version: 2 }, { ...config(), enabled: "true" }, config([item(), item()]), config(Array.from({ length: 21 }, (_, i) => item({ id: `item-${i}` })))])("rejeita configuração inválida %j", value => {
    expect(parseAnnouncementConfig(value)).toBeNull();
  });
  it.each([
    { type: "constructor" }, { audience: "public" }, { message: "" }, { title: "x".repeat(121) },
    { message: "x".repeat(1601) }, { priority: Infinity }, { priority: 1.5 }, { showIcon: "true" },
    { startsAt: "2026-11-04T12:00:00" }, { startsAt: "2026-02-30T12:00:00Z" },
    { startsAt: "2026-11-00T12:00:00Z" }, { startsAt: "2026-11-04T12:00:00+15:00" },
    { startsAt: "2026-11-04T15:00:00Z", endsAt: "2026-11-04T15:00:00Z" },
    { action: { type: "link", label: "Link", enabled: true, url: "https://example.test" } },
  ])("rejeita campos inseguros ou inconsistentes %j", change => {
    expect(parseAnnouncementConfig(config([{ ...item(), ...change } as Announcement]))).toBeNull();
  });
  it("aplica início inclusivo e fim exclusivo, aceitando offset de São Paulo", () => {
    expect(select(config([item({ startsAt: "2026-11-04T12:00:01-03:00" })]))).toBeNull();
    expect(select(config([item({ startsAt: "2026-11-04T12:00:00-03:00" })]))?.id).toBe("testing");
    expect(select(config([item({ endsAt: "2026-11-04T15:00:00Z" })]))).toBeNull();
    expect(select(config([item({ endsAt: "2026-11-04T15:00:01Z" })]))?.id).toBe("testing");
  });
  it("usa categoria e id, ignorando prioridade legada, independentemente da ordem de entrada", () => {
    const items = [item({ priority: 10000 }), item({ id: "maintenance", type: "maintenance", priority: -10000 }), item({ id: "critical-z", type: "critical", priority: 100 }), item({ id: "critical-b", type: "critical", priority: 2 }), item({ id: "critical-a", type: "critical", priority: 2 })];
    expect(select(config(items))?.id).toBe("critical-a");
    expect(select(config([...items].reverse()))?.id).toBe("critical-a");
    expect(select(config(items.slice(0, 2)))?.id).toBe("maintenance");
    expect(select(config([item(), item({ id: "info", type: "information" })]))?.id).toBe("info");
  });
});
describe("GG-10 — componente e integração futura", () => {
  it("mostra texto como texto e mantém região educada", () => {
    render(<InstitutionalAnnouncementBar announcement={item({ message: '<script>alert("x")</script>' })} />);
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
    expect(screen.getByText('<script>alert("x")</script>')).toBeTruthy();
    expect(document.querySelector("script")).toBeNull();
  });
  it("abre a leitura completa com categoria e datas e fecha por controle ou Escape", () => {
    render(<InstitutionalAnnouncementBar announcement={item({ startsAt: "2026-11-04T12:00:00Z", endsAt: "2026-11-05T12:00:00Z" })} />);
    const trigger = screen.getByRole("button", { name: /Ler comunicado/ });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Ambiente de testes" }).textContent).toContain("Categoria:");
    expect(document.querySelectorAll("time")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(trigger); fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("configuração legada de relatos não oferece atalho no aviso compacto ou expandido", () => {
    const announcement = item({ action: { type: "feedback", label: "Relatar problema", enabled: true } });
    render(<InstitutionalAnnouncementBar announcement={announcement} />);
    expect(screen.queryByRole("button", { name: /^Relatar/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Ler comunicado/ }));
    expect(screen.getByRole("dialog", { name: announcement.title })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Relatar/ })).toBeNull();
  });
  it("permite ocultar o ícone e mantém a mesma estrutura nas categorias", () => {
    const view = render(<InstitutionalAnnouncementBar announcement={item({ action: null, showIcon: false })} />);
    expect(view.container.querySelector(".institutional-announcement > svg")).toBeNull();
    for (const type of ["testing", "maintenance", "information", "critical"] as const) {
      view.rerender(<InstitutionalAnnouncementBar announcement={item({ type })} />);
      expect(screen.getByRole("region", { name: "Aviso institucional" }).classList.contains(`announcement-${type}`)).toBe(true);
    }
  });
});
describe("GG-10 — atualização em runtime e ciclo de vida", () => {
  it("carrega sem cache/credenciais; atualiza por polling e remove sem lacuna", async () => {
    const view = render(<AnnouncementLayout><main>Conteúdo</main></AnnouncementLayout>); await flush();
    expect(screen.getByText("Ambiente de testes")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/announcements.json", expect.objectContaining({ cache: "no-store", credentials: "omit", redirect: "error", signal: expect.any(AbortSignal) }));
    respond(config([item({ message: "Mensagem alterada" })]));
    await act(() => vi.advanceTimersByTimeAsync(60000));
    expect(screen.getByText("Mensagem alterada")).toBeTruthy();
    respond(config([], false)); await act(() => vi.advanceTimersByTimeAsync(60000));
    expect(screen.queryByRole("region")).toBeNull();
    expect(view.container.firstElementChild?.getAttribute("data-announcement")).toBe("false");
    expect((view.container.firstElementChild as HTMLElement).style.getPropertyValue("--announcement-height")).toBe("0px");
  });
  it("atualiza no foco, agrupa eventos próximos e mantém nó/texto quando nada mudou", async () => {
    render(<AnnouncementLayout><main /></AnnouncementLayout>); await flush();
    const status = screen.getByRole("status");
    await act(() => vi.advanceTimersByTimeAsync(5000));
    fireEvent.focus(window); fireEvent(document, new Event("visibilitychange")); await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2); expect(screen.getByRole("status")).toBe(status);
    respond(config([item({ title: "Aviso atualizado" })]));
    await act(() => vi.advanceTimersByTimeAsync(5000)); fireEvent.focus(window); await flush();
    expect(screen.getByText("Aviso atualizado")).toBeTruthy();
  });
  it("não consulta em aba oculta e sincroniza ao retornar", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    render(<AnnouncementLayout><main /></AnnouncementLayout>); await flush();
    await act(() => vi.advanceTimersByTimeAsync(60000)); expect(fetchMock).not.toHaveBeenCalled();
    vi.restoreAllMocks(); fireEvent(document, new Event("visibilitychange")); await flush();
    expect(screen.getByText("Ambiente de testes")).toBeTruthy();
  });
  it("inicia e termina automaticamente sem esperar polling", async () => {
    respond(config([item({ startsAt: new Date(instant + 1000).toISOString(), endsAt: new Date(instant + 3000).toISOString() })]));
    render(<AnnouncementLayout><main /></AnnouncementLayout>); await flush();
    expect(screen.queryByRole("region")).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(1000)); expect(screen.getByRole("region")).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(2000)); expect(screen.queryByRole("region")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(["404", "invalid-json", "invalid-model", "network", "oversized"])("falha %s oculta aviso anterior e recupera na próxima busca", async failure => {
    render(<AnnouncementLayout><main /></AnnouncementLayout>); await flush();
    if (failure === "404") respond(null, 404);
    if (failure === "invalid-json") fetchMock.mockResolvedValue({ ok: true, text: async () => "<html>SPA fallback</html>" });
    if (failure === "invalid-model") respond({ enabled: true });
    if (failure === "network") fetchMock.mockRejectedValue(new Error("offline"));
    if (failure === "oversized") fetchMock.mockResolvedValue({ ok: true, text: async () => " ".repeat(65537) });
    await act(() => vi.advanceTimersByTimeAsync(60000)); expect(screen.queryByRole("region")).toBeNull();
    respond(config()); await act(() => vi.advanceTimersByTimeAsync(60000)); expect(screen.getByRole("region")).toBeTruthy();
  });
  it("usa relógio do servidor e consulta na fronteira sem vazar conteúdo futuro", async () => {
    const load = vi.fn().mockResolvedValue({ ...config([]), serverNow: instant + 120000, nextRefreshAt: instant + 121000 });
    render(<AnnouncementLayout loadConfig={load}><main /></AnnouncementLayout>); await flush();
    expect(screen.queryByRole("region")).toBeNull();
    load.mockResolvedValue({ ...config([item({ startsAt: new Date(instant + 121000).toISOString(), endsAt: new Date(instant + 123000).toISOString() })]), serverNow: instant + 121000, nextRefreshAt: instant + 123000 });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(load).toHaveBeenCalledTimes(2); expect(screen.getByRole("region")).toBeTruthy();
    load.mockResolvedValue({ ...config([]), serverNow: instant + 123000 });
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(screen.queryByRole("region")).toBeNull(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("aceita presets separados da categoria e rejeita cores fora da paleta", () => {
    expect(parseAnnouncementConfig(config([item({ type: "critical", tone: "success" })]))).not.toBeNull();
    expect(parseAnnouncementConfig({ ...config([]), announcements: [{ ...item(), tone: "#ff0000" }] })).toBeNull();
    expect(parseAnnouncementConfig(config([item({ type: "information", tone: "neutral" })]))).not.toBeNull();
    expect(parseAnnouncementConfig(config([item({ type: "success", tone: "success" })]))).not.toBeNull();
  });
  it("aborta requisição pendente ao desmontar e remove timers/listeners", async () => {
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("abort")))));
    const view = render(<AnnouncementLayout><main /></AnnouncementLayout>); await flush();
    const signal = fetchMock.mock.calls[0][1].signal;
    view.unmount(); await flush(); expect(signal.aborted).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(120000)); fireEvent.focus(window); expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.documentElement.style.getPropertyValue("--app-sticky-height")).toBe("");
  });
  it("limita duração de requisição e tolera StrictMode sem ressuscitar dados antigos", async () => {
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("abort")))));
    render(<StrictMode><AnnouncementLayout><main /></AnnouncementLayout></StrictMode>); await flush();
    await act(() => vi.advanceTimersByTimeAsync(10000)); expect(screen.queryByRole("region")).toBeNull();
    expect(fetchMock.mock.calls.every(call => call[1].signal.aborted)).toBe(true);
    respond(config()); await act(() => vi.advanceTimersByTimeAsync(50000)); expect(screen.getByRole("region")).toBeTruthy();
  });
});
