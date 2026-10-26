// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoomsPage } from "../apps/web/src/modules/rooms/RoomsPage";
import { dateTime, instant, time } from "../apps/web/src/modules/rooms/api";
import { visibleNavigation } from "../apps/web/src/app/navigation";
const state = vi.hoisted(() => ({
  permissions: ["schedule.read"],
  rpc: vi.fn(),
}));
vi.mock("../apps/web/src/core/auth/AuthProvider", () => ({
  useAuth: () => ({
    profile: { active: true },
    grants: state.permissions.map((p) => ({
      permission: `room_booking.${p}`,
      scope_type: "global",
      unit_id: null,
      sector_id: null,
    })),
  }),
}));
vi.mock("../apps/web/src/modules/rooms/api", async (original) => ({
  ...(await original<object>()),
  rpc: state.rpc,
}));
beforeEach(() => {
  state.permissions = ["schedule.read"];
  state.rpc.mockReset();
  state.rpc.mockImplementation(async (name) =>
    name === "summary"
      ? {
          name: "Sala de Reunião",
          server_now: "2026-10-23T12:00:00Z",
          in_use: false,
          today_count: 0,
          next_start: null,
        }
      : [],
  );
});
afterEach(cleanup);
it("leitor vê agenda e não recebe fila nem ações privilegiadas", async () => {
  render(<RoomsPage />);
  await screen.findByText("Nenhuma reserva confirmada nesta data.");
  expect(screen.queryByText("Criar reserva direta")).toBeNull();
  expect(screen.queryByText("Meus pedidos")).toBeNull();
  expect(state.rpc.mock.calls.some((c) => c[0] === "requests")).toBe(false);
});
it("solicitante envia pedido com chave idempotente e não o apresenta como confirmado", async () => {
  state.permissions = ["schedule.read", "request.create", "request.read_own"];
  render(<RoomsPage />);
  await screen.findByText("Nenhuma reserva confirmada nesta data.");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Novo pedido" }));
  await user.type(screen.getByLabelText("Reservado para"), "Teste");
  const date = screen.getByLabelText("Data da reunião");
  await user.clear(date);
  await user.type(date, "2099-01-02");
  await user.type(screen.getByLabelText("Início"), "14:07");
  await user.type(screen.getByLabelText("Término"), "14:23");
  await user.click(screen.getByRole("button", { name: "Enviar pedido" }));
  await screen.findByText(/Pedido enviado. Aguarde aprovação/);
  expect(
    state.rpc.mock.calls.find((c) => c[0] === "create_request")?.[1],
  ).toMatchObject({
    p_start: "2099-01-02T17:07:00.000Z",
    p_end: "2099-01-02T17:23:00.000Z",
    p_booked_for: "Teste",
    p_key: expect.any(String),
  });
  expect(screen.queryByText("Solicitações pendentes")).toBeNull();
});
it("gestor vê fila; observações com HTML são texto inerte", async () => {
  state.permissions = ["schedule.read", "manage"];
  state.rpc.mockImplementation(async (name) =>
    name === "schedule"
      ? [
          {
            id: "B",
            booked_for: "Teste",
            secretary_notes: "<script>executar()</script>",
            starts_at: "2099-01-02T17:07:00Z",
            ends_at: "2099-01-02T17:23:00Z",
            version: 1,
          },
        ]
      : name === "summary"
        ? {
            name: "Sala de Reunião",
            server_now: "2026-10-23T12:00:00Z",
            in_use: false,
            today_count: 0,
            next_start: null,
            pending_count: 0,
          }
        : [],
  );
  const { container } = render(<RoomsPage />);
  await screen.findByText("<script>executar()</script>");
  expect(container.querySelector("script")).toBeNull();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Editar reserva" }));
  expect(
    screen
      .getByLabelText("Observações públicas da secretaria")
      .getAttribute("aria-labelledby"),
  ).toBe("room-editor-text-label");
  expect(screen.getByText("Criar reserva direta")).toBeTruthy();
  expect(
    state.rpc.mock.calls.some((c) => c[0] === "requests" && c[1].p_queue),
  ).toBe(true);
});
it("nega navegação sem concessão global e limpa agenda após erro de autorização", async () => {
  expect(
    visibleNavigation(true, [])
      .flatMap((g) => g.destinations)
      .some((d) => d.path === "/rooms"),
  ).toBe(false);
  state.rpc.mockRejectedValue({ code: "42501" });
  render(<RoomsPage />);
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "Você não tem permissão",
    ),
  );
});
it("converte minutos livres e borda 23:59 no fuso de São Paulo", () => {
  expect(instant("2099-01-02", "23:59")).toBe("2099-01-03T02:59:00.000Z");
  expect(time("2099-01-02T17:07:00Z")).toBe("14:07");
  expect(dateTime("2099-01-03T02:59:00Z")).toContain("02/01/2099");
});
it("D5-B: administrador recebe três capacidades, sem fila, contador ou ações de gestão", async () => {
  state.permissions = ["schedule.read", "request.create", "request.read_own"];
  state.rpc.mockImplementation(async (name) =>
    name === "schedule" ? [{ id: "B", booked_for: "Reserva existente", starts_at: "2099-01-02T17:07:00Z", ends_at: "2099-01-02T17:23:00Z", version: 1 }]
      : name === "summary" ? { name: "Sala de Reunião", server_now: "2026-10-26T12:00:00Z", today_count: 1, pending_count: 99 } : [],
  );
  render(<RoomsPage />);
  await screen.findByText("Reserva existente");
  expect(screen.getByText("Meus pedidos")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Novo pedido" })).toBeTruthy();
  for (const name of ["Criar reserva direta", "Editar reserva", "Cancelar reserva", "Aprovar pedido", "Recusar pedido"])
    expect(screen.queryByRole("button", { name })).toBeNull();
  expect(screen.queryByText("Solicitações pendentes")).toBeNull();
  expect(screen.queryByText("99")).toBeNull();
  expect(state.rpc.mock.calls.some((c) => c[0] === "requests" && c[1]?.p_queue)).toBe(false);
});
it("fecha visualmente o editor de gestão quando a permissão efetiva é revogada", async () => {
  state.permissions = ["schedule.read", "manage"];
  const view = render(<RoomsPage />);
  await userEvent.setup().click(await screen.findByRole("button", { name: "Criar reserva direta" }));
  expect(screen.getByRole("heading", { name: "Reserva direta" })).toBeTruthy();
  state.permissions = ["schedule.read", "request.create", "request.read_own"];
  view.rerender(<RoomsPage />);
  expect(screen.queryByRole("heading", { name: "Reserva direta" })).toBeNull();
  await waitFor(() => expect(screen.queryByText("Consultando agenda…")).toBeNull());
});
