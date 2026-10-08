// @vitest-environment jsdom
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
// The RPC is the trusted boundary: the client is replaced and every call recorded.
const rpc = vi.hoisted(() => ({
  calls: [] as [string, Record<string, unknown>][],
  next: [] as ({ data: unknown; error: unknown } | Error)[],
  fallback: { data: [] as unknown, error: null as unknown },
}));
vi.mock("../apps/web/src/core/client", () => ({
  database: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpc.calls.push([name, args]);
      const result = rpc.next.shift() ?? rpc.fallback;
      if (result instanceof Error) throw result;
      return result;
    },
  }),
}));
import { LogsPage } from "../apps/web/src/core/admin/LogsPage";
import {
  auditLogReviewPage,
  EMPTY_FILTERS,
  filterProblem,
  pageArgs,
  toEntry,
} from "../apps/web/src/core/admin/audit-log-review-api";
const ACTOR = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const UNIT = "11111111-2222-3333-4444-555555555555";
const SECTOR = "66666666-7777-8888-9999-000000000000";
const row = (over: Record<string, unknown> = {}) => ({
  id: "l1",
  occurred_at: "2026-09-29T12:00:00Z",
  actor_user_id: ACTOR,
  actor_display_name: "Ana Souza",
  actor_active: true,
  actor_label_source: "current",
  module: "core",
  action: "update",
  entity_type: "units",
  entity_id: "U1",
  unit_id: UNIT,
  unit_code: "CC",
  unit_name: "Cozinha Central",
  unit_active: true,
  unit_label_source: "current",
  sector_id: null,
  sector_code: null,
  sector_name: null,
  sector_active: null,
  sector_label_source: null,
  before_data: { name: "<img src=x onerror=alert(1)>" },
  after_data: { name: "Cozinha", note: "x".repeat(400) },
  metadata: { source: "admin" },
  correlation_id: "corr-1",
  total_count: 1,
  ...over,
});
const ok = (rows: unknown[]) => ({ data: rows, error: null });
const lastArgs = () => rpc.calls[rpc.calls.length - 1][1];
const localIso = (y: number, m: number, d: number) =>
  new Date(y, m - 1, d).toISOString();
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
beforeEach(() => {
  rpc.calls = [];
  rpc.next = [];
  rpc.fallback = ok([]);
});
afterEach(cleanup);

