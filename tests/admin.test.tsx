// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
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
  Organization,
  Profile,
  Role,
} from "../apps/web/src/core/types";
const api = vi.hoisted(() => ({
  list: vi.fn(),
  users: vi.fn(),
  organizations: vi.fn(),
  renameProfile: vi.fn(),
  setRoleActive: vi.fn(),
  PAGE_SIZE: 25,
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
// The unit access review answers as the server (RPCs/RLS) would; null = unavailable.
const review = vi.hoisted(() => ({
  UNIT_ACCESS_PAGE_SIZE: 25,
  unitAccessSummary: vi.fn(),
  unitAccessAssignments: vi.fn(),
  unitSectors: vi.fn(),
}));
vi.mock("../apps/web/src/core/admin/unit-access-review-api", () => review);
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
    api.organizations.mockResolvedValue({ rows: [], count: 0 });
    api.saveOrganization.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<OrganizationPage kind="units" />);
    await screen.findByText("Nenhuma unidade encontrada");
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
    api.organizations.mockResolvedValue({
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
    expect((await screen.findByRole("alert")).textContent).toContain("seu acesso pode ter mudado");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("confirms unit deactivation, and cancelling does not mutate", async () => {
    api.organizations.mockResolvedValue({
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
    await waitFor(() => expect(api.organizations).toHaveBeenCalledTimes(2));
  });
  it("keeps a failed activation dialog open with a safe error", async () => {
    api.organizations.mockResolvedValue({
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
    api.organizations.mockResolvedValue({
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
  it("keeps the user list readable and never offers self-deactivation", async () => {
    api.users.mockResolvedValue({
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
    expect(screen.queryByText("11111111-2222-3333-4444-555555555555")).toBeNull();
    expect(screen.getByText(/Ativar uma conta não restaura suas atribuições revogadas/)).toBeTruthy();
    expect(screen.queryByText(/administração do Auth/)).toBeNull();
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
  it("hides inactive users by default and filters by name", async () => {
    api.users.mockResolvedValue({ rows: [profile()], count: 1 });
    const user = userEvent.setup();
    render(<UsersPage />);
    await screen.findByText("Ana Souza");
    expect(api.users).toHaveBeenLastCalledWith(0, {
      search: "",
      inactive: false,
    });
    await user.click(screen.getByLabelText("Exibir inativos"));
    await waitFor(() =>
      expect(api.users).toHaveBeenLastCalledWith(0, {
        search: "",
        inactive: true,
      }),
    );
    await user.type(screen.getByRole("searchbox"), " Ana ");
    await waitFor(() =>
      expect(api.users).toHaveBeenLastCalledWith(0, {
        search: "Ana",
        inactive: true,
      }),
    );
  });
  it("offers to clear a search without results and hides the pager on one page", async () => {
    api.users.mockResolvedValue({ rows: [profile()], count: 1 });
    const user = userEvent.setup();
    render(<UsersPage />);
    await screen.findByText("Ana Souza");
    expect(screen.queryByRole("navigation", { name: "Paginação" })).toBeNull();
    api.users.mockResolvedValue({ rows: [], count: 0 });
    await user.type(screen.getByRole("searchbox"), "Zé");
    expect(
      await screen.findByText(/Nenhum nome ou e-mail corresponde a “Zé”/),
    ).toBeTruthy();
    api.users.mockResolvedValue({ rows: [profile()], count: 1 });
    await user.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect(await screen.findByText("Ana Souza")).toBeTruthy();
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
  });
  it("deactivates only after confirmation, using the row version", async () => {
    api.users.mockResolvedValue({ rows: [profile()], count: 1 });
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
    api.users.mockResolvedValue({ rows: [profile()], count: 1 });
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
    expect(screen.getByText("11111111-2222-3333-4444-555555555555").tagName).toBe("CODE");
    expect(api.all).not.toHaveBeenCalledWith("role_permissions");
    expect(screen.getByText(/Só é possível conceder perfis/)).toBeTruthy();
    expect(screen.queryByText(/O banco/)).toBeNull();
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
    expect(screen.queryByText("quality")).toBeNull();
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
    api.all.mockResolvedValue(permissions);
    render(<PermissionsPage />);
    expect(await screen.findByText("Gerenciar usuários")).toBeTruthy();
    expect(screen.queryByText(/migrations/)).toBeNull();
    expect(screen.getByText(/composição é mantida pela equipe responsável pela plataforma/)).toBeTruthy();
    expect(api.all).toHaveBeenCalledWith("permissions");
    expect(screen.getByText("admin.user.manage").tagName).toBe("CODE");
    // Grouped by domain: one titled section and list per domain, in catalog order.
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["Administração1", "Auditoria1"]);
    const admin = screen.getByRole("list", { name: "Administração" });
    expect(within(admin).getByText("Gerenciar usuários")).toBeTruthy();
    expect(within(admin).queryByText("Consultar auditorias")).toBeNull();
    // The description leads; the key is secondary and resource/action are not repeated.
    expect(screen.queryByText(/Recurso:/)).toBeNull();
    // Read-only and complete on one screen: no editing, no pagination.
    expect(screen.queryAllByRole("button")).toEqual([]);
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
    expect(await screen.findByText("0 de 2 unidades vinculadas")).toBeTruthy();
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
describe("Elo lists", () => {
  const unit = (over: Partial<Organization>): Organization => ({
    id: "u",
    version: 1,
    code: "CMD",
    name: "Unidade CMD",
    active: true,
    ...stamp,
    ...over,
  });
  it("filters units by code or name and state, and offers to clear a search without results", async () => {
    api.organizations.mockResolvedValue({ rows: [unit({})], count: 1 });
    const user = userEvent.setup();
    render(<OrganizationPage kind="units" />);
    await screen.findByText("Unidade CMD");
    expect(api.organizations).toHaveBeenLastCalledWith("units", 0, {
      search: "",
      inactive: false,
    });
    expect(screen.getByRole("status").textContent).toBe("1 unidade ativa");
    await user.click(screen.getByLabelText("Exibir inativas"));
    await waitFor(() =>
      expect(api.organizations).toHaveBeenLastCalledWith("units", 0, {
        search: "",
        inactive: true,
      }),
    );
    api.organizations.mockResolvedValue({ rows: [], count: 0 });
    await user.type(screen.getByRole("searchbox"), "Zé");
    expect(
      await screen.findByText(/Nenhum código ou nome corresponde a “Zé”/),
    ).toBeTruthy();
    api.organizations.mockResolvedValue({ rows: [unit({})], count: 1 });
    await user.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect(await screen.findByText("Unidade CMD")).toBeTruthy();
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
  });
  it.each(["units", "sectors"] as const)("advertises code-or-name search for %s", async (kind) => {
    api.organizations.mockResolvedValue({ rows: [], count: 0 });
    const user = userEvent.setup();
    render(<OrganizationPage kind={kind} />);
    expect(screen.getByRole("searchbox").getAttribute("placeholder")).toBe(
      kind === "units" ? "Código ou nome da unidade" : "Código ou nome do setor",
    );
    await user.type(screen.getByRole("searchbox"), "CMD");
    expect(await screen.findByText(/Nenhum código ou nome corresponde a “CMD”/)).toBeTruthy();
  });
  it("confirms reactivation as a primary action and deactivation as a destructive one", async () => {
    api.organizations.mockResolvedValue({
      rows: [
        unit({}),
        unit({ id: "x", code: "OLD", name: "Unidade Antiga", active: false }),
      ],
      count: 2,
    });
    const user = userEvent.setup();
    render(<OrganizationPage kind="units" />);
    const confirmButton = () =>
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Confirmar",
      });
    await user.click(
      await screen.findByRole("button", { name: "Ativar Unidade Antiga" }),
    );
    expect(confirmButton().className).toBe("primary");
    await user.click(screen.getByText("Cancelar"));
    await user.click(
      screen.getByRole("button", { name: "Desativar Unidade CMD" }),
    );
    expect(confirmButton().className).toBe("danger");
  });
  it("paginates only when the result spans more than one page", async () => {
    api.organizations.mockResolvedValue({ rows: [unit({})], count: 26 });
    const user = userEvent.setup();
    render(<OrganizationPage kind="sectors" />);
    const pager = await screen.findByRole("navigation", { name: "Paginação" });
    expect(
      within(pager).getByText("26 registros · Página 1 de 2"),
    ).toBeTruthy();
    expect(
      (within(pager).getByText("Anterior") as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.click(within(pager).getByText("Próxima"));
    await waitFor(() =>
      expect(api.organizations).toHaveBeenLastCalledWith("sectors", 1, {
        search: "",
        inactive: false,
      }),
    );
    cleanup();
    api.organizations.mockResolvedValue({ rows: [unit({})], count: 25 });
    render(<OrganizationPage kind="sectors" />);
    await screen.findByText("Unidade CMD");
    expect(screen.queryByRole("navigation", { name: "Paginação" })).toBeNull();
  });
  it("moves back to the last page when the current one empties", async () => {
    api.users.mockResolvedValue({ rows: [profile()], count: 26 });
    const user = userEvent.setup();
    render(<UsersPage />);
    const pager = await screen.findByRole("navigation", { name: "Paginação" });
    // The only row of page 2 was deactivated elsewhere: 25 active users remain.
    api.users.mockResolvedValue({ rows: [], count: 25 });
    await user.click(within(pager).getByText("Próxima"));
    await waitFor(() =>
      expect(api.users).toHaveBeenLastCalledWith(0, {
        search: "",
        inactive: false,
      }),
    );
    expect(api.users.mock.calls.map(([page]) => page)).toEqual([0, 1, 0]);
    expect(screen.queryByText("Nenhum usuário encontrado")).toBeNull();
  });
});
describe("unit access navigation", () => {
  const unitRow = (over: Partial<Organization> = {}): Organization => ({
    id: "u",
    version: 1,
    code: "CMD",
    name: "Unidade CMD",
    active: true,
    ...stamp,
    ...over,
  });
  const summaryOf = ({ id, code, name }: Organization) => ({
    unit_id: id,
    unit_code: code,
    unit_name: name,
    unit_active: true,
    unit_version: 1,
    sector_id: null,
    people_visibility: "available",
    people_count: 0,
    effective_people_count: 0,
    global_assignment_count: 0,
    unit_assignment_count: 0,
    sector_assignment_count: 0,
    evaluated_at: "2026-10-08T12:00:00Z",
  });
  const rows = [unitRow(), unitRow({ id: "v", code: "POA", name: "Porto Alegre" })];
  beforeEach(() => {
    api.organizations.mockResolvedValue({ rows, count: 2 });
    review.unitAccessSummary.mockImplementation(async (id: string) =>
      summaryOf(rows.find((r) => r.id === id)!),
    );
    review.unitAccessAssignments.mockResolvedValue({ rows: [], count: 0, people: 0 });
    review.unitSectors.mockResolvedValue([]);
  });
  const dialog = () => screen.getByRole("dialog");

  it("opens the read-only review of the row's unit and restores focus on close", async () => {
    const user = userEvent.setup();
    render(<OrganizationPage kind="units" />);
    const trigger = await screen.findByRole("button", {
      name: "Acessos de Unidade CMD",
    });
    await user.click(trigger);
    expect(within(dialog()).getByRole("heading", { name: "Acessos · Unidade CMD" })).toBeTruthy();
    expect(await within(dialog()).findByRole("heading", { name: /CMD Unidade CMD/ })).toBeTruthy();
    expect(await within(dialog()).findByText("Nenhuma atribuição encontrada")).toBeTruthy();
    expect(review.unitAccessSummary).toHaveBeenCalledWith("u", null);
    expect(review.unitAccessAssignments).toHaveBeenCalledWith("u", 0, {
      sector: null,
      includeRevoked: false,
    });
    for (const name of [/editar/i, /desativar/i, /revogar/i, /conceder/i, /salvar/i])
      expect(within(dialog()).queryByRole("button", { name })).toBeNull();
    await user.click(within(dialog()).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(api.saveOrganization).not.toHaveBeenCalled();
    expect(api.organizations).toHaveBeenCalledOnce();
  });

  it("opens by keyboard, closes with Escape and keeps filters and page", async () => {
    api.organizations.mockResolvedValue({ rows, count: 30 });
    const user = userEvent.setup();
    render(<OrganizationPage kind="units" />);
    await user.click(await screen.findByLabelText("Exibir inativas"));
    await user.type(screen.getByRole("searchbox"), "a");
    // Page only after the search debounce settled (it returns to the first page).
    await waitFor(() =>
      expect(api.organizations).toHaveBeenLastCalledWith("units", 0, {
        search: "a",
        inactive: true,
      }),
    );
    await user.click(within(await screen.findByRole("navigation", { name: "Paginação" })).getByText("Próxima"));
    await waitFor(() =>
      expect(api.organizations).toHaveBeenLastCalledWith("units", 1, {
        search: "a",
        inactive: true,
      }),
    );
    await screen.findByText("30 registros · Página 2 de 2");
    const calls = api.organizations.mock.calls.length;
    const trigger = screen.getByRole("button", { name: "Acessos de Porto Alegre" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(await within(dialog()).findByRole("heading", { name: /POA Porto Alegre/ })).toBeTruthy();
    fireEvent(dialog(), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByText("30 registros · Página 2 de 2")).toBeTruthy();
    expect((screen.getByLabelText("Exibir inativas") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("a");
    expect(api.organizations).toHaveBeenCalledTimes(calls);
  });

  it("shows the server's neutral answer when the unit is restricted", async () => {
    review.unitAccessSummary.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<OrganizationPage kind="units" />);
    await user.click(await screen.findByRole("button", { name: "Acessos de Unidade CMD" }));
    expect(await within(dialog()).findByText(/Unidade indisponível/)).toBeTruthy();
    expect(review.unitAccessAssignments).not.toHaveBeenCalled();
  });

  it("is offered without admin.unit.manage; management actions stay hidden", async () => {
    auth.denied = new Set(["admin.unit.manage"]);
    const user = userEvent.setup();
    render(<OrganizationPage kind="units" />);
    await user.click(await screen.findByRole("button", { name: "Acessos de Unidade CMD" }));
    expect(await within(dialog()).findByRole("heading", { name: /CMD Unidade CMD/ })).toBeTruthy();
    expect(screen.queryByText("Nova unidade")).toBeNull();
    expect(screen.queryByRole("button", { name: /^(Editar|Capa de|Desativar|Ativar) / })).toBeNull();
  });

  it("does not carry a previous unit into the next review", async () => {
    const user = userEvent.setup();
    render(<OrganizationPage kind="units" />);
    await user.click(await screen.findByRole("button", { name: "Acessos de Unidade CMD" }));
    await within(dialog()).findByRole("heading", { name: /CMD Unidade CMD/ });
    await user.click(within(dialog()).getByRole("button", { name: "Fechar" }));
    let resolve!: (v: unknown) => void;
    review.unitAccessSummary.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    await user.click(screen.getByRole("button", { name: "Acessos de Porto Alegre" }));
    expect(within(dialog()).queryByText(/Unidade CMD/)).toBeNull();
    expect(within(dialog()).getByText("Carregando acessos da unidade…")).toBeTruthy();
    resolve(summaryOf(rows[1]));
    expect(await within(dialog()).findByRole("heading", { name: /POA Porto Alegre/ })).toBeTruthy();
    expect(within(dialog()).queryByText(/Unidade CMD/)).toBeNull();
  });

  it("leaves sectors unchanged: no access review, sector units still offered", async () => {
    render(<OrganizationPage kind="sectors" />);
    await screen.findByText("Unidade CMD");
    expect(screen.queryByRole("button", { name: /^Acessos de/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Unidades de Unidade CMD" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Editar Unidade CMD" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Capa de/ })).toBeNull();
    expect(review.unitAccessSummary).not.toHaveBeenCalled();
  });
});
describe("administration gaps closed for production", () => {
  it("shows e-mail and last access, and renames other users at the shown version", async () => {
    api.users.mockResolvedValue({
      rows: [
        {
          ...profile(),
          email: "ana@example.test",
          last_sign_in_at: "2026-10-07T17:32:00Z",
        },
        {
          ...profile({ id: "me", display_name: "Eu Mesmo" }),
          email: "eu@example.test",
          last_sign_in_at: null,
        },
      ],
      count: 2,
    });
    api.renameProfile.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<UsersPage />);
    expect(await screen.findByText("ana@example.test")).toBeTruthy();
    expect(screen.getByText(/^Último acesso \d{2}\/10\/2026/)).toBeTruthy();
    expect(screen.getByText("Nunca acessou")).toBeTruthy();
    expect(screen.getByRole("searchbox").getAttribute("placeholder")).toBe(
      "Nome ou e-mail",
    );
    // Never on the own account (the database policy forbids it too).
    expect(
      screen.queryByRole("button", { name: "Renomear Eu Mesmo" }),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Renomear Ana Souza" }),
    );
    const input = within(screen.getByRole("dialog")).getByLabelText(
      "Nome de exibição",
    );
    await user.clear(input);
    await user.type(input, "  Ana Souza Lima ");
    await user.click(screen.getByText("Salvar"));
    await waitFor(() =>
      expect(api.renameProfile).toHaveBeenCalledWith(
        "11111111-2222-3333-4444-555555555555",
        3,
        "Ana Souza Lima",
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.users).toHaveBeenCalledTimes(2);
  });
  it("offers no rename without admin.user.manage", async () => {
    auth.denied = new Set(["admin.user.manage"]);
    api.users.mockResolvedValue({ rows: [profile()], count: 1 });
    render(<UsersPage />);
    await screen.findByText("Ana Souza");
    expect(screen.queryByRole("button", { name: /^Renomear/ })).toBeNull();
  });
  it("deactivates and reactivates custom roles only, with the matching confirmation", async () => {
    const custom = role({
      id: "r2",
      key: "custom",
      name: "Custom",
      system: false,
    });
    api.list.mockResolvedValue({ rows: [role(), custom], count: 2 });
    api.setRoleActive.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<RolesPage />);
    await user.click(
      await screen.findByRole("button", { name: "Desativar Custom" }),
    );
    expect(
      screen.queryByRole("button", { name: "Desativar Quality" }),
    ).toBeNull();
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("As atribuições são mantidas");
    const confirm = within(dialog).getByRole("button", { name: "Confirmar" });
    expect(confirm.className).toBe("danger");
    await user.click(confirm);
    await waitFor(() =>
      expect(api.setRoleActive).toHaveBeenCalledWith(custom, false),
    );
    cleanup();
    auth.denied = new Set(["admin.role.manage"]);
    render(<RolesPage />);
    await screen.findByText("Custom");
    expect(
      screen.queryByRole("button", { name: /^(Desativar|Ativar) / }),
    ).toBeNull();
  });
  it("keeps the assignments dialog open on Cancelar and resolves names for read-only administrators", async () => {
    api.all.mockImplementation(async (table: string) =>
      table === "roles"
        ? [role()]
        : table === "units"
          ? [{ id: "U1", name: "Cozinha Central", active: true }]
          : [],
    );
    assignments.rows = [
      {
        id: "a",
        version: 1,
        user_id: "u",
        role_id: "r1",
        scope_type: "unit",
        unit_id: "U1",
        sector_id: null,
        active: true,
        granted_by: null,
        ...stamp,
      },
    ];
    const user = userEvent.setup();
    render(<UserAssignments profile={profile()} onClose={() => {}} />);
    await screen.findByText("Cozinha Central");
    await user.selectOptions(screen.getByLabelText("Perfil de acesso"), "r1");
    await user.click(screen.getByText("Cancelar"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      (screen.getByLabelText("Perfil de acesso") as HTMLSelectElement).value,
    ).toBe("");
    cleanup();
    auth.denied = new Set(["admin.user.manage"]);
    render(<UserAssignments profile={profile()} onClose={() => {}} />);
    // Without manage the unit name still resolves (RLS decides what is visible).
    expect(await screen.findByText("Cozinha Central")).toBeTruthy();
    expect(api.all).toHaveBeenCalledWith("units");
  });
  it("filters logs by every module and by domain events", async () => {
    api.logs.mockResolvedValue({
      rows: [
        {
          id: "l2",
          occurred_at: "2026-10-01T12:00:00Z",
          actor_user_id: null,
          module: "audit",
          action: "finalize",
          entity_type: "inspection",
          entity_id: "I1",
          unit_id: null,
          sector_id: null,
          before_data: null,
          after_data: null,
          metadata: null,
          correlation_id: null,
        },
      ],
      count: 1,
    });
    render(<LogsPage />);
    expect(await screen.findByText("Finalização")).toBeTruthy();
    expect(screen.getAllByText("Auditoria").length).toBeGreaterThan(0);
    const modules = within(screen.getByLabelText("Módulo"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(modules).toEqual([
      "Todos",
      "Plataforma",
      "Auditoria",
      "Planos de ação",
    ]);
    const actions = within(screen.getByLabelText("Ação"))
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    for (const action of [
      "finalize",
      "reopen",
      "evidence_add",
      "verify",
      "grant",
    ])
      expect(actions).toContain(action);
  });
});
