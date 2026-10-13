// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserAccessReview } from "../apps/web/src/core/admin/UserAccessReview";
import { UsersPage } from "../apps/web/src/core/admin/UsersPage";
import type { Profile } from "../apps/web/src/core/types";
import type {
  AccessAssignment,
  UserAccessSummary,
} from "../apps/web/src/core/admin/user-access-review-api";
// Mocked RPC responses: the database (RPC + RLS) decides; the UI only renders.
const rpc = vi.hoisted(() => ({
  summary: [] as unknown[],
  assignments: [] as unknown[],
  error: null as unknown,
  calls: [] as [string, Record<string, unknown>][],
}));
vi.mock("../apps/web/src/core/client", () => ({
  database: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpc.calls.push([fn, args]);
      if (rpc.error) return { data: null, error: rpc.error };
      return {
        data: fn === "user_access_summary" ? rpc.summary : rpc.assignments,
        error: null,
      };
    },
  }),
}));
const adminApi = vi.hoisted(() => ({
  users: vi.fn(),
  PAGE_SIZE: 25,
}));
vi.mock("../apps/web/src/core/admin/api", () => adminApi);
vi.mock("../apps/web/src/core/auth/AuthProvider", () => ({
  useAuth: () => ({ can: () => true, profile: { id: "me" }, refresh: vi.fn() }),
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
  rpc.summary = [];
  rpc.assignments = [];
  rpc.error = null;
  rpc.calls = [];
});
const USER = "11111111-2222-3333-4444-555555555555";
const profile: Profile = {
  id: USER,
  version: 3,
  display_name: "Ana Souza",
  active: true,
  created_at: "",
  updated_at: "",
};
const summary = (over: Partial<UserAccessSummary> = {}) => ({
  user_id: USER,
  display_name: "Ana Souza",
  user_active: true,
  user_version: 3,
  active_assignment_count: "1",
  revoked_assignment_count: "0",
  effective_assignment_count: "1",
  composition_coverage: "complete",
  evaluated_at: "2026-10-08T12:00:00Z",
  ...over,
});
const assignment = (over: Partial<AccessAssignment> = {}) => ({
  assignment_id: "a1",
  assignment_version: 1,
  assignment_active: true,
  user_id: USER,
  user_display_name: "Ana Souza",
  user_active: true,
  role_id: "r1",
  role_key: "quality",
  role_name: "Qualidade",
  role_active: true,
  role_system: true,
  scope_type: "unit",
  unit_id: "u1",
  unit_code: "CMD",
  unit_name: "Unidade Centro",
  unit_active: true,
  unit_label_source: "current",
  sector_id: null,
  sector_code: null,
  sector_name: null,
  sector_active: null,
  sector_label_source: null,
  granted_by: "g1",
  granted_by_name: "Carla Admin",
  granted_at: "2026-10-01T12:00:00Z",
  updated_at: "2026-10-01T12:00:00Z",
  revoked_at: null,
  revoked_by: null,
  revoked_by_name: null,
  revocation_evidence: null,
  composition_visibility: "available",
  effective: true,
  active_permission_keys: ["audit.inspection.read"],
  inactive_permission_keys: [],
  total_count: "1",
  people_count: "1",
  ...over,
});
const open = () =>
  render(<UserAccessReview profile={profile} onClose={vi.fn()} />);
// Assignment rows only (permission keys are nested lists).
const items = async () =>
  Array.from(
    (await screen.findByRole("list", { name: "Atribuições do usuário" }))
      .children,
  ) as HTMLElement[];
describe("user access review", () => {
  it("shows profile, scope, grant and scoped permissions for a full reader", async () => {
    rpc.summary = [summary()];
    rpc.assignments = [assignment()];
    open();
    const [row] = await items();
    const r = within(row);
    expect(r.getByText("Qualidade")).toBeTruthy();
    expect(r.getByText("Unidade", { selector: ".badge" })).toBeTruthy();
    expect(r.getByText(/Unidade Centro/)).toBeTruthy();
    expect(r.getByText(/por Carla Admin/)).toBeTruthy();
    expect(r.getByText("Vigente")).toBeTruthy();
    expect(r.getByText("Concede permissões")).toBeTruthy();
    expect(r.getByText("audit.inspection.read")).toBeTruthy();
    // Technical identifiers stay secondary.
    expect(r.getByText("a1").closest(".adm-id")).toBeTruthy();
    expect(screen.getByText(/não comprova acesso a um registro de negócio/)).toBeTruthy();
    expect(rpc.calls).toEqual([
      ["user_access_summary", { p_user: USER }],
      [
        "user_access_assignments",
        { p_user: USER, p_include_revoked: false, p_limit: 10, p_offset: 0 },
      ],
    ]);
  });
  it("user-only reader sees restricted composition, never 'no permissions'", async () => {
    rpc.summary = [
      summary({
        effective_assignment_count: null,
        composition_coverage: "restricted",
      }),
    ];
    rpc.assignments = [
      assignment({
        composition_visibility: "restricted",
        effective: null,
        active_permission_keys: null,
        inactive_permission_keys: null,
      }),
    ];
    open();
    const [row] = await items();
    expect(within(row).getByText("Informação restrita")).toBeTruthy();
    expect(within(row).getByText(/Efeito: informação restrita/)).toBeTruthy();
    expect(within(row).queryByText("Concede permissões")).toBeNull();
    expect(screen.queryByText(/Nenhuma permissão/)).toBeNull();
    const metrics = screen.getByRole("group", { name: "Resumo de acesso" });
    expect(within(metrics).getByText("Informação restrita")).toBeTruthy();
    expect(within(metrics).getByText("Restrita")).toBeTruthy();
    expect(screen.getByText(/todos os perfis vigentes/)).toBeTruthy();
    expect(screen.getByText(/não significa ausência de permissões/)).toBeTruthy();
  });
  it("flags partially restricted composition and restricted unit labels", async () => {
    rpc.summary = [
      summary({
        active_assignment_count: "2",
        effective_assignment_count: null,
        composition_coverage: "partial",
      }),
    ];
    rpc.assignments = [
      assignment({
        unit_name: null,
        unit_code: null,
        unit_label_source: "restricted",
        total_count: "2",
      }),
      assignment({
        assignment_id: "a2",
        scope_type: "global",
        unit_id: null,
        unit_label_source: null,
        composition_visibility: "restricted",
        effective: null,
        active_permission_keys: null,
        total_count: "2",
      }),
    ];
    open();
    const [unit, global] = await items();
    expect(within(unit).getByText("Informação restrita")).toBeTruthy();
    expect(within(global).getByText("Todas as unidades e setores")).toBeTruthy();
    expect(screen.getByText(/parte dos perfis vigentes/)).toBeTruthy();
  });
  it("lists revoked history only on request, with or without revocation evidence", async () => {
    rpc.summary = [summary({ revoked_assignment_count: "2" })];
    rpc.assignments = [assignment()];
    const user = userEvent.setup();
    open();
    await items();
    expect(screen.queryByText("Revogada")).toBeNull();
    rpc.assignments = [
      assignment({ total_count: "3" }),
      assignment({
        assignment_id: "a2",
        assignment_active: false,
        effective: false,
        revoked_at: "2026-10-05T12:00:00Z",
        revoked_by: "g2",
        revoked_by_name: "Davi Gestor",
        revocation_evidence: "audit_event",
        total_count: "3",
      }),
      assignment({
        assignment_id: "a3",
        assignment_active: false,
        effective: false,
        revocation_evidence: "unavailable",
        total_count: "3",
      }),
    ];
    await user.click(screen.getByLabelText("Incluir revogadas (histórico)"));
    await waitFor(() =>
      expect(rpc.calls.at(-1)).toEqual([
        "user_access_assignments",
        { p_user: USER, p_include_revoked: true, p_limit: 10, p_offset: 0 },
      ]),
    );
    await waitFor(async () => expect(await items()).toHaveLength(3));
    const [, withEvent, without] = await items();
    expect(within(withEvent).getByText("Revogada")).toBeTruthy();
    expect(within(withEvent).getByText(/por Davi Gestor/)).toBeTruthy();
    // A revoked assignment is history, not a "no effect" judgement.
    expect(within(withEvent).queryByText(/Sem efeito/)).toBeNull();
    expect(
      within(without).getByText(/Evidência de revogação indisponível/),
    ).toBeTruthy();
  });
  it("explains why an assignment of an inactive user or role grants nothing", async () => {
    rpc.summary = [summary({ user_active: false, effective_assignment_count: "0" })];
    rpc.assignments = [
      assignment({ user_active: false, effective: false, total_count: "2" }),
      assignment({
        assignment_id: "a2",
        role_active: false,
        effective: false,
        total_count: "2",
      }),
    ];
    open();
    const [byUser, byRole] = await items();
    expect(screen.getByText(/Usuário inativo: nenhuma atribuição concede acesso/)).toBeTruthy();
    expect(within(byUser).getByText("Sem efeito · usuário inativo")).toBeTruthy();
    expect(within(byRole).getByText("Perfil inativo")).toBeTruthy();
  });
  it("role-only reader (no user audience) gets a denied state, not an empty one", async () => {
    rpc.summary = [];
    open();
    expect(await screen.findByText(/Revisão indisponível/)).toBeTruthy();
    expect(screen.queryByText(/Sem atribuições/)).toBeNull();
    expect(screen.queryByRole("group", { name: "Resumo de acesso" })).toBeNull();
    expect(rpc.calls.map(([fn]) => fn)).toEqual(["user_access_summary"]);
  });
  it("paginates assignments with stable offsets", async () => {
    rpc.summary = [summary({ active_assignment_count: "12" })];
    rpc.assignments = Array.from({ length: 10 }, (_, i) =>
      assignment({ assignment_id: `a${i}`, total_count: "12" }),
    );
    const user = userEvent.setup();
    open();
    await items();
    const pager = screen.getByRole("navigation", { name: "Paginação" });
    expect(within(pager).getByText(/Página 1 de 2/)).toBeTruthy();
    rpc.assignments = [
      assignment({ assignment_id: "a10", total_count: "12" }),
      assignment({ assignment_id: "a11", total_count: "12" }),
    ];
    await user.click(within(pager).getByText("Próxima"));
    await waitFor(() =>
      expect(rpc.calls.at(-1)?.[1]).toMatchObject({ p_offset: 10, p_limit: 10 }),
    );
    await waitFor(async () => expect(await items()).toHaveLength(2));
  });
  it("shows an empty state without assignments", async () => {
    rpc.summary = [summary({ active_assignment_count: "0", effective_assignment_count: "0" })];
    rpc.assignments = [];
    open();
    expect(await screen.findByText(/Sem atribuições vigentes/)).toBeTruthy();
  });
  it("shows a privacy-safe error with retry", async () => {
    rpc.error = { code: "XX000", message: "internal detail leaked" };
    const user = userEvent.setup();
    open();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/internal detail/)).toBeNull();
    rpc.error = null;
    rpc.summary = [summary()];
    rpc.assignments = [assignment()];
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await items()).toHaveLength(1);
  });
  it("opens from the users list next to the existing assignments action", async () => {
    adminApi.users.mockResolvedValue({ rows: [profile], count: 1 });
    rpc.summary = [summary()];
    rpc.assignments = [assignment()];
    const user = userEvent.setup();
    render(<UsersPage />);
    expect(
      await screen.findByRole("button", { name: "Atribuições de Ana Souza" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Revisar acesso de Ana Souza" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Revisão de acesso · Ana Souza",
    });
    expect(await within(dialog).findByText("Qualidade")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
