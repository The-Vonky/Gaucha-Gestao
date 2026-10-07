// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrganizationPage } from "../apps/web/src/core/admin/OrganizationPage";
const api = vi.hoisted(() => ({ list: vi.fn(), saveOrganization: vi.fn() }));
vi.mock("../apps/web/src/core/admin/api", () => api);
const auth = vi.hoisted(() => ({ denied: new Set<string>() }));
vi.mock("../apps/web/src/core/auth/AuthProvider", () => ({
  useAuth: () => ({ can: (p: string) => !auth.denied.has(p), profile: { id: "me" } }),
}));
const covers = vi.hoisted(() => ({
  resolveUnitCovers: vi.fn(),
  uploadUnitCover: vi.fn(),
  setUnitCoverPosition: vi.fn(),
  removeUnitCover: vi.fn(),
  coverMessage: vi.fn((e: { message?: string; code?: string }) =>
    e?.code === "42501" ? "Você não tem permissão para esta operação. Atualize seu acesso." : e?.message ?? "Falhou"),
}));
vi.mock("../apps/web/src/core/unitCovers", () => covers);
const image = vi.hoisted(() => ({ prepareCoverImage: vi.fn() }));
vi.mock("../apps/web/src/core/unitCoverImage", async (original) => ({
  ...(await original<typeof import("../apps/web/src/core/unitCoverImage")>()),
  prepareCoverImage: image.prepareCoverImage,
}));
const UNIT = { id: "u1", version: 1, code: "CMD", name: "Unidade CMD", active: true, created_at: "", updated_at: "" };
const current = { unitId: "u1", assetId: "a1", url: "https://example.test/current.jpg", x: 30, y: 70, width: 1600, height: 900 };
const prepared = { blob: new Blob([new Uint8Array(300_000)], { type: "image/jpeg" }), width: 2560, height: 1440 };
const photo = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], "foto.jpg", { type: "image/jpeg" });
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  URL.createObjectURL = vi.fn(() => "blob:prepared");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  auth.denied = new Set();
});
async function open(cover: typeof current | null = null) {
  api.list.mockResolvedValue({ rows: [UNIT], count: 1 });
  covers.resolveUnitCovers.mockResolvedValue(new Map([["u1", cover]]));
  const user = userEvent.setup();
  render(<OrganizationPage kind="units" />);
  await user.click(await screen.findByRole("button", { name: "Capa de Unidade CMD" }));
  const dialog = screen.getByRole("dialog");
  await within(dialog).findByText(cover ? /Foto atual/ : /Nenhuma foto cadastrada/);
  return { user, dialog };
}
const imgs = (dialog: HTMLElement) => within(dialog).queryAllByRole("img") as HTMLImageElement[];
const fileInput = (dialog: HTMLElement) => within(dialog).getByLabelText("Arquivo da foto da unidade") as HTMLInputElement;
describe("unit cover self-service in Administration", () => {
  it("shows the fallback and an add action when the unit has no photo", async () => {
    const { dialog } = await open();
    expect(covers.resolveUnitCovers).toHaveBeenCalledWith(["u1"], true);
    expect(imgs(dialog)).toHaveLength(0);
    expect(within(dialog).getAllByText("CMD")).toHaveLength(2);
    expect(within(dialog).getByRole("button", { name: "Adicionar foto" })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Remover foto" })).toBeNull();
    expect(within(dialog).queryByRole("slider")).toBeNull();
    const input = fileInput(dialog);
    expect(input.accept).toBe("image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp");
    expect(input.hasAttribute("capture")).toBe(false);
  });
  it("prepares the selected file, previews it faithfully and uploads with the chosen framing", async () => {
    image.prepareCoverImage.mockResolvedValue(prepared);
    covers.uploadUnitCover.mockImplementation(async (_u, _p, _pos, onStep: (s: string) => void) => {
      onStep("uploading");
      onStep("confirming");
    });
    const { user, dialog } = await open();
    const file = photo();
    await user.upload(fileInput(dialog), file);
    expect(image.prepareCoverImage).toHaveBeenCalledWith(file);
    await within(dialog).findByText(/Nova foto preparada: 2560 × 1440 px, 293 KB, JPEG\. Ainda não foi salva\./);
    expect(imgs(dialog).map((i) => [i.getAttribute("src"), i.style.objectPosition])).toEqual([
      ["blob:prepared", "50% 50%"], ["blob:prepared", "50% 50%"],
    ]);
    const [horizontal, vertical] = within(dialog).getAllByRole("slider") as HTMLInputElement[];
    expect(within(dialog).getByLabelText(/Posição horizontal/)).toBe(horizontal);
    fireEvent.change(horizontal, { target: { value: "0" } });
    fireEvent.change(vertical, { target: { value: "100" } });
    expect(imgs(dialog)[0].style.objectPosition).toBe("0% 100%");
    expect(horizontal.getAttribute("aria-valuetext")).toBe("0% (0 = esquerda, 100 = direita)");
    await user.click(within(dialog).getByRole("button", { name: "Salvar foto" }));
    expect(await within(dialog).findByText("Foto salva. A capa já aparece nas telas desta unidade.")).toBeTruthy();
    expect(covers.uploadUnitCover).toHaveBeenCalledWith("u1", prepared, { x: 0, y: 100 }, expect.any(Function));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(covers.resolveUnitCovers).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:prepared");
  });
  it("prevents double submit while saving", async () => {
    image.prepareCoverImage.mockResolvedValue(prepared);
    let finish = () => {};
    covers.uploadUnitCover.mockImplementation(() => new Promise<void>((r) => (finish = r)));
    const { user, dialog } = await open();
    await user.upload(fileInput(dialog), photo());
    const save = await within(dialog).findByRole("button", { name: "Salvar foto" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(covers.uploadUnitCover).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole("button", { name: "Enviando foto…" })).toHaveProperty("disabled", true);
    expect(within(dialog).getByRole("button", { name: "Fechar" })).toHaveProperty("disabled", true);
    finish();
    await within(dialog).findByText(/Foto salva/);
  });
  it("shows preparation and upload errors and keeps the chosen photo for retry", async () => {
    image.prepareCoverImage.mockRejectedValueOnce(new Error("A foto excede o limite de 8 MB."));
    const { user, dialog } = await open();
    await user.upload(fileInput(dialog), photo());
    expect((await within(dialog).findByRole("alert")).textContent).toContain("A foto excede o limite de 8 MB.");
    expect(imgs(dialog)).toHaveLength(0);
    image.prepareCoverImage.mockResolvedValue(prepared);
    covers.uploadUnitCover.mockRejectedValueOnce(new Error("O envio expirou. Selecione a foto novamente."));
    await user.upload(fileInput(dialog), photo());
    await user.click(await within(dialog).findByRole("button", { name: "Salvar foto" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("O envio expirou");
    expect(imgs(dialog)[0].getAttribute("src")).toBe("blob:prepared");
    expect(within(dialog).getByRole("button", { name: "Salvar foto" })).toHaveProperty("disabled", false);
  });
  it("cancels an unsaved photo without any upload", async () => {
    image.prepareCoverImage.mockResolvedValue(prepared);
    const { user, dialog } = await open(current);
    await user.upload(fileInput(dialog), photo());
    await within(dialog).findByText(/Nova foto preparada/);
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(covers.uploadUnitCover).not.toHaveBeenCalled();
    expect(imgs(dialog)[0].getAttribute("src")).toBe(current.url);
    expect(imgs(dialog)[0].style.objectPosition).toBe("30% 70%");
  });
  it("replaces the current photo", async () => {
    image.prepareCoverImage.mockResolvedValue(prepared);
    covers.uploadUnitCover.mockResolvedValue(undefined);
    const { user, dialog } = await open(current);
    expect(imgs(dialog)[0].style.objectPosition).toBe("30% 70%");
    await user.click(within(dialog).getByRole("button", { name: "Alterar foto" }));
    await user.upload(fileInput(dialog), photo());
    await user.click(await within(dialog).findByRole("button", { name: "Salvar foto" }));
    await within(dialog).findByText(/Foto salva/);
    expect(covers.uploadUnitCover).toHaveBeenCalledWith("u1", prepared, { x: 50, y: 50 }, expect.any(Function));
  });
  it("adjusts and saves the framing of the current photo", async () => {
    covers.setUnitCoverPosition.mockResolvedValue(undefined);
    const { user, dialog } = await open(current);
    expect(within(dialog).queryByRole("button", { name: "Salvar enquadramento" })).toBeNull();
    fireEvent.change(within(dialog).getByLabelText(/Posição vertical/), { target: { value: "0" } });
    expect(within(dialog).getByText("0%", { selector: "output" })).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Salvar enquadramento" }));
    expect(await within(dialog).findByText("Enquadramento salvo.")).toBeTruthy();
    expect(covers.setUnitCoverPosition).toHaveBeenCalledWith("u1", "a1", { x: 30, y: 0 });
    await user.click(within(dialog).getByRole("button", { name: "Centralizar" }));
    expect(imgs(dialog)[0].style.objectPosition).toBe("50% 50%");
  });
  it("removes the photo only after an explicit confirmation", async () => {
    covers.removeUnitCover.mockResolvedValue(undefined);
    const { user, dialog } = await open(current);
    await user.click(within(dialog).getByRole("button", { name: "Remover foto" }));
    const confirmation = () => within(dialog).getByRole("group", { name: /Remover a foto de Unidade CMD/ });
    expect(confirmation().textContent).toContain("voltarão a exibir o monograma");
    await user.click(within(dialog).getByRole("button", { name: "Manter foto" }));
    expect(covers.removeUnitCover).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Remover foto" }));
    covers.resolveUnitCovers.mockResolvedValue(new Map([["u1", null]]));
    await user.click(within(confirmation()).getByRole("button", { name: "Remover foto" }));
    expect(await within(dialog).findByText(/Foto removida/)).toBeTruthy();
    expect(covers.removeUnitCover).toHaveBeenCalledWith("u1", "a1");
    await within(dialog).findByRole("button", { name: "Adicionar foto" });
  });
  it("offers no cover action without admin.unit.manage and shows a server denial safely", async () => {
    auth.denied = new Set(["admin.unit.manage"]);
    api.list.mockResolvedValue({ rows: [UNIT], count: 1 });
    render(<OrganizationPage kind="units" />);
    await screen.findByText("Unidade CMD");
    expect(screen.queryByRole("button", { name: /Capa/ })).toBeNull();
    cleanup();
    auth.denied = new Set();
    covers.setUnitCoverPosition.mockRejectedValue({ code: "42501", message: "Forbidden" });
    const { user, dialog } = await open(current);
    fireEvent.change(within(dialog).getByLabelText(/Posição horizontal/), { target: { value: "10" } });
    await user.click(within(dialog).getByRole("button", { name: "Salvar enquadramento" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Você não tem permissão");
    expect(within(dialog).queryByText("Forbidden")).toBeNull();
  });
});
