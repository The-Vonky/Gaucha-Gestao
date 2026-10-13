// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnitAccessReview } from "../apps/web/src/core/admin/UnitAccessReview";
import type {
  UnitAccessAssignment,
  UnitAccessSummary,
} from "../apps/web/src/core/admin/unit-access-review-api";
const api = vi.hoisted(() => ({
  UNIT_ACCESS_PAGE_SIZE: 25,
  unitAccessSummary: vi.fn(),
  unitAccessAssignments: vi.fn(),
  unitSectors: vi.fn(),
}));
vi.mock("../apps/web/src/core/admin/unit-access-review-api", () => api);
// The real adapter (tested below) talks to this fake PostgREST client.
const rpc = vi.hoisted(() => vi.fn());
vi.mock("../apps/web/src/core/client", () => ({
  client: { schema: () => ({ rpc }) },
}));
// Global permissions the operator holds (UI hint only; the mocked RPCs answer as the server).
const auth = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock("../apps/web/src/core/auth/AuthProvider", () => ({
  useAuth: () => ({ can: (p: string) => auth.granted.has(p) }),
}));
const UNIT = "00000000-0000-4000-8000-000000000001";
const SECTOR = "00000000-0000-4000-8000-000000000002";
function summary(over: Partial<UnitAccessSummary> = {}): UnitAccessSummary {
  return {
    unit_id: UNIT,
    unit_code: "POA",
    unit_name: "Porto Alegre",
    unit_active: true,
    unit_version: 1,
    sector_id: null,
    people_visibility: "available",
    people_count: 2,
    effective_people_count: 1,
    global_assignment_count: 1,
    unit_assignment_count: 1,
    sector_assignment_count: 1,
    evaluated_at: "2026-10-08T12:00:00Z",
    ...over,
  };
}
let seq = 0;
function row(over: Partial<UnitAccessAssignment> = {}): UnitAccessAssignment {
  seq += 1;
  return {
    assignment_id: `a-${seq}`,
    assignment_version: 1,
    assignment_active: true,
    user_id: "u-ana",
    user_display_name: "Ana Souza",
    user_active: true,
    role_id: "r-1",
    role_key: "gestor",
    role_name: "Gestor",
    role_active: true,
    role_system: false,
    scope_type: "unit",
    unit_id: UNIT,
    unit_code: "POA",
    unit_name: "Porto Alegre",
    unit_active: true,
    unit_label_source: "current",
    sector_id: null,
    sector_code: null,
    sector_name: null,
    sector_active: null,
    sector_label_source: null,
    granted_by: "u-admin",
    granted_by_name: "Admin Geral",
    granted_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
    revoked_at: null,
    revoked_by: null,
    revoked_by_name: null,
    revocation_evidence: null,
    composition_visibility: "available",
    effective: true,
    active_permission_keys: ["audit.inspection.read"],
    inactive_permission_keys: [],
    total_count: 1,
    people_count: 1,
    ...over,
  };
}
const page = (
  rows: UnitAccessAssignment[],
  count = rows.length,
  people = 1,
) => ({
  rows,
  count,
  people,
});
beforeEach(() => {
  seq = 0;
  auth.granted = new Set(["admin.user.read"]);
  api.unitAccessSummary.mockResolvedValue(summary());
  api.unitAccessAssignments.mockResolvedValue(page([row()]));
  api.unitSectors.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const metric = (label: string) =>
  screen.getByText(label).closest(".metric") as HTMLElement;
const total = () =>
  screen.getByText(/atribuiç/, { selector: ".adm-total" }).textContent;
describe("UnitAccessReview", () => {
  it("shows unit context, counts and grouped assignments with origins and states", async () => {
    api.unitAccessAssignments.mockResolvedValue(
      page(
        [
          row({
            scope_type: "global",
            unit_id: null,
            unit_code: null,
            unit_name: null,
            unit_active: null,
            unit_label_source: null,
            role_name: "Administrador",
          }),
          row({ role_name: "Gestor" }),
          row({
            user_id: "u-bia",
            user_display_name: "Bia Lima",
            user_active: false,
            scope_type: "sector",
            sector_id: SECTOR,
            sector_code: "COZ",
            sector_name: "Cozinha",
            sector_active: false,
            sector_label_source: "current",
            role_name: "Operador",
            effective: false,
          }),
        ],
        3,
        2,
      ),
    );
    render(<UnitAccessReview unitId={UNIT} />);
    expect(
      await screen.findByRole("heading", { name: /Porto Alegre/ }),
    ).toBeTruthy();
    expect(
      within(metric("Pessoas com atribuição ativa")).getByText("2"),
    ).toBeTruthy();
    expect(
      within(metric("Pessoas com acesso efetivo")).getByText("1"),
    ).toBeTruthy();
    const ana = await screen.findByRole("list", {
      name: "Atribuições de Ana Souza",
    });
    expect(within(ana).getByText("Global · toda a empresa")).toBeTruthy();
    expect(within(ana).getByText("Unidade POA · Porto Alegre")).toBeTruthy();
    expect(screen.getByText("Atribuições sobrepostas (2)")).toBeTruthy();
    const bia = screen.getByRole("list", { name: "Atribuições de Bia Lima" });
    expect(
      within(bia).getByText("Setor COZ · Cozinha (POA · Porto Alegre)"),
    ).toBeTruthy();
    expect(within(bia).getByText("Sem efeito · usuário inativo")).toBeTruthy();
    expect(within(bia).getByText("Setor inativo")).toBeTruthy();
    expect(screen.getByText("Usuário inativo")).toBeTruthy();
    expect(total()).toMatch(/2 pessoas · 3 atribuições ativas/);
    expect(api.unitAccessAssignments).toHaveBeenCalledWith(UNIT, 0, {
      sector: null,
      includeRevoked: false,
    });
  });

  it("never offers mutations", async () => {
    render(<UnitAccessReview unitId={UNIT} />);
    await screen.findByRole("list", { name: "Atribuições de Ana Souza" });
    for (const name of [
      /editar/i,
      /revogar/i,
      /conceder/i,
      /desativar/i,
      /salvar/i,
    ])
      expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("restricted people: shows Restrito instead of zero and never lists people", async () => {
    auth.granted = new Set(["admin.unit.read"]);
    api.unitAccessSummary.mockResolvedValue(
      summary({
        people_visibility: "restricted",
        people_count: null,
        effective_people_count: null,
        global_assignment_count: null,
        unit_assignment_count: null,
        sector_assignment_count: null,
      }),
    );
    render(<UnitAccessReview unitId={UNIT} />);
    expect(
      await screen.findByText(/não permite listar\s+pessoas/),
    ).toBeTruthy();
    for (const label of [
      "Pessoas com atribuição ativa",
      "Pessoas com acesso efetivo",
      "Atribuições globais",
      "Atribuições da unidade",
      "Atribuições de setores",
    ]) {
      expect(within(metric(label)).getByText("Restrito")).toBeTruthy();
      expect(within(metric(label)).queryByText("0")).toBeNull();
    }
    expect(api.unitAccessAssignments).not.toHaveBeenCalled();
    expect(api.unitSectors).not.toHaveBeenCalled();
    expect(screen.queryByRole("list", { name: /Pessoas/ })).toBeNull();
  });

  it("unknown composition: effective people count is restricted, not zero", async () => {
    api.unitAccessSummary.mockResolvedValue(
      summary({ effective_people_count: null }),
    );
    api.unitAccessAssignments.mockResolvedValue(
      page([
        row({
          composition_visibility: "restricted",
          effective: null,
          active_permission_keys: null,
          inactive_permission_keys: null,
        }),
      ]),
    );
    render(<UnitAccessReview unitId={UNIT} />);
    expect(
      await screen.findByText("Efeito desconhecido · composição restrita"),
    ).toBeTruthy();
    const effective = metric("Pessoas com acesso efetivo");
    expect(within(effective).getByText("Restrito")).toBeTruthy();
    expect(
      screen.getByText("Permissões neste escopo (restritas)"),
    ).toBeTruthy();
    expect(screen.queryByText("Acesso efetivo")).toBeNull();
  });

  it("denied or absent unit: same neutral answer and no further reads", async () => {
    api.unitAccessSummary.mockResolvedValue(null);
    render(<UnitAccessReview unitId={UNIT} />);
    expect(await screen.findByText(/Unidade indisponível/)).toBeTruthy();
    expect(api.unitAccessAssignments).not.toHaveBeenCalled();
    expect(screen.queryByText("Porto Alegre")).toBeNull();
  });

  it("shows errors with retry", async () => {
    api.unitAccessSummary.mockRejectedValueOnce(new Error("Falha de rede"));
    render(<UnitAccessReview unitId={UNIT} />);
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /Não foi possível carregar os acessos da unidade/,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tentar novamente" }),
    );
    expect(
      await screen.findByRole("heading", { name: /Porto Alegre/ }),
    ).toBeTruthy();
  });

  it("shows the empty state", async () => {
    api.unitAccessAssignments.mockResolvedValue(page([], 0, 0));
    render(<UnitAccessReview unitId={UNIT} />);
    expect(
      await screen.findByText("Nenhuma atribuição encontrada"),
    ).toBeTruthy();
    expect(
      screen.getByText(/Incluir revogadas/, { selector: "p" }),
    ).toBeTruthy();
  });

  it("revoked history: audit evidence when readable, unavailable otherwise", async () => {
    api.unitAccessAssignments.mockResolvedValue(
      page(
        [
          row({
            assignment_active: false,
            effective: false,
            revoked_at: "2026-09-10T15:00:00Z",
            revoked_by: "u-admin",
            revoked_by_name: "Admin Geral",
            revocation_evidence: "audit_event",
          }),
          row({
            assignment_active: false,
            effective: false,
            role_name: "Auditor",
            revocation_evidence: "unavailable",
            granted_by_name: null,
          }),
        ],
        2,
      ),
    );
    render(<UnitAccessReview unitId={UNIT} />);
    await userEvent.click(
      await screen.findByRole("checkbox", { name: /Incluir revogadas/ }),
    );
    await waitFor(() =>
      expect(api.unitAccessAssignments).toHaveBeenLastCalledWith(UNIT, 0, {
        sector: null,
        includeRevoked: true,
      }),
    );
    expect(
      await screen.findByText(/Revogada em .* por Admin Geral\./),
    ).toBeTruthy();
    expect(
      screen.getByText(/Autor e data da revogação indisponíveis/),
    ).toBeTruthy();
    // Grantor exists but its profile is not readable: never shown as missing.
    expect(screen.getByText(/por usuário restrito\./)).toBeTruthy();
    expect(
      screen.getAllByText("Sem efeito · atribuição revogada"),
    ).toHaveLength(2);
  });

  it("restricted labels and inactive role are explicit", async () => {
    api.unitAccessAssignments.mockResolvedValue(
      page(
        [
          row({
            scope_type: "sector",
            sector_id: SECTOR,
            sector_label_source: "restricted",
            role_active: false,
            effective: false,
          }),
          row({
            role_name: "Vazio",
            active_permission_keys: [],
            effective: false,
          }),
        ],
        2,
      ),
    );
    render(<UnitAccessReview unitId={UNIT} />);
    expect(
      await screen.findByText("Setor setor restrito (POA · Porto Alegre)"),
    ).toBeTruthy();
    expect(screen.getByText("Perfil inativo")).toBeTruthy();
    expect(screen.getByText("Sem efeito · perfil inativo")).toBeTruthy();
    expect(
      screen.getByText("Sem efeito · perfil sem permissões ativas"),
    ).toBeTruthy();
  });

  it("sector filter is hidden without the sector catalog", async () => {
    render(<UnitAccessReview unitId={UNIT} />);
    expect(
      await screen.findByText(/Filtro por setor indisponível/),
    ).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Setor" })).toBeNull();
    expect(api.unitSectors).not.toHaveBeenCalled();
  });

  it("filters by a linked sector in both summary and assignments", async () => {
    auth.granted = new Set(["admin.user.read", "admin.sector.read"]);
    api.unitSectors.mockResolvedValue([
      { id: SECTOR, code: "COZ", name: "Cozinha", active: true },
    ]);
    render(<UnitAccessReview unitId={UNIT} />);
    const select = await screen.findByRole("combobox", { name: "Setor" });
    await waitFor(() =>
      expect((select as HTMLSelectElement).disabled).toBe(false),
    );
    await userEvent.selectOptions(select, SECTOR);
    await waitFor(() =>
      expect(api.unitAccessSummary).toHaveBeenLastCalledWith(UNIT, SECTOR),
    );
    await waitFor(() =>
      expect(api.unitAccessAssignments).toHaveBeenLastCalledWith(UNIT, 0, {
        sector: SECTOR,
        includeRevoked: false,
      }),
    );
  });

  it("paginates over the whole filtered set", async () => {
    api.unitAccessAssignments.mockResolvedValue(page([row()], 30, 12));
    render(<UnitAccessReview unitId={UNIT} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Próxima" }),
    );
    await waitFor(() =>
      expect(api.unitAccessAssignments).toHaveBeenLastCalledWith(UNIT, 1, {
        sector: null,
        includeRevoked: false,
      }),
    );
    expect(total()).toMatch(/12 pessoas · 30 atribuições ativas/);
  });

  it("moves back to the last page when the current one empties", async () => {
    api.unitAccessAssignments.mockResolvedValue(page([row()], 26, 2));
    render(<UnitAccessReview unitId={UNIT} />);
    const next = await screen.findByRole("button", { name: "Próxima" });
    // The only assignment of page 2 was revoked meanwhile: 25 remain.
    api.unitAccessAssignments.mockImplementation(async (_u, p: number) =>
      p ? page([], 25, 2) : page([row()], 25, 2),
    );
    await userEvent.click(next);
    await waitFor(() =>
      expect(
        api.unitAccessAssignments.mock.calls.map(([, p]) => p),
      ).toEqual([0, 1, 0]),
    );
    expect(total()).toMatch(/2 pessoas · 25 atribuições ativas/);
    expect(screen.queryByText("Nenhuma atribuição encontrada")).toBeNull();
  });
});

describe("unit-access-review-api", () => {
  const load = () =>
    vi.importActual<
      typeof import("../apps/web/src/core/admin/unit-access-review-api")
    >("../apps/web/src/core/admin/unit-access-review-api");

  it("keeps restricted figures null and converts bigint strings", async () => {
    const real = await load();
    rpc.mockResolvedValueOnce({
      data: [
        {
          ...summary(),
          people_visibility: "restricted",
          people_count: null,
          effective_people_count: null,
          global_assignment_count: null,
          unit_assignment_count: "0",
          sector_assignment_count: "12",
        },
      ],
      error: null,
    });
    const result = await real.unitAccessSummary(UNIT, null);
    expect(rpc).toHaveBeenCalledWith("unit_access_summary", {
      p_unit: UNIT,
      p_sector: null,
    });
    expect(result?.people_count).toBeNull();
    expect(result?.effective_people_count).toBeNull();
    expect(result?.unit_assignment_count).toBe(0);
    expect(result?.sector_assignment_count).toBe(12);
  });

  it("returns null for an absent or unreadable unit", async () => {
    const real = await load();
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await real.unitAccessSummary(UNIT, null)).toBeNull();
  });

  it("requests bounded pages and reads totals of the filtered set", async () => {
    const real = await load();
    rpc.mockResolvedValueOnce({
      data: [{ ...row(), total_count: "40", people_count: "7" }],
      error: null,
    });
    const result = await real.unitAccessAssignments(UNIT, 1, {
      sector: SECTOR,
      includeRevoked: true,
    });
    expect(rpc).toHaveBeenCalledWith("unit_access_assignments", {
      p_unit: UNIT,
      p_sector: SECTOR,
      p_include_revoked: true,
      p_limit: 25,
      p_offset: 25,
    });
    expect(result.count).toBe(40);
    expect(result.people).toBe(7);
  });

  it("reads the totals from the first page when a later page is empty", async () => {
    const real = await load();
    rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: [{ ...row(), total_count: "25", people_count: "4" }],
        error: null,
      });
    const result = await real.unitAccessAssignments(UNIT, 1, {
      sector: null,
      includeRevoked: false,
    });
    expect(rpc).toHaveBeenLastCalledWith("unit_access_assignments", {
      p_unit: UNIT,
      p_sector: null,
      p_include_revoked: false,
      p_limit: 1,
      p_offset: 0,
    });
    expect(result).toEqual({ rows: [], count: 25, people: 4 });
  });

  it("an empty first page is a true zero, read once", async () => {
    const real = await load();
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const result = await real.unitAccessAssignments(UNIT, 0, {
      sector: null,
      includeRevoked: false,
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(result).toEqual({ rows: [], count: 0, people: 0 });
  });

  it("propagates RPC errors", async () => {
    const real = await load();
    rpc.mockResolvedValueOnce({ data: null, error: new Error("negado") });
    await expect(
      real.unitAccessAssignments(UNIT, 0, {
        sector: null,
        includeRevoked: false,
      }),
    ).rejects.toThrow("negado");
  });
});
describe("unit access review styles", () => {
  // Every component stylesheet loads globally: a selector shared with the User Access
  // Review would let one review restyle the other (it once squeezed these KPIs).
  it("shares no class selector with the user access review", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const classes = async (file: string) =>
      new Set(
        (
          await readFile(join(process.cwd(), "apps/web/src/core/admin", file), "utf8")
        ).match(/\.[a-z][\w-]*/g),
      );
    const unit = await classes("unit-access-review.css");
    const user = await classes("user-access-review.css");
    const own = [...unit].filter((c) => c.startsWith(".unit-review"));
    expect(own.length).toBeGreaterThan(0);
    expect(own.filter((c) => user.has(c))).toEqual([]);
    expect([...unit].filter((c) => c.startsWith(".uar"))).toEqual([]);
  });
});
