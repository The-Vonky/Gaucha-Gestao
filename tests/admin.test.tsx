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
import { Confirm } from "../apps/web/src/shared/ui";
import { OrganizationPage } from "../apps/web/src/core/admin/OrganizationPage";
import { UsersPage } from "../apps/web/src/core/admin/UsersPage";
import { RolesPage } from "../apps/web/src/core/admin/RolesPage";
import { RoleEditor } from "../apps/web/src/core/admin/RoleEditor";
import { PermissionsPage } from "../apps/web/src/core/admin/PermissionsPage";
import { SectorUnits } from "../apps/web/src/core/admin/SectorUnits";
import { UserAssignments } from "../apps/web/src/core/admin/UserAssignments";
import { LogsPage } from "../apps/web/src/core/admin/LogsPage";
import type {
  Assignment,
  AuditLog,
  Profile,
  Role,
} from "../apps/web/src/core/types";
const api = vi.hoisted(() => ({
  list: vi.fn(),
  saveOrganization: vi.fn(),
  all: vi.fn(),
  setProfileActive: vi.fn(),
  grantAssignment: vi.fn(),
  revokeAssignment: vi.fn(),
  saveRole: vi.fn(),
  setUnitSector: vi.fn(),
  logs: vi.fn(),
  roleDetail: vi.fn(),
}));
vi.mock("../apps/web/src/core/admin/api", () => api);
// Mutable per test: which permissions the signed-in user holds.
const auth = vi.hoisted(() => ({
  denied: new Set<string>(),
  profile: { id: "me" },
}));
vi.mock("../apps/web/src/core/auth/AuthProvider", () => ({
  useAuth: () => ({
    can: (p: string) => !auth.denied.has(p),
    profile: auth.profile,
    refresh: vi.fn(),
  }),
}));
const assignments = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock("../apps/web/src/core/client", () => ({
  database: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: assignments.rows, error: null }),
        }),
      }),
    }),
  }),
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
  auth.denied = new Set();
});
const stamp = { created_at: "", updated_at: "" };
const profile = (over: Partial<Profile> = {}): Profile => ({
  id: "11111111-2222-3333-4444-555555555555",
  version: 3,
  display_name: "Ana Souza",
  active: true,
  ...stamp,
  ...over,
});
const role = (over: Partial<Role> = {}): Role => ({
  id: "r1",
  version: 1,
  key: "quality",
  name: "Quality",
  description: "Operação de Qualidade",
  system: true,
  active: true,
  global_only: false,
  ...stamp,
  ...over,
});
const permissions = [
  {
    key: "admin.user.manage",
    domain: "admin",
    resource: "user",
    action: "manage",
    description: "Gerenciar usuários",
    active: true,
  },
  {
    key: "audit.inspection.read",
    domain: "audit",
    resource: "inspection",
    action: "read",
    description: "Consultar auditorias",
    active: true,
  },
];
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
  it("confirms unit deactivation, and cancelling does not mutate", async () => {
    api.list.mockResolvedValue({
      rows: [
        { id: "u", version: 4, code: "CMD", name: "Unidade CMD", active: true },
      ],
      count: 1,
    });
    api.saveOrganization.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<OrganizationPage kind="units" />);
    await user.click(
      await screen.findByRole("button", { name: "Desativar Unidade CMD" }),
    );
    expect(screen.getByRole("dialog").textContent).toContain(
      "o histórico será preservado",
    );
    await user.click(screen.getByText("Cancelar"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.saveOrganization).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Desativar Unidade CMD" }),
    );
    await user.click(screen.getByText("Confirmar"));
    await waitFor(() =>
      expect(api.saveOrganization).toHaveBeenCalledWith(
        "units",
        expect.objectContaining({ id: "u", version: 4 }),
        { code: "CMD", name: "Unidade CMD", active: false },
      ),
    );
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  });
  it("keeps a failed activation dialog open with a safe error", async () => {
    api.list.mockResolvedValue({
      rows: [
        { id: "u", version: 1, code: "X", name: "Unidade X", active: false },
      ],
      count: 1,
    });
    api.saveOrganization.mockRejectedValue({
      code: "40001",
      message: "stale row detail",
    });
    const user = userEvent.setup();
    render(<OrganizationPage kind="units" />);
    await user.click(
      await screen.findByRole("button", { name: "Ativar Unidade X" }),
    );
    await user.click(screen.getByText("Confirmar"));
    expect(
      await within(screen.getByRole("dialog")).findByRole("alert"),
    ).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByText("stale row detail")).toBeNull();
  });
  it("hides unit actions without management permission", async () => {
    auth.denied = new Set(["admin.unit.manage"]);
    api.list.mockResolvedValue({
      rows: [
        { id: "u", version: 1, code: "CMD", name: "Unidade CMD", active: true },
      ],
      count: 1,
    });
    render(<OrganizationPage kind="units" />);
    expect(await screen.findByText("Unidade CMD")).toBeTruthy();
    expect(screen.getByText("Ativo")).toBeTruthy();
    expect(screen.queryByText("Nova unidade")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Editar|Desativar/ }),
    ).toBeNull();
  });
});
describe("users", () => {
  it("lists the name first, the UUID as secondary text and never offers self-deactivation", async () => {
    api.list.mockResolvedValue({
      rows: [
        profile(),
        profile({ id: "me", display_name: "Eu Mesmo" }),
        profile({ id: "x", display_name: "Bia Inativa", active: false }),
      ],
      count: 3,
    });
    render(<UsersPage />);
    const name = await screen.findByText("Ana Souza");
    expect(name.tagName).toBe("STRONG");
    expect(
      screen.getByText("11111111-2222-3333-4444-555555555555").tagName,
    ).toBe("CODE");
    expect(screen.getByText("Você")).toBeTruthy();
    expect(screen.getAllByText("Ativo")).toHaveLength(2);
    expect(screen.getByText("Inativo")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Desativar Ana Souza" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Ativar Bia Inativa" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /(Desativar|Ativar) Eu Mesmo/ }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Atribuições de Eu Mesmo" }),
    ).toBeTruthy();
  });
  it("deactivates only after confirmation, using the row version", async () => {
    api.list.mockResolvedValue({ rows: [profile()], count: 1 });
    api.setProfileActive.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<UsersPage />);
    await user.click(
      await screen.findByRole("button", { name: "Desativar Ana Souza" }),
    );
    expect(api.setProfileActive).not.toHaveBeenCalled();
    await user.click(screen.getByText("Confirmar"));
    await waitFor(() =>
      expect(api.setProfileActive).toHaveBeenCalledWith(
        "11111111-2222-3333-4444-555555555555",
        3,
        false,
      ),
    );
  });
  it("hides activation without admin.user.manage and opens assignments by keyboard", async () => {
    auth.denied = new Set(["admin.user.manage"]);
    api.list.mockResolvedValue({ rows: [profile()], count: 1 });
    api.all.mockResolvedValue([role()]);
    assignments.rows = [];
    const user = userEvent.setup();
    render(<UsersPage />);
    const open = await screen.findByRole("button", {
      name: "Atribuições de Ana Souza",
    });
    expect(screen.queryByRole("button", { name: /Desativar/ })).toBeNull();
    open.focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog");
    // The native dialog focuses its close control first.
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "Fechar" }),
    );
    expect(await within(dialog).findByText(/Sem atribuições/)).toBeTruthy();
    expect(within(dialog).queryByText("Conceder acesso")).toBeNull();
  });
});
describe("assignments", () => {
  const a = (over: Partial<Assignment>): Assignment => ({
    id: "a",
    version: 1,
    user_id: "u",
    role_id: "r1",
    scope_type: "global",
    unit_id: null,
    sector_id: null,
    active: true,
    granted_by: null,
    ...stamp,
    ...over,
  });
  function openFor(p: Profile) {
    api.all.mockImplementation(async (table: string) =>
      table === "roles"
        ? [role()]
        : table === "units"
          ? [{ id: "U1", name: "Cozinha Central", active: true }]
          : table === "sectors"
            ? [{ id: "S1", name: "Estoque", active: true }]
            : [],
    );
    render(<UserAssignments profile={p} onClose={() => {}} />);
  }
  it("groups current and revoked assignments with readable scope", async () => {
    assignments.rows = [
      a({ id: "g" }),
      a({ id: "s", scope_type: "sector", unit_id: "U1", sector_id: "S1" }),
      a({ id: "old", scope_type: "unit", unit_id: "U1", active: false }),
    ];
    openFor(profile());
    const current = await screen.findByRole("region", {
      name: "Atribuições vigentes",
    });
    expect(within(current).getAllByText("Quality")).toHaveLength(2);
    expect(within(current).getByText("Global")).toBeTruthy();
    expect(within(current).getByText("Setor na unidade")).toBeTruthy();
    expect(within(current).getByText("Cozinha Central")).toBeTruthy();
    expect(within(current).getByText("Estoque")).toBeTruthy();
    expect(within(current).getAllByText("Vigente")).toHaveLength(2);
    expect(
      within(current).getAllByRole("button", { name: /^Revogar/ }),
    ).toHaveLength(2);
    const revoked = screen.getByRole("region", {
      name: "Revogadas (histórico)",
    });
    expect(within(revoked).getByText("Revogada")).toBeTruthy();
    expect(
      within(revoked).queryByRole("button", { name: /Revogar/ }),
    ).toBeNull();
    expect(screen.getByText("Conceder acesso")).toBeTruthy();
  });
  it("never offers revocation on the current user's own assignments", async () => {
    assignments.rows = [a({ id: "g" })];
    openFor(profile({ id: "me" }));
    const current = await screen.findByRole("region", {
      name: "Atribuições vigentes",
    });
    expect(within(current).getByText("Global")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Revogar/ })).toBeNull();
  });
});
describe("roles and permissions", () => {
  it("distinguishes system from custom roles and consult from edit", async () => {
    api.list.mockResolvedValue({
      rows: [
        role(),
        role({
          id: "r2",
          key: "custom",
          name: "Custom",
          system: false,
          active: false,
        }),
      ],
      count: 2,
    });
    render(<RolesPage />);
    expect(await screen.findByText("Sistema · protegido")).toBeTruthy();
    expect(screen.getByText("Personalizado")).toBeTruthy();
    expect(screen.getByText("Inativo")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Consultar Quality" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Editar Custom" })).toBeTruthy();
    cleanup();
    auth.denied = new Set(["admin.role.manage"]);
    render(<RolesPage />);
    expect(
      await screen.findByRole("button", { name: "Consultar Custom" }),
    ).toBeTruthy();
    expect(screen.queryByText("Novo perfil")).toBeNull();
  });
  it("shows a system role read-only, grouped by domain", async () => {
    api.roleDetail.mockResolvedValue({
      role: role(),
      permission_keys: ["audit.inspection.read"],
    });
    api.all.mockResolvedValue(permissions);
    render(
      <RoleEditor selected={role()} onClose={() => {}} onSaved={() => {}} />,
    );
    expect(await screen.findByText("Somente consulta.")).toBeTruthy();
    expect(screen.getByText(/Perfil de sistema protegido/)).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: /Consultar perfil/ }),
    ).toBeTruthy();
    expect(screen.getByText("Consultar auditorias")).toBeTruthy();
    expect(screen.getByText("Auditoria")).toBeTruthy();
    expect(screen.queryByText("Gerenciar usuários")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText("Salvar")).toBeNull();
  });
  it("disables permissions the editor cannot grant and saves the checked set", async () => {
    auth.denied = new Set(["audit.inspection.read"]);
    const custom = role({ system: false, key: "custom", name: "Custom" });
    api.roleDetail.mockResolvedValue({ role: custom, permission_keys: [] });
    api.all.mockResolvedValue(permissions);
    api.saveRole.mockResolvedValue(undefined);
    const saved = vi.fn();
    const user = userEvent.setup();
    render(<RoleEditor selected={custom} onClose={() => {}} onSaved={saved} />);
    const grantable = await screen.findByRole("checkbox", {
      name: /Gerenciar usuários/,
    });
    const blocked = screen.getByRole("checkbox", {
      name: /Consultar auditorias/,
    });
    expect((grantable as HTMLInputElement).disabled).toBe(false);
    expect((blocked as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Não concedível/)).toBeTruthy();
    expect(screen.getByRole("group", { name: /Administração/ })).toBeTruthy();
    await user.click(grantable);
    await user.click(screen.getByText("Salvar"));
    await waitFor(() =>
      expect(api.saveRole).toHaveBeenCalledWith(custom, {
        key: "custom",
        name: "Custom",
        description: "Operação de Qualidade",
        permissions: ["admin.user.manage"],
      }),
    );
    expect(saved).toHaveBeenCalled();
  });
  it("is read-only when the role holds a permission the editor lacks", async () => {
    auth.denied = new Set(["audit.inspection.read"]);
    const custom = role({ system: false });
    api.roleDetail.mockResolvedValue({
      role: custom,
      permission_keys: ["audit.inspection.read"],
    });
    api.all.mockResolvedValue(permissions);
    render(
      <RoleEditor selected={custom} onClose={() => {}} onSaved={() => {}} />,
    );
    expect(
      await screen.findByText(/contém permissões que você não pode conceder/),
    ).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
  it("lists the permission catalog read-only with key, description and domain", async () => {
    api.list.mockResolvedValue({ rows: permissions, count: 2 });
    render(<PermissionsPage />);
    expect(await screen.findByText("Gerenciar usuários")).toBeTruthy();
    expect(screen.getByText("admin.user.manage").tagName).toBe("CODE");
    const list = screen.getByRole("list", { name: "Permissões" });
    expect(within(list).getByText("Administração")).toBeTruthy();
    expect(screen.getByText("Recurso: user · Ação: manage")).toBeTruthy();
    // Only pagination controls: no editing.
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Anterior",
      "Próxima",
    ]);
  });
});
describe("sector links", () => {
  it("explains blocked links and confirms before linking", async () => {
    api.all.mockImplementation(async (table: string) =>
      table === "units"
        ? [
            { id: "U1", name: "Cozinha Central", active: true },
            { id: "U2", name: "Unidade Antiga", active: false },
          ]
        : [],
    );
    api.setUnitSector.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <SectorUnits
        sector={{
          id: "S1",
          version: 1,
          code: "EST",
          name: "Estoque",
          active: true,
          ...stamp,
        }}
        onClose={() => {}}
      />,
    );
    expect(
      await screen.findByText("0 de 2 unidade(s) vinculada(s)"),
    ).toBeTruthy();
    const blocked = screen.getByRole("button", {
      name: "Vincular Unidade Antiga",
    });
    expect((blocked as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText(/Unidade inativa: não aceita novos vínculos/),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Vincular Cozinha Central" }),
    );
    expect(api.setUnitSector).not.toHaveBeenCalled();
    await user.click(screen.getByText("Confirmar"));
    await waitFor(() =>
      expect(api.setUnitSector).toHaveBeenCalledWith("U1", "S1", true),
    );
  });
});
describe("logs", () => {
  const log = (over: Partial<AuditLog> = {}): AuditLog => ({
    id: "l1",
    occurred_at: "2026-09-29T12:00:00Z",
    actor_user_id: null,
    module: "core",
    action: "update",
    entity_type: "units",
    entity_id: "U1",
    unit_id: null,
    sector_id: null,
    before_data: { name: "<img src=x onerror=alert(1)>" },
    after_data: { name: "Cozinha", note: "x".repeat(400) },
    metadata: null,
    correlation_id: null,
    ...over,
  });
  it("applies filters from the filter bar and resets them", async () => {
    api.logs.mockResolvedValue({ rows: [log()], count: 1 });
    const user = userEvent.setup();
    render(<LogsPage />);
    expect(
      await screen.findByText("Operação administrativa do banco"),
    ).toBeTruthy();
    await user.type(screen.getByLabelText("Módulo"), "core");
    await user.selectOptions(screen.getByLabelText("Ação"), "revoke");
    await user.click(screen.getByText("Filtrar"));
    await waitFor(() =>
      expect(api.logs).toHaveBeenLastCalledWith(0, {
        from: "",
        to: "",
        actor: "",
        module: "core",
        action: "revoke",
      }),
    );
    expect(screen.getByText("2 filtro(s) aplicado(s).")).toBeTruthy();
    await user.click(screen.getByText("Limpar"));
    await waitFor(() =>
      expect(api.logs).toHaveBeenLastCalledWith(0, {
        from: "",
        to: "",
        actor: "",
        module: "",
        action: "",
      }),
    );
  });
  it("shows event details with escaped JSON in scrollable regions", async () => {
    api.logs.mockResolvedValue({
      rows: [log({ actor_user_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" })],
      count: 1,
    });
    const user = userEvent.setup();
    render(<LogsPage />);
    await user.click(
      await screen.findByRole("button", {
        name: /^Detalhes: core \/ update em units/,
      }),
    );
    const dialog = screen.getByRole("dialog");
    const before = within(dialog).getByRole("region", { name: "Antes" });
    expect(before.tagName).toBe("PRE");
    expect(before.tabIndex).toBe(0);
    expect(before.textContent).toBe(
      JSON.stringify({ name: "<img src=x onerror=alert(1)>" }, null, 2),
    );
    expect(dialog.querySelector("img")).toBeNull();
    expect(
      within(dialog).getByRole("region", { name: "Depois" }).textContent,
    ).toContain("x".repeat(400));
    expect(
      within(dialog).getByText("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
    ).toBeTruthy();
  });
});
