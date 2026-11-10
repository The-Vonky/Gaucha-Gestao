// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
      : name === "history"
        ? { items: [], has_more: false }
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
        : name === "history"
          ? { items: [], has_more: false }
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
  state.rpc.mockImplementation(async (name) => {
    if (name === "schedule") throw { code: "42501" };
    return null;
  });
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
    name === "schedule"
      ? [
          {
            id: "B",
            booked_for: "Reserva existente",
            starts_at: "2099-01-02T17:07:00Z",
            ends_at: "2099-01-02T17:23:00Z",
            version: 1,
          },
        ]
      : name === "summary"
        ? {
            name: "Sala de Reunião",
            server_now: "2026-10-26T12:00:00Z",
            today_count: 1,
            pending_count: 99,
          }
        : name === "history"
          ? { items: [], has_more: false }
          : [],
  );
  render(<RoomsPage />);
  await screen.findByText("Reserva existente");
  expect(screen.getByText("Meus pedidos")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Novo pedido" })).toBeTruthy();
  for (const name of [
    "Criar reserva direta",
    "Editar reserva",
    "Cancelar reserva",
    "Aprovar pedido",
    "Recusar pedido",
  ])
    expect(screen.queryByRole("button", { name })).toBeNull();
  expect(screen.queryByText("Solicitações pendentes")).toBeNull();
  expect(screen.queryByText("99")).toBeNull();
  expect(
    state.rpc.mock.calls.some((c) => c[0] === "requests" && c[1]?.p_queue),
  ).toBe(false);
});
it("fecha visualmente o editor de gestão quando a permissão efetiva é revogada", async () => {
  state.permissions = ["schedule.read", "manage"];
  const view = render(<RoomsPage />);
  await userEvent
    .setup()
    .click(await screen.findByRole("button", { name: "Criar reserva direta" }));
  expect(screen.getByRole("heading", { name: "Reserva direta" })).toBeTruthy();
  state.permissions = ["schedule.read", "request.create", "request.read_own"];
  view.rerender(<RoomsPage />);
  expect(screen.queryByRole("heading", { name: "Reserva direta" })).toBeNull();
  await waitFor(() =>
    expect(screen.queryByText("Consultando agenda…")).toBeNull(),
  );
});
it("gestor com todas as permissões não vê cards de solicitante e mantém reserva direta e histórico", async () => {
  state.permissions = [
    "schedule.read",
    "request.create",
    "request.read_own",
    "manage",
  ];
  render(<RoomsPage />);
  await screen.findByText("Nenhuma reserva confirmada nesta data.");
  expect(screen.queryByText("ORGANIZE SEU ENCONTRO")).toBeNull();
  expect(screen.queryByText("Meus pedidos")).toBeNull();
  expect(screen.queryByRole("button", { name: "Novo pedido" })).toBeNull();
  expect(
    screen.getByRole("heading", { name: "Histórico de solicitações" }),
  ).toBeTruthy();
  expect(
    state.rpc.mock.calls.some((c) => c[0] === "requests" && !c[1]?.p_queue),
  ).toBe(false);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Criar reserva direta" }));
  expect(screen.getByRole("heading", { name: "Reserva direta" })).toBeTruthy();
});
it("histórico apresenta estados, decisão e reserva cancelada, pagina por cursor e reinicia filtros", async () => {
  state.permissions = ["schedule.read", "manage"];
  const entries = ["pending", "approved", "rejected", "cancelled"].map(
    (status, i) => ({
      id: `H${i}`,
      status,
      booked_for: `Reunião ${i}`,
      requester_name: "Solicitante sintético",
      starts_at: "2020-01-02T12:00:00Z",
      ends_at: "2020-01-02T13:00:00Z",
      created_at: "2019-12-20T12:00:00Z",
      decided_at: i === 1 || i === 2 ? "2019-12-21T12:00:00Z" : null,
      decided_by_name: "Gestor sintético",
      decision_reason: i === 2 ? "Motivo sintético" : null,
      booking_status: i === 1 ? "cancelled" : null,
      booking_cancelled_at: i === 1 ? "2019-12-22T12:00:00Z" : null,
    }),
  );
  state.rpc.mockImplementation(async (name) =>
    name === "history"
      ? { items: entries, has_more: true }
      : name === "summary"
        ? {
            name: "Sala",
            server_now: "2026-10-26T12:00:00Z",
            in_use: false,
            next_start: null,
            today_count: 0,
          }
        : [],
  );
  render(<RoomsPage />);
  await screen.findByText("Motivo da recusa: Motivo sintético");
  expect(screen.getByText(/Cancelada posteriormente/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Aprovar pedido" })).toBeNull();
  const next = screen
    .getAllByRole("button", { name: "Próxima" })
    .find((b) => !(b as HTMLButtonElement).disabled)!;
  await userEvent.setup().click(next);
  await waitFor(() =>
    expect(state.rpc).toHaveBeenCalledWith(
      "history",
      expect.objectContaining({
        p_before_id: "H3",
        p_before_start: entries[3].starts_at,
      }),
    ),
  );
  await userEvent
    .setup()
    .selectOptions(
      screen.getByLabelText("Status do pedido", { exact: true }),
      "rejected",
    );
  await waitFor(() =>
    expect(state.rpc).toHaveBeenCalledWith(
      "history",
      expect.objectContaining({
        p_status: "rejected",
        p_before_id: null,
        p_before_start: null,
      }),
    ),
  );
});

it("gestora configura contato e vê o valor salvo; leitor só consulta após remontar", async () => {
  state.permissions = ["schedule.read", "manage"];
  let contact = {
    room_id: "sala-sintética",
    responsible_name: null as string | null,
    extension: null as string | null,
    version: 0,
  };
  const fallback = state.rpc.getMockImplementation()!;
  state.rpc.mockImplementation(async (name, args) => {
    if (name === "contact") return contact;
    if (name === "save_contact") {
      contact = {
        ...contact,
        responsible_name: args.p_responsible_name,
        extension: args.p_extension,
        version: 1,
      };
      return contact;
    }
    return fallback(name, args);
  });
  const { unmount } = render(<RoomsPage />);
  await screen.findByText("Contato ainda não informado.");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Editar contato" }));
  expect(document.activeElement).toBe(
    screen.getByLabelText("Nome da responsável"),
  );
  await user.type(
    screen.getByLabelText("Nome da responsável"),
    "Nome Institucional",
  );
  await user.type(screen.getByLabelText(/^Ramal/), "0012");
  await user.click(screen.getByRole("button", { name: "Salvar contato" }));
  expect(await screen.findByText("Contato atualizado.")).toBeTruthy();
  expect(screen.getByText("Nome Institucional")).toBeTruthy();
  expect(state.rpc).toHaveBeenCalledWith("save_contact", {
    p_room_id: "sala-sintética",
    p_responsible_name: "Nome Institucional",
    p_extension: "0012",
    p_version: 0,
  });

  unmount();
  state.permissions = ["schedule.read"];
  render(<RoomsPage />);
  expect(await screen.findByText("0012")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Editar contato" })).toBeNull();
  expect(
    screen.queryByRole("tablist", { name: "Tipo de histórico" }),
  ).toBeNull();
});

it("conflito de contato impede nova gravação até consultar a versão atual", async () => {
  state.permissions = ["schedule.read", "manage"];
  const fallback = state.rpc.getMockImplementation()!;
  let version = 1;
  state.rpc.mockImplementation(async (name, args) => {
    if (name === "contact")
      return {
        room_id: "sala-sintética",
        responsible_name:
          version === 1
            ? "Contato inicial"
            : "Contato atualizado por outra sessão",
        extension: "0012",
        version,
      };
    if (name === "save_contact") {
      version = 2;
      throw { code: "40001" };
    }
    return fallback(name, args);
  });

  render(<RoomsPage />);
  const user = userEvent.setup();
  const contact = screen.getByRole("region", { name: "Contato da sala" });
  await user.click(
    await within(contact).findByRole("button", { name: "Editar contato" }),
  );
  const save = within(contact).getByRole<HTMLButtonElement>("button", {
    name: "Salvar contato",
  });
  await user.click(save);
  expect((await within(contact).findByRole("alert")).textContent).toContain(
    "O contato mudou",
  );
  expect(save.disabled).toBe(true);
  await user.click(
    within(contact).getByRole("button", {
      name: "Consultar contato atualizado",
    }),
  );
  await within(contact).findByText("Contato atualizado por outra sessão");
  expect(
    within(contact).queryByRole("button", { name: "Salvar contato" }),
  ).toBeNull();
});

it("aba de diretas usa RPC própria, cursor e filtros sem misturar as origens", async () => {
  state.permissions = ["schedule.read", "manage"];
  const direct = {
    id: "D1",
    booked_for: "Reserva direta sintética",
    status: "cancelled",
    starts_at: "2020-01-03T02:40:00Z",
    ends_at: "2020-01-03T02:59:00Z",
    created_at: "2019-12-20T12:00:00Z",
    updated_at: "2019-12-22T12:00:00Z",
    created_by_name: "Gestora sintética",
    cancelled_at: "2019-12-22T12:00:00Z",
    cancelled_by_name: "Substituta sintética",
    cancel_reason: "Motivo sintético",
    secretary_notes: "<b>Somente texto</b>",
  };
  const fallback = state.rpc.getMockImplementation()!;
  state.rpc.mockImplementation(async (name, args) =>
    name === "direct_history"
      ? args.p_before_id
        ? {
            items: [{ ...direct, id: "D2", booked_for: "Página seguinte" }],
            has_more: false,
          }
        : { items: [direct], has_more: true }
      : fallback(name, args),
  );

  const { container } = render(<RoomsPage />);
  expect(
    await screen.findByText("Nenhuma solicitação encontrada."),
  ).toBeTruthy();
  expect(state.rpc.mock.calls.some(([name]) => name === "direct_history")).toBe(
    false,
  );
  const user = userEvent.setup();
  await user.tab();
  screen.getByRole("tab", { name: "Solicitações" }).focus();
  await user.keyboard("{ArrowRight}");
  const tab = screen.getByRole("tab", {
    name: "Reservas diretas",
    selected: true,
  });
  expect(document.activeElement).toBe(tab);
  const panel = within(
    screen.getByRole("tabpanel", { name: "Reservas diretas" }),
  );
  await panel.findByText("Reserva direta sintética");
  expect(panel.getByText("02/01/2020, 23:40")).toBeTruthy();
  await user.click(panel.getByText("Detalhes da reserva"));
  expect(
    panel.getByText("Observações da secretaria: <b>Somente texto</b>"),
  ).toBeTruthy();
  expect(container.querySelector(".room-history-details b")).toBeNull();

  await user.click(panel.getByRole("button", { name: "Próxima" }));
  await panel.findByText("Página seguinte");
  expect(panel.getByText("Página 2")).toBeTruthy();
  expect(state.rpc).toHaveBeenLastCalledWith(
    "direct_history",
    expect.objectContaining({
      p_before_start: direct.starts_at,
      p_before_id: direct.id,
    }),
  );
  await user.selectOptions(
    panel.getByLabelText("Status da reserva"),
    "cancelled",
  );
  await panel.findByText("Reserva direta sintética");
  expect(panel.getByText("Página 1")).toBeTruthy();
  expect(state.rpc).toHaveBeenLastCalledWith(
    "direct_history",
    expect.objectContaining({
      p_status: "cancelled",
      p_before_id: null,
    }),
  );
});