describe("audit log review adapter", () => {
  const asOf = "2026-10-08T15:00:00.000Z";
  it("maps the half-open interval to local midnights, including the last day", () => {
    const args = pageArgs(
      0,
      { ...EMPTY_FILTERS, from: "2026-10-01", to: "2026-10-02" },
      asOf,
    );
    expect(args.p_from).toBe(localIso(2026, 10, 1));
    // [from, to + 1 day): an event at 23:59:59 on the 2nd is in, 00:00 on the 3rd is out.
    expect(args.p_to).toBe(localIso(2026, 10, 3));
  });
  it("pins the end of the interval to the moment of the query for stable pages", () => {
    expect(pageArgs(3, EMPTY_FILTERS, asOf)).toEqual({
      p_limit: 25,
      p_offset: 75,
      p_from: null,
      p_to: asOf,
      p_actor: null,
      p_actor_search: null,
      p_module: null,
      p_action: null,
      p_entity_type: null,
      p_entity_id: null,
    });
    // A last day after the pinned moment never reads past it.
    expect(
      pageArgs(0, { ...EMPTY_FILTERS, to: "2099-01-01" }, asOf).p_to,
    ).toBe(asOf);
  });
  it("sends a UUID as the exact actor and any other text as a visible-name search", () => {
    const byId = pageArgs(
      0,
      { ...EMPTY_FILTERS, actor: ` ${ACTOR.toUpperCase()} ` },
      asOf,
    );
    expect(byId.p_actor).toBe(ACTOR);
    expect(byId.p_actor_search).toBeNull();
    const byName = pageArgs(0, { ...EMPTY_FILTERS, actor: " ana " }, asOf);
    expect(byName.p_actor).toBeNull();
    expect(byName.p_actor_search).toBe("ana");
    // A truncated UUID is not an identifier: it can only match visible names.
    expect(
      pageArgs(0, { ...EMPTY_FILTERS, actor: "aaaaaaaa-bbbb" }, asOf).p_actor,
    ).toBeNull();
  });
  it("sends entity, module and action filters trimmed, and blanks as null", () => {
    const args = pageArgs(
      0,
      {
        ...EMPTY_FILTERS,
        module: "core",
        action: " ",
        entityType: "units",
        entityId: " U1 ",
      },
      asOf,
    );
    expect(args).toMatchObject({
      p_module: "core",
      p_action: null,
      p_entity_type: "units",
      p_entity_id: "U1",
    });
  });
  it("rejects malformed filters before calling the server", () => {
    expect(filterProblem({ ...EMPTY_FILTERS, from: "2026-02-31" })).toMatch(
      /data inicial válida/,
    );
    expect(filterProblem({ ...EMPTY_FILTERS, to: "amanhã" })).toMatch(
      /data final válida/,
    );
    expect(
      filterProblem({ ...EMPTY_FILTERS, from: "2026-10-05", to: "2026-10-01" }),
    ).toMatch(/anterior ou igual/);
    expect(
      filterProblem({ ...EMPTY_FILTERS, entityId: "x".repeat(161) }),
    ).toMatch(/160 caracteres/);
    expect(
      filterProblem({ ...EMPTY_FILTERS, from: "2026-10-01", to: "2026-10-01" }),
    ).toBe("");
  });
  it("keeps unreadable or nameless references unavailable instead of inventing a label", () => {
    const entry = toEntry(
      row({
        actor_display_name: null,
        actor_label_source: "unavailable",
        unit_name: "Vazou",
        unit_label_source: "unavailable",
        sector_id: SECTOR,
        sector_name: "  ",
        sector_label_source: "current",
      }),
    )!;
    expect(entry.actor).toEqual({ kind: "unavailable", id: ACTOR });
    expect(entry.unit).toEqual({ kind: "unavailable", id: UNIT });
    expect(entry.sector).toEqual({ kind: "unavailable", id: SECTOR });
    expect(toEntry(row({ actor_user_id: null })).actor).toEqual({
      kind: "none",
    });
    // An unknown label source is never trusted as a name.
    expect(toEntry(row({ actor_label_source: "snapshot" }))!.actor.kind).toBe(
      "unavailable",
    );
  });
  it("reads one page with its total and rejects malformed rows", async () => {
    rpc.next.push(ok([row({ total_count: "60" })]));
    const page = await auditLogReviewPage(1, EMPTY_FILTERS, asOf);
    expect(rpc.calls[0][0]).toBe("audit_log_page");
    expect(rpc.calls[0][1]).toMatchObject({ p_offset: 25, p_limit: 25 });
    expect(page.count).toBe(60);
    expect(page.rows[0].actor).toMatchObject({ kind: "current", name: "Ana Souza" });
    rpc.next.push(ok([row({ occurred_at: "ontem" })]));
    await expect(auditLogReviewPage(0, EMPTY_FILTERS, asOf)).rejects.toMatchObject({
      kind: "failed",
    });
    rpc.next.push({ data: { not: "rows" }, error: null });
    await expect(auditLogReviewPage(0, EMPTY_FILTERS, asOf)).rejects.toMatchObject({
      kind: "failed",
    });
  });
  it("classifies denied, refused-filter and other RPC errors", async () => {
    rpc.next.push({ data: null, error: { code: "42501", message: "Forbidden" } });
    await expect(auditLogReviewPage(0, EMPTY_FILTERS, asOf)).rejects.toMatchObject({
      kind: "denied",
    });
    rpc.next.push({ data: null, error: { code: "22023", message: "Invalid filter" } });
    await expect(auditLogReviewPage(0, EMPTY_FILTERS, asOf)).rejects.toMatchObject({
      kind: "invalid",
    });
    rpc.next.push(new Error("network"));
    const error = await auditLogReviewPage(0, EMPTY_FILTERS, asOf).catch(
      (e: Error) => e,
    );
    expect(error).toMatchObject({ kind: "failed" });
    // The raw server text is never shown to the operator.
    expect(error.message).not.toMatch(/network|Forbidden/);
  });
});

