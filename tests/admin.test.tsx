// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Confirm } from "../apps/web/src/shared/ui";
import { OrganizationPage } from "../apps/web/src/core/admin/OrganizationPage";
const api = vi.hoisted(() => ({
  list: vi.fn(),
  saveOrganization: vi.fn(),
  all: vi.fn(),
}));
vi.mock("../apps/web/src/core/admin/api", () => api);
vi.mock("../apps/web/src/core/auth/AuthProvider", () => ({
  useAuth: () => ({ can: () => true }),
}));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("critical administration flows", () => {
  it("requires explicit confirmation and allows cancellation without mutation", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    const close = vi.fn();
    render(
      <Confirm
        title="Desativar"
        description="Preservar histórico"
        onConfirm={save}
        onClose={close}
      />,
    );
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByText("Cancelar"));
    expect(close).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
  });
  it("keeps failed confirmation open with a safe error", async () => {
    const user = userEvent.setup();
    const save = vi
      .fn()
      .mockRejectedValue({ code: "42501", message: "private database detail" });
    const close = vi.fn();
    render(
      <Confirm
        title="Revogar"
        description="Remover acesso"
        onConfirm={save}
        onClose={close}
      />,
    );
    await user.click(screen.getByText("Confirmar"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("private database detail")).toBeNull();
    expect(close).not.toHaveBeenCalled();
  });
  it("creates a unit using an explicit form and refreshes the list", async () => {
    api.list.mockResolvedValue({ rows: [], count: 0 });
    api.saveOrganization.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<OrganizationPage kind="units" />);
    await screen.findByText("Nenhum registro encontrado.");
    await user.click(screen.getByText("Nova unidade"));
    await user.type(screen.getByLabelText("Código"), "CMD");
    await user.type(screen.getByLabelText("Nome"), "Unidade CMD");
    await user.click(screen.getByText("Salvar"));
    await waitFor(() =>
      expect(api.saveOrganization).toHaveBeenCalledWith("units", null, {
        code: "CMD",
        name: "Unidade CMD",
        active: true,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("does not close an edit after an optimistic conflict", async () => {
    api.list.mockResolvedValue({
      rows: [
        { id: "u", version: 1, code: "CMD", name: "Unidade CMD", active: true },
      ],
      count: 1,
    });
    api.saveOrganization.mockRejectedValue({ code: "PGRST116" });
    const user = userEvent.setup();
    render(<OrganizationPage kind="units" />);
    await user.click(await screen.findByText("Editar"));
    await user.click(screen.getByText("Salvar"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