describe("LogsPage", () => {
  it("shows who, when, what and where in operator language", async () => {
    rpc.next.push(
      ok([
        row({
          sector_id: SECTOR,
          sector_code: "QA",
          sector_name: "Qualidade",
          sector_active: false,
          sector_label_source: "current",
        }),
      ]),
    );
    render(<LogsPage />);
    const item = (await screen.findByText("Ana Souza")).closest("li")!;
    const view = within(item);
    expect(view.getByText("Alteração")).toBeTruthy();
    expect(view.getByText("Unidade")).toBeTruthy();
    expect(view.getByText("Plataforma")).toBeTruthy();
    expect(view.getByText("Cozinha Central")).toBeTruthy();
    expect(view.getByText("Qualidade")).toBeTruthy();
    expect(view.getByText("Inativa")).toBeTruthy();
    expect(item.querySelector("time")?.getAttribute("dateTime")).toBe(
      "2026-09-29T12:00:00Z",
    );
    // Identifiers stay out of the list; they live in the technical details.
    expect(item.textContent).not.toContain(ACTOR);
    expect(item.textContent).not.toContain(UNIT);
    expect(screen.getByText("1 evento")).toBeTruthy();
    expect(screen.getByText("Mais recentes primeiro")).toBeTruthy();
    expect(screen.getByText(/dentro do seu escopo de acesso/)).toBeTruthy();
  });
  it("marks inaccessible names as unavailable and database operations as such", async () => {
    rpc.next.push(
      ok([
        row({
          id: "l1",
          actor_display_name: null,
          actor_active: null,
          actor_label_source: "unavailable",
          unit_code: null,
          unit_name: null,
          unit_active: null,
          unit_label_source: "unavailable",
          total_count: 2,
        }),
        row({ id: "l2", actor_user_id: null, unit_id: null, total_count: 2 }),
      ]),
    );
    render(<LogsPage />);
    expect(await screen.findByText("Nome indisponível")).toBeTruthy();
    expect(screen.getByText("Unidade indisponível")).toBeTruthy();
    expect(screen.getByText("Operação administrativa do banco")).toBeTruthy();
    expect(screen.queryByText("Ana Souza")).toBeNull();
    expect(document.body.textContent).not.toContain(ACTOR);
  });
  it("labels an inactive actor without hiding the name", async () => {
    rpc.next.push(ok([row({ actor_active: false })]));
    render(<LogsPage />);
    const item = (await screen.findByText("Ana Souza")).closest("li")!;
    expect(within(item).getByText("Inativo")).toBeTruthy();
  });
  it("applies every filter, counts them and resets explicitly", async () => {
    rpc.fallback = ok([row()]);
    const user = userEvent.setup();
    render(<LogsPage />);
    await screen.findByText("Ana Souza");
    expect(rpc.calls).toHaveLength(1);
    const pinned = lastArgs().p_to as string;
    expect(pinned).toBeTruthy();
    fireEvent.change(screen.getByLabelText("De"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.change(screen.getByLabelText("Até"), {
      target: { value: "2026-10-02" },
    });
    await user.type(screen.getByLabelText("Quem"), ACTOR);
    await user.selectOptions(screen.getByLabelText("Módulo"), "core");
    await user.selectOptions(screen.getByLabelText("Ação"), "revoke");
    await user.selectOptions(
      screen.getByLabelText("Tipo de registro"),
      "user_role_assignments",
    );
    await user.type(screen.getByLabelText("Identificador do registro"), "A1");
    await user.click(screen.getByRole("button", { name: "Filtrar" }));
    await waitFor(() => expect(rpc.calls).toHaveLength(2));
    expect(lastArgs()).toMatchObject({
      p_offset: 0,
      p_from: localIso(2026, 10, 1),
      p_to: localIso(2026, 10, 3),
      p_actor: ACTOR,
      p_actor_search: null,
      p_module: "core",
      p_action: "revoke",
      p_entity_type: "user_role_assignments",
      p_entity_id: "A1",
    });
    expect(await screen.findByText("7 filtros aplicados")).toBeTruthy();
    // Searching by identifier does not need the visible-name notice.
    expect(screen.queryByText(/busca por nome/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect(rpc.calls).toHaveLength(3));
    expect(lastArgs()).toMatchObject({
      p_from: null,
      p_actor: null,
      p_module: null,
      p_entity_id: null,
    });
    expect((screen.getByLabelText("Quem") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Módulo") as HTMLSelectElement).value).toBe("");
    expect(screen.queryByText(/filtros? aplicados?/)).toBeNull();
  });
  it("explains that a name search only finds actors the reader can see", async () => {
    rpc.fallback = ok([]);
    const user = userEvent.setup();
    render(<LogsPage />);
    await screen.findByText("Nenhum evento encontrado");
    await user.type(screen.getByLabelText("Quem"), "  Ana  ");
    await user.click(screen.getByRole("button", { name: "Filtrar" }));
    await waitFor(() => expect(lastArgs().p_actor_search).toBe("Ana"));
    expect(
      await screen.findByText(/considera somente pessoas que você pode consultar/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Nenhum evento dentro do seu acesso corresponde/),
    ).toBeTruthy();
    // The empty result offers the reset too.
    const empty = screen.getByText("Nenhum evento encontrado").closest("section")!;
    await user.click(within(empty).getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect(lastArgs().p_actor_search).toBeNull());
    expect(screen.queryByText(/considera somente pessoas/)).toBeNull();
  });
  it("keeps malformed filters on screen without calling the server", async () => {
    const user = userEvent.setup();
    render(<LogsPage />);
    await screen.findByText("Nenhum evento encontrado");
    fireEvent.change(screen.getByLabelText("De"), {
      target: { value: "2026-10-05" },
    });
    fireEvent.change(screen.getByLabelText("Até"), {
      target: { value: "2026-10-01" },
    });
    await user.click(screen.getByRole("button", { name: "Filtrar" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /anterior ou igual/,
    );
    expect(screen.getByLabelText("De").getAttribute("aria-invalid")).toBe("true");
    expect(rpc.calls).toHaveLength(1);
  });
  it("keeps the date range ordered in the inputs", async () => {
    render(<LogsPage />);
    await screen.findByText("Nenhum evento encontrado");
    const from = screen.getByLabelText("De") as HTMLInputElement;
    const to = screen.getByLabelText("Até") as HTMLInputElement;
    fireEvent.change(from, { target: { value: "2026-10-10" } });
    expect(to.min).toBe("2026-10-10");
    fireEvent.change(to, { target: { value: "2026-10-20" } });
    expect(from.max).toBe("2026-10-20");
  });
  it("pages with a pinned end and stable order, and refreshes on request", async () => {
    const page = (offset: number) =>
      Array.from({ length: 25 }, (_, i) =>
        row({ id: `l${offset + i}`, total_count: 30 }),
      );
    rpc.next.push(ok(page(0)), ok(page(25).slice(0, 5)));
    const user = userEvent.setup();
    render(<LogsPage />);
    expect(await screen.findByText(/Página 1 de 2/)).toBeTruthy();
    const pinned = lastArgs().p_to;
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByText(/Página 2 de 2/)).toBeTruthy();
    expect(lastArgs()).toMatchObject({ p_offset: 25, p_to: pinned });
    rpc.fallback = ok([row()]);
    await user.click(screen.getByRole("button", { name: "Atualizar" }));
    await waitFor(() => expect(lastArgs().p_offset).toBe(0));
    expect(await screen.findByText("1 evento")).toBeTruthy();
  });
  it("returns to the first page when a later page comes back empty", async () => {
    rpc.next.push(ok(Array.from({ length: 25 }, (_, i) => row({ id: `l${i}`, total_count: 26 }))));
    rpc.next.push(ok([]));
    rpc.fallback = ok([row()]);
    const user = userEvent.setup();
    render(<LogsPage />);
    await screen.findByText(/Página 1 de 2/);
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(rpc.calls).toHaveLength(3));
    expect(lastArgs().p_offset).toBe(0);
    expect(await screen.findByText("1 evento")).toBeTruthy();
  });
  it("shows a summary first and technical identifiers and escaped JSON on demand", async () => {
    rpc.next.push(ok([row()]));
    const user = userEvent.setup();
    render(<LogsPage />);
    await user.click(
      await screen.findByRole("button", {
        name: /^Detalhes: Alteração em Unidade/,
      }),
    );
    const dialog = screen.getByRole("dialog");
    const view = within(dialog);
    expect(view.getByText("Quem")).toBeTruthy();
    expect(view.getByText("Ana Souza")).toBeTruthy();
    expect(view.getByText("Sem setor vinculado")).toBeTruthy();
    const tech = dialog.querySelector("details")!;
    expect(tech.open).toBe(false);
    expect(within(tech).getByText("Detalhes técnicos").tagName).toBe("SUMMARY");
    await user.click(within(tech).getByText("Detalhes técnicos"));
    expect(tech.open).toBe(true);
    expect(within(tech).getByText(ACTOR)).toBeTruthy();
    expect(within(tech).getByText(UNIT)).toBeTruthy();
    expect(within(tech).getByText("corr-1")).toBeTruthy();
    const before = within(tech).getByRole("region", { name: "Antes" });
    expect(before.tagName).toBe("PRE");
    expect(before.tabIndex).toBe(0);
    expect(before.textContent).toBe(
      JSON.stringify({ name: "<img src=x onerror=alert(1)>" }, null, 2),
    );
    expect(dialog.querySelector("img")).toBeNull();
    expect(
      within(tech).getByRole("region", { name: "Depois" }).textContent,
    ).toContain("x".repeat(400));
    expect(
      within(tech).getByRole("region", { name: "Metadados" }).textContent,
    ).toContain("admin");
  });
  it("states missing before/after content instead of rendering empty regions", async () => {
    rpc.next.push(
      ok([row({ before_data: null, after_data: null, metadata: undefined })]),
    );
    const user = userEvent.setup();
    render(<LogsPage />);
    await user.click(await screen.findByRole("button", { name: /^Detalhes:/ }));
    const tech = screen.getByRole("dialog").querySelector("details")!;
    await user.click(within(tech).getByText("Detalhes técnicos"));
    for (const label of ["Antes", "Depois", "Metadados"]) {
      expect(within(tech).getByRole("heading", { name: label })).toBeTruthy();
      expect(within(tech).queryByRole("region", { name: label })).toBeNull();
    }
    expect(within(tech).getAllByText("Sem conteúdo registrado.")).toHaveLength(3);
    expect(tech.textContent).not.toContain("null");
  });
  it("filters by the person or the record of an event from its details", async () => {
    rpc.fallback = ok([row()]);
    const user = userEvent.setup();
    render(<LogsPage />);
    await user.click(await screen.findByRole("button", { name: /^Detalhes:/ }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Ver eventos deste registro",
      }),
    );
    await waitFor(() =>
      expect(lastArgs()).toMatchObject({ p_entity_type: "units", p_entity_id: "U1" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      (screen.getByLabelText("Identificador do registro") as HTMLInputElement).value,
    ).toBe("U1");
    await user.click(await screen.findByRole("button", { name: /^Detalhes:/ }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Ver eventos desta pessoa",
      }),
    );
    await waitFor(() =>
      expect(lastArgs()).toMatchObject({ p_actor: ACTOR, p_entity_id: null }),
    );
  });
  it("explains unavailable labels in the details without revealing more", async () => {
    rpc.next.push(
      ok([row({ actor_display_name: "Oculto", actor_label_source: "unavailable" })]),
    );
    const user = userEvent.setup();
    render(<LogsPage />);
    await user.click(await screen.findByRole("button", { name: /^Detalhes:/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Nome indisponível")).toBeTruthy();
    expect(within(dialog).getByText(/não pode ser exibido para o seu acesso/)).toBeTruthy();
    expect(dialog.textContent).not.toContain("Oculto");
  });
  it("shows a denied state when the reader lost log access", async () => {
    rpc.next.push({ data: null, error: { code: "42501", message: "Forbidden" } });
    render(<LogsPage />);
    expect(await screen.findByText("Acesso aos logs indisponível")).toBeTruthy();
    expect(screen.queryByText("Forbidden")).toBeNull();
    expect(screen.queryByRole("list", { name: "Eventos" })).toBeNull();
  });
  it("shows a safe error with retry and keeps no stale rows behind it", async () => {
    rpc.next.push({ data: null, error: { code: "XX000", message: "boom" } });
    const user = userEvent.setup();
    render(<LogsPage />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Não foi possível carregar os eventos/);
    expect(alert.textContent).not.toContain("boom");
    rpc.next.push(ok([row()]));
    await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Ana Souza")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("offers to clear filters the server refused", async () => {
    rpc.next.push(ok([]), { data: null, error: { code: "22023", message: "Invalid filter" } });
    const user = userEvent.setup();
    render(<LogsPage />);
    await screen.findByText("Nenhum evento encontrado");
    await user.type(screen.getByLabelText("Quem"), "ana");
    await user.click(screen.getByRole("button", { name: "Filtrar" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/filtros não puderam ser aplicados/);
    await user.click(within(alert).getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect(lastArgs().p_actor_search).toBeNull());
  });
  it("shows the loading state while the first page loads", async () => {
    render(<LogsPage />);
    expect(screen.getByText("Carregando eventos…")).toBeTruthy();
    await screen.findByText("Nenhum evento encontrado");
    expect(screen.getByText(/Ainda não há eventos registrados/)).toBeTruthy();
  });
});
