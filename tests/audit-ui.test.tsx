// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ChecklistEvidence } from "../apps/web/src/modules/audit/ChecklistEvidence";
import type { EvidenceController } from "../apps/web/src/modules/audit/useChecklistEvidence";
import { InspectionPage } from "../apps/web/src/modules/audit/InspectionPage";
import { UnitPage } from "../apps/web/src/modules/audit/UnitPage";
import { AuditOverview } from "../apps/web/src/modules/audit/AuditOverview";
import { NewInspection } from "../apps/web/src/modules/audit/NewInspection";
import { visibleNavigation } from "../apps/web/src/app/navigation";
import type {
  Answer,
  InspectionSummary,
} from "../apps/web/src/modules/audit/types";
const api = vi.hoisted(() => ({
  inspection: vi.fn(),
  checklist: vi.fn(),
  answers: vi.fn(),
  answer: vi.fn(),
  saveAnswer: vi.fn(),
  finalize: vi.fn(),
  reopen: vi.fn(),
  units: vi.fn(),
  summaries: vi.fn(),
  createInspection: vi.fn(),
}));
vi.mock("../apps/web/src/modules/audit/api", () => api);
const evidenceApi=vi.hoisted(()=>({listEvidence:vi.fn(async()=>[]),pendingCount:vi.fn(async()=>0),beginUpload:vi.fn(),finishUpload:vi.fn(),removeEvidence:vi.fn(),downloadEvidence:vi.fn(),evidenceMessage:vi.fn(()=> "Envio falhou"),retryable:vi.fn(()=>true),ACCEPT:".pdf",FORMATS_HINT:"PDF",formatSize:vi.fn(()=> "1 KB"),typeLabel:vi.fn(()=> "PDF")}));
vi.mock("../apps/web/src/modules/audit/evidence",()=>evidenceApi);
const plansApi = vi.hoisted(() => ({ summaries: vi.fn(async () => [] as unknown[]) }));
vi.mock("../apps/web/src/modules/action-plans/api", () => plansApi);
vi.mock("../apps/web/src/modules/audit/reporting/api", () => ({
  inspectionExport: vi.fn(), historyExport: vi.fn(),
}));
const permissions = vi.hoisted(() => ({ allowed: true }));
vi.mock("../apps/web/src/core/auth/AuthProvider", () => ({
  useAuth: () => ({ session: { user: { id: "u" } }, can: () => permissions.allowed }),
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
  permissions.allowed = true;
  evidenceApi.listEvidence.mockResolvedValue([]);
  evidenceApi.pendingCount.mockResolvedValue(0);
  plansApi.summaries.mockResolvedValue([]);
});
const version = "v";
const items = [
  { key: "item-001", number: 1, section_key: "s1", text: "Piso íntegro?" },
  { key: "item-002", number: 2, section_key: "s1", text: "Teto íntegro?" },
  { key: "item-003", number: 3, section_key: "s2", text: "Estoque limpo?" },
].map((i, n) => ({ ...i, template_version: version, position: n + 1 }));
const sections = [
  { key: "s1", name: "ESTRUTURA", position: 1, template_version: version },
  { key: "s2", name: "ESTOQUE", position: 2, template_version: version },
];
const answer = (item_key: string, response: Answer["response"]): Answer => ({
  inspection_id: "i1",
  template_version: version,
  item_key,
  response,
  observation: "",
  version: 1,
  updated_at: "",
  updated_by: null,
});
function summary(over: Partial<InspectionSummary> = {}): InspectionSummary {
  return {
    id: "i1",
    unit_id: "A",
    unit_name: "Unidade A",
    template_version: version,
    applied_on: "2026-09-24",
    previous_visit_on: null,
    responsible_id: "u",
    responsible_name: "Ana",
    status: "draft",
    final_score: null,
    final_classification: null,
    finalized_at: null,
    version: 1,
    created_at: "",
    total_items: 3,
    answered: 0,
    at_count: 0,
    ap_count: 0,
    nat_count: 0,
    nap_count: 0,
    ...over,
  };
}
// D1: the inspection opens on its overview; the checklist lives at /checklist.
function setup(s: InspectionSummary | null, rows: Answer[], onRender?: React.ProfilerOnRenderCallback, path = "/audit/inspections/i1/checklist") {
  api.inspection.mockResolvedValue(s);
  api.checklist.mockResolvedValue({ sections, items });
  api.answers.mockResolvedValue(rows);
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/audit/inspections/:inspectionId/*"
          element={<React.Profiler id="inspection" onRender={onRender ?? (() => undefined)}><InspectionPage /></React.Profiler>}
        />
      </Routes>
    </MemoryRouter>,
  );
}
describe("audit navigation", () => {
  it("shows Auditorias only with read permission in some scope", () => {
    const grant = (permission: string) => ({
      permission,
      scope_type: "unit" as const,
      unit_id: "A",
      sector_id: null,
    });
    expect(visibleNavigation(true, [grant("audit.inspection.create")])).toEqual(
      [],
    );
    const nav = visibleNavigation(true, [grant("audit.inspection.read")]);
    expect(nav[0].destinations[0]).toMatchObject({
      path: "/audit",
      nested: true,
    });
    expect(visibleNavigation(false, [grant("audit.inspection.read")])).toEqual(
      [],
    );
  });
});
describe("inspection page", () => {
  it("binds hidden-section evidence and warns pending before finalizing",async()=>{
    const user=userEvent.setup();
    evidenceApi.listEvidence.mockResolvedValue([{id:"e9",item_key:"item-003",original_name:"seção9.pdf",content_type:"application/pdf",size_bytes:10,uploaded_by_name:"Ana",uploaded_at:""}] as never);
    evidenceApi.pendingCount.mockResolvedValue(2);
    setup(summary({answered:3,at_count:3}),items.map(i=>answer(i.key,"AT")));
    await user.click(await screen.findByText("Finalizar"));
    expect(await screen.findByText(/1 evidência.*toda a auditoria/)).toBeTruthy();
    expect(screen.getByText(/Há envios pendentes/)).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByText("seção9.pdf")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByText(/Critério 3/)).toBeTruthy();
    await user.click(screen.getByText("Confirmar"));
    await waitFor(()=>expect(api.finalize).toHaveBeenCalledWith("i1",1,["e9"]));
  });
  it("discards a pending finalization review when navigating to another inspection",async()=>{
    const user=userEvent.setup();
    let resolveReview!:(value:never[])=>void;
    const waiting=new Promise<never[]>(resolve=>{resolveReview=resolve;});
    evidenceApi.listEvidence.mockResolvedValue([]);
    api.inspection.mockImplementation(async(id:string)=>summary({id,answered:3,at_count:3}));
    api.checklist.mockResolvedValue({sections,items});
    api.answers.mockResolvedValue(items.map(i=>answer(i.key,"AT")));
    render(<MemoryRouter initialEntries={["/audit/inspections/i1/checklist"]}>
      <Link to="/audit/inspections/i2/checklist">Outra auditoria</Link>
      <Routes><Route path="/audit/inspections/:inspectionId/*" element={<InspectionPage/>}/></Routes>
    </MemoryRouter>);
    await screen.findByText("Finalizar");
    await waitFor(()=>expect(evidenceApi.listEvidence).toHaveBeenCalledWith("i1"));
    evidenceApi.listEvidence.mockImplementationOnce(()=>waiting);
    await user.click(screen.getByText("Finalizar"));
    await user.click(screen.getByText("Outra auditoria"));
    await waitFor(()=>expect(api.inspection).toHaveBeenCalledWith("i2"));
    resolveReview([]);
    await waitFor(()=>expect((screen.getByText("Finalizar") as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.finalize).not.toHaveBeenCalled();
    await user.click(screen.getByText("Finalizar"));await user.click(await screen.findByText("Confirmar"));
    await waitFor(()=>expect(api.finalize).toHaveBeenCalledWith("i2",1,[]));
  });
  it("shows evidence-set conflict and requires explicit reload/review",async()=>{
    const user=userEvent.setup();
    api.finalize.mockRejectedValueOnce({code:"40001",message:"Evidence set changed"});
    setup(summary({answered:3,at_count:3}),items.map(i=>answer(i.key,"AT")));
    await user.click(await screen.findByText("Finalizar"));await user.click(await screen.findByText("Confirmar"));
    expect(await screen.findByText(/O conjunto de evidências foi alterado/)).toBeTruthy();
    expect((screen.getByText("Finalizar") as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByText("Recarregar evidências e revisar"));
    await waitFor(()=>expect((screen.getByText("Finalizar") as HTMLButtonElement).disabled).toBe(false));
  });

  it.each(["finalize", "reopen"] as const)("keeps the UI blocked after %s acceptance through a controlled reload", async (action) => {
    const user = userEvent.setup();
    const finalized = summary({ status: "finalized", version: 2, final_score: 100,
      final_classification: "adequate", finalized_at: "2026-09-24T12:00:00Z", answered: 3, at_count: 3 });
    const initial = action === "finalize" ? summary({ answered: 3, at_count: 3 }) : finalized;
    let accept!: () => void;
    let finishReload!: (value: InspectionSummary) => void;
    api[action].mockReturnValueOnce(new Promise<void>((resolve) => { accept = resolve; }));
    let accepted = false;
    const enabledBetweenLoads: number[] = [];
    setup(initial, items.map(i => answer(i.key, "AT")), () => {
      if (accepted) enabledBetweenLoads.push(document.querySelectorAll(
        ".response:not(:disabled), .audit-observation textarea, .audit-evidence input[type=file], .report-controls button:not(:disabled), .audit-hero-actions > button"
      ).length);
    });
    await screen.findByText(action === "finalize" ? "Finalizar" : "Reabrir");
    api.inspection.mockReturnValueOnce(new Promise<InspectionSummary>((resolve) => { finishReload = resolve; }));
    await user.click(screen.getByText(action === "finalize" ? "Finalizar" : "Reabrir"));
    await user.click(await screen.findByText("Confirmar"));
    await waitFor(() => expect(api[action]).toHaveBeenCalled());
    await act(async () => { accepted = true; accept(); });
    expect(api.inspection).toHaveBeenCalledTimes(2);
    expect(enabledBetweenLoads.length).toBeGreaterThan(0);
    expect(enabledBetweenLoads.every(count => count === 0)).toBe(true);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Anexar arquivo/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Exportar Excel" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Finalizar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reabrir" })).toBeNull();
    accepted = false;
    await act(async () => { finishReload(action === "finalize" ? finalized : summary({ version: 3, answered: 3, at_count: 3 })); });
    if (action === "finalize") {
      expect(await screen.findByText(/Somente leitura/)).toBeTruthy();
      for (const b of screen.getAllByRole("button", { name: /\((AT|AP|NAT|NAP)\)/ }))
        expect((b as HTMLButtonElement).disabled).toBe(true);
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.queryByRole("button", { name: /Anexar arquivo/ })).toBeNull();
    } else {
      await waitFor(() => expect((screen.getAllByRole("button", { name: "Atende (AT)" })[0] as HTMLButtonElement).disabled).toBe(false));
      // D5: attach controls live behind each criterion's "Evidências (n)" disclosure.
      for (const toggle of screen.getAllByRole("button", { name: /^Evidências \(/ })) await user.click(toggle);
      expect(screen.getAllByRole("button", { name: /Anexar arquivo/ }).length).toBe(2);
    }
  });
  it.each(["error", "old"] as const)("preserves a blocked lifecycle after a %s reload and allows manual retry", async (loadResult) => {
    const user = userEvent.setup();
    const initial = summary({ answered: 3, at_count: 3 });
    setup(initial, items.map(i => answer(i.key, "AT")));
    await screen.findByText("Finalizar");
    api.finalize.mockResolvedValueOnce(undefined);
    if (loadResult === "error") api.inspection.mockRejectedValueOnce({ code: "08006" });
    else api.inspection.mockResolvedValueOnce(initial);
    api.inspection.mockResolvedValueOnce(summary({ status: "finalized", version: 2, answered: 3, at_count: 3,
      final_score: 100, final_classification: "adequate", finalized_at: "2026-09-24T12:00:00Z" }));
    await user.click(screen.getByText("Finalizar"));
    await user.click(await screen.findByText("Confirmar"));
    const retry = await screen.findByRole("button", { name: "Tentar novamente" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Anexar arquivo/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Exportar Excel" })).toBeNull();
    await user.click(retry);
    expect(await screen.findByText(/Somente leitura/)).toBeTruthy();
    expect(api.inspection).toHaveBeenCalledTimes(3);
  });
  it("preserves finalize failure and cancellation without locking the page", async () => {
    const user = userEvent.setup();
    setup(summary({ answered: 3, at_count: 3 }), items.map(i => answer(i.key, "AT")));
    api.finalize.mockRejectedValueOnce({ code: "55000" });
    await user.click(await screen.findByText("Finalizar"));
    await user.click(await screen.findByText("Confirmar"));
    expect(await screen.findByText(/estado atual do registro/)).toBeTruthy();
    await user.click(screen.getByText("Cancelar"));
    expect((screen.getAllByRole("button", { name: "Atende (AT)" })[0] as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Exportar Excel" })).toBeTruthy();
    expect(api.inspection).toHaveBeenCalledTimes(1);
  });
  it("shows a partial draft result without final classification", async () => {
    setup(summary(), [
      answer("item-001", "AT"),
      answer("item-002", null),
      answer("item-003", null),
    ]);
    expect(await screen.findByText("Parcial · em andamento")).toBeTruthy();
    expect(screen.getByText("1/3 respondidos")).toBeTruthy();
    expect(screen.queryByText(/^Adequada/)).toBeNull();
    expect((screen.getByText("Finalizar") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText(/2 restantes/)).toBeTruthy();
  });
  it("shows no conformity for a new inspection", async () => {
    setup(
      summary(),
      items.map((i) => answer(i.key, null)),
    );
    expect(await screen.findByText("Sem dados de conformidade")).toBeTruthy();
    expect(screen.getByText("0/3 respondidos")).toBeTruthy();
  });
  it("renders a finalized inspection read-only with its final result", async () => {
    setup(
      summary({
        status: "finalized",
        final_score: 100,
        final_classification: "adequate",
        finalized_at: "2026-09-24T12:00:00Z",
        answered: 3,
        at_count: 3,
      }),
      items.map((i) => answer(i.key, "AT")),
    );
    expect(await screen.findByText("Adequada")).toBeTruthy();
    expect(screen.getByText(/Somente leitura/)).toBeTruthy();
    expect(screen.getByText("Reabrir")).toBeTruthy();
    expect(screen.queryByText("Finalizar")).toBeNull();
    for (const b of await screen.findAllByRole("button", {
      name: /\((AT|AP|NAT|NAP)\)/,
    }))
      expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText("Observação")).toBeNull();
  });
  it("explains a finalized inspection without applicable criteria", async () => {
    setup(
      summary({
        status: "finalized",
        finalized_at: "2026-09-24T12:00:00Z",
        answered: 3,
        nap_count: 3,
      }),
      items.map((i) => answer(i.key, "NAP")),
    );
    expect(await screen.findByText("Sem critérios aplicáveis")).toBeTruthy();
  });
  it("saves a response and toggles it back to unanswered", async () => {
    const user = userEvent.setup();
    setup(
      summary(),
      items.map((i) => answer(i.key, null)),
    );
    api.saveAnswer.mockImplementation(async (row: Answer, values) => ({
      ...row,
      ...values,
      version: row.version + 1,
    }));
    const at = (
      await screen.findAllByRole("button", { name: "Atende (AT)" })
    )[0];
    await user.click(at);
    await waitFor(() => expect(at.getAttribute("aria-pressed")).toBe("true"));
    expect(screen.getByText("Salvo")).toBeTruthy();
    expect(screen.getByText("1/3 respondidos")).toBeTruthy();
    await user.click(at);
    await waitFor(() => expect(at.getAttribute("aria-pressed")).toBe("false"));
    expect(api.saveAnswer).toHaveBeenLastCalledWith(
      expect.objectContaining({ version: 2 }),
      { response: null, observation: "" },
    );
  });
  it("reports a concurrent change and loads the server value", async () => {
    const user = userEvent.setup();
    setup(
      summary(),
      items.map((i) => answer(i.key, null)),
    );
    api.saveAnswer.mockRejectedValue({ code: "PGRST116" });
    api.answer.mockResolvedValue({ ...answer("item-001", "NAT"), version: 2 });
    const at = (
      await screen.findAllByRole("button", { name: "Atende (AT)" })
    )[0];
    await user.click(at);
    expect(
      await screen.findByText(/alterado em outra sessão ou a auditoria/),
    ).toBeTruthy();
    const nat = screen.getAllByRole("button", { name: "Não atende (NAT)" })[0];
    expect(nat.getAttribute("aria-pressed")).toBe("true");
    expect(at.getAttribute("aria-pressed")).toBe("false");
  });
  it("switches sections through a sheet, not a native select", async () => {
    const user = userEvent.setup();
    setup(summary(), [
      answer("item-001", "AT"),
      answer("item-002", null),
      answer("item-003", null),
    ]);
    await screen.findByRole("heading", { name: "1. ESTRUTURA" });
    expect(screen.queryByRole("combobox")).toBeNull();
    await user.click(
      screen.getByRole("button", {
        name: "Seção 1 de 2: ESTRUTURA, 1 de 2 respondidos. Escolher seção",
      }),
    );
    const sheet = screen.getByRole("dialog", { name: "Seções do checklist" });
    const target = within(sheet).getByRole("button", {
      name: "Seção 2: ESTOQUE, 0 de 1 respondidos",
    });
    await user.click(target);
    const heading = await screen.findByRole("heading", { name: "2. ESTOQUE" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText("Estoque limpo?")).toBeTruthy();
  });
  it("finalizes through an explicit confirmation", async () => {
    const user = userEvent.setup();
    setup(
      summary({ answered: 3, at_count: 3 }),
      items.map((i) => answer(i.key, "AT")),
    );
    api.finalize.mockResolvedValue(undefined);
    await user.click(await screen.findByText("Finalizar"));
    expect(api.finalize).not.toHaveBeenCalled();
    await user.click(await screen.findByText("Confirmar"));
    await waitFor(() => expect(api.finalize).toHaveBeenCalledWith("i1", 1, []));
  });
  it("shows a read-only notice without edit permission", async () => {
    permissions.allowed = false;
    setup(
      summary(),
      items.map((i) => answer(i.key, null)),
    );
    expect(await screen.findByText(/não editá-la/)).toBeTruthy();
    expect(screen.queryByText("Finalizar")).toBeNull();
  });
  it("opens on the overview tab and reaches the checklist through its tab", async () => {
    const user = userEvent.setup();
    setup(summary({ answered: 1, at_count: 1 }), [answer("item-001", "AT"), answer("item-002", null), answer("item-003", null)], undefined, "/audit/inspections/i1");
    const overview = await screen.findByRole("link", { name: "Visão geral" });
    expect(overview.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("heading", { name: "Respostas" })).toBeTruthy();
    // The checklist stays mounted but hidden, so its controls are not exposed.
    expect(screen.queryAllByRole("button", { name: "Atende (AT)" })).toHaveLength(0);
    expect(screen.getByText("Finalizar")).toBeTruthy();
    await user.click(screen.getByRole("link", { name: /Checklist/ }));
    expect(screen.getAllByRole("button", { name: "Atende (AT)" })).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "Respostas" })).toBeNull();
  });
  it("summarizes a draft on the overview: partial result, sections and points of attention", async () => {
    const user = userEvent.setup();
    const nat = { ...answer("item-002", "NAT"), observation: "Teto com infiltração" };
    setup(summary({ answered: 2, at_count: 1, nat_count: 1 }), [answer("item-001", "AT"), nat, answer("item-003", null)], undefined, "/audit/inspections/i1");
    await screen.findByRole("heading", { name: "Conformidade parcial" });
    expect(screen.getAllByText("Parcial · em andamento", { exact: false }).length).toBeGreaterThan(0);
    // No result band label for a draft.
    expect(screen.queryByText("Adequada")).toBeNull();
    expect(within(screen.getByRole("region", { name: /Pontos de atenção/ })).getByText("Teto com infiltração")).toBeTruthy();
    expect(screen.getByText("Sem respostas")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Abrir seção 2: ESTOQUE no checklist" }));
    expect(screen.getByRole("heading", { name: "2. ESTOQUE" })).toBeTruthy();
  });
  it("opens the requested criterion, not just its section, after the shell's route focus", async () => {
    const user = userEvent.setup();
    const scrolled: Element[] = [];
    const scrollIntoView = vi.fn(function (this: Element) { scrolled.push(this); });
    Element.prototype.scrollIntoView = scrollIntoView;
    // Mirrors the App Shell: every route change scrolls to top and focuses <main>.
    function ShellFocus() {
      const { pathname } = useLocation();
      React.useEffect(() => { document.getElementById("main")?.focus({ preventScroll: true }); }, [pathname]);
      return null;
    }
    api.inspection.mockResolvedValue(summary({ answered: 1, ap_count: 1 }));
    api.checklist.mockResolvedValue({ sections, items });
    api.answers.mockResolvedValue([answer("item-001", null), answer("item-002", null),
      { ...answer("item-003", "AP"), observation: "Caixas no chão" }]);
    render(
      <MemoryRouter initialEntries={["/audit/inspections/i1"]}>
        <main id="main" tabIndex={-1}>
          <Routes>
            <Route path="/audit/inspections/:inspectionId/*" element={<InspectionPage />} />
          </Routes>
        </main>
        <ShellFocus />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("button", { name: "Abrir critério 3 na seção 2: ESTOQUE" }));
    expect(screen.getByRole("heading", { name: "2. ESTOQUE" })).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.textContent).toContain("Estoque limpo?"));
    const row = document.activeElement as HTMLElement;
    expect(row.tagName).toBe("LI");
    expect(row.classList.contains("audit-item")).toBe(true);
    expect(scrolled).toEqual([row]);
    // Plain section navigation keeps focusing the section heading, without a criterion scroll.
    await user.click(screen.getByRole("link", { name: "Visão geral" }));
    await user.click(screen.getByRole("button", { name: "Abrir seção 1: ESTRUTURA no checklist" }));
    expect(screen.getByRole("heading", { name: "1. ESTRUTURA" })).toBeTruthy();
    await new Promise((done) => setTimeout(done, 20));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.closest(".audit-item")).toBeNull();
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });
  it("lists the inspection's plans on its tab through the Action Plans contract", async () => {
    plansApi.summaries.mockResolvedValue([{
      plan: { id: "p1", status: "pending", source_type: "checklist", source_active: true, source_response: "NAT",
        source_reactivated_after_verification: false, due_date: null, effectiveness: null,
        improvement_point: "Teto íntegro?", responsible: "" },
      item_number: 2, unit_name: "Unidade A", sector_name: null, inspection_applied_on: null,
      verified_by_name: null, completed_by_name: null,
    }]);
    setup(summary(), [answer("item-001", null), answer("item-002", "NAT"), answer("item-003", null)], undefined, "/audit/inspections/i1/plano");
    expect(await screen.findByRole("link", { name: "2. Teto íntegro?" })).toBeTruthy();
    expect(plansApi.summaries).toHaveBeenCalledWith({ p_inspection: "i1" });
    expect(screen.getByRole("link", { name: "Plano de ação" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Abrir na fila de Planos de Ação" }).getAttribute("href")).toBe("/action-plans?inspection=i1");
  });
  it("reads plans again once an AP/NAT answer is persisted, including saves still pending on a tab switch", async () => {
    const user = userEvent.setup();
    const plan = (id: string, item_number: number, source_active = true) => ({
      plan: { id, status: "pending", source_type: "checklist", source_active, source_response: "NAT",
        source_reactivated_after_verification: false, due_date: null, effectiveness: null,
        improvement_point: `Plano ${id}`, responsible: "" },
      item_number, unit_name: "Unidade A", sector_name: null, inspection_applied_on: null,
      verified_by_name: null, completed_by_name: null,
    });
    const saves: Array<() => void> = [];
    api.saveAnswer.mockImplementation((row: Answer, values) =>
      new Promise((done) => saves.push(() => done({ ...row, ...values, version: row.version + 1 }))));
    const settleSave = async () => {
      await waitFor(() => expect(saves).toHaveLength(1));
      await act(async () => saves.shift()!());
    };
    setup(summary(), items.map((i) => answer(i.key, null)));
    const nat = (await screen.findAllByRole("button", { name: /\(NAT\)$/ }))[0];
    await waitFor(() => expect(plansApi.summaries).toHaveBeenCalledTimes(1));
    // The checklist shows no plans: an answer saved there does not read them.
    await user.click(nat);
    await settleSave();
    await waitFor(() => expect(nat.getAttribute("aria-pressed")).toBe("true"));
    expect(plansApi.summaries).toHaveBeenCalledTimes(1);
    plansApi.summaries.mockResolvedValue([plan("p1", 1)]);
    await user.click(screen.getByRole("link", { name: "Visão geral" }));
    await waitFor(() => expect(plansApi.summaries).toHaveBeenCalledTimes(2));
    const plansPanel = screen.getByRole("region", { name: /Planos de ação/ });
    await waitFor(() => expect(within(plansPanel).getByText("1", { selector: "h2 .numeric" })).toBeTruthy());
    // A save still pending when leaving the checklist refreshes plans when it settles.
    await user.click(screen.getByRole("link", { name: /Checklist/ }));
    await user.click(screen.getAllByRole("button", { name: /\(AT\)$/ })[0]);
    await user.click(screen.getByRole("link", { name: "Visão geral" }));
    expect(plansApi.summaries).toHaveBeenCalledTimes(2);
    plansApi.summaries.mockResolvedValue([plan("p1", 1, false)]);
    await settleSave();
    await waitFor(() => expect(plansApi.summaries).toHaveBeenCalledTimes(3));
    // An observation-only save cannot change plans: no new read.
    await user.click(screen.getByRole("link", { name: /Checklist/ }));
    const [field] = screen.getAllByLabelText("Observação");
    await user.type(field, "Ok");
    await user.click(screen.getByRole("link", { name: "Visão geral" }));
    await settleSave();
    await waitFor(() => expect(screen.queryByText("Salvando…")).toBeNull());
    expect(api.saveAnswer).toHaveBeenCalledTimes(3);
    expect(plansApi.summaries).toHaveBeenCalledTimes(3);
  });
  it("never shows a zero count while plans or evidence are loading or failed", async () => {
    const user = userEvent.setup();
    plansApi.summaries.mockRejectedValue({ code: "XX000", message: "db detail" });
    evidenceApi.listEvidence.mockImplementation(() => new Promise(() => undefined));
    setup(summary(), items.map((i) => answer(i.key, null)), undefined, "/audit/inspections/i1");
    const plansPanel = await screen.findByRole("region", { name: /Planos de ação/ });
    await within(plansPanel).findByRole("button", { name: "Tentar novamente" });
    expect(within(plansPanel).getByRole("heading").textContent).toBe("Planos de ação");
    expect(within(plansPanel).queryByText("0")).toBeNull();
    const evidencePanel = screen.getByRole("region", { name: /^Evidências/ });
    expect(within(evidencePanel).getByRole("status").textContent).toBe("Carregando evidências…");
    expect(within(evidencePanel).getByRole("heading").textContent).toBe("Evidências");
    await user.click(screen.getByRole("link", { name: "Plano de ação" }));
    const tab = await screen.findByRole("region", { name: /Planos de ação/ });
    await within(tab).findByRole("button", { name: "Tentar novamente" });
    expect(within(tab).getByRole("heading").textContent).toBe("Planos de ação");
    expect(within(tab).queryByText("0")).toBeNull();
    await user.click(screen.getByRole("link", { name: /Checklist/ }));
    expect(screen.getAllByRole("button", { name: "Evidências" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Evidências \(0\)/ })).toBeNull();
  });
  it("hides the action plan tab without action_plan.read", async () => {
    permissions.allowed = false;
    setup(summary(), [answer("item-001", null), answer("item-002", null), answer("item-003", null)], undefined, "/audit/inspections/i1");
    await screen.findByRole("link", { name: "Visão geral" });
    expect(screen.queryByRole("link", { name: "Plano de ação" })).toBeNull();
    expect(plansApi.summaries).not.toHaveBeenCalled();
  });
  it("keeps criterion evidence behind a closed \"Evidências (n)\" disclosure", async () => {
    const user = userEvent.setup();
    evidenceApi.listEvidence.mockResolvedValue([{ id: "e1", inspection_id: "i1", item_key: "item-001", object_key: "k",
      original_name: "laudo.pdf", content_type: "application/pdf", size_bytes: 10, created_by: "u",
      uploaded_by_name: "Ana", uploaded_at: "2026-09-24T12:00:00Z" }]);
    setup(summary(), [answer("item-001", null), answer("item-002", null), answer("item-003", null)]);
    const toggle = await screen.findByRole("button", { name: "Evidências (1)" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "Anexar arquivo ao critério 1" })).toBeNull();
    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Anexar arquivo ao critério 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Baixar laudo.pdf" })).toBeTruthy();
  });
  it("keeps unsaved observation text and the pending gate across a tab switch", async () => {
    const user = userEvent.setup();
    api.saveAnswer.mockImplementation(() => new Promise(() => undefined));
    setup(summary(), [answer("item-001", null), answer("item-002", null), answer("item-003", null)]);
    const [field] = await screen.findAllByLabelText("Observação");
    await user.type(field, "Ralo aberto");
    // Leaving the tab blurs the field, which starts the (still pending) save.
    await user.click(screen.getByRole("link", { name: "Visão geral" }));
    expect(api.saveAnswer).toHaveBeenLastCalledWith(
      expect.objectContaining({ item_key: "item-001" }),
      expect.objectContaining({ observation: "Ralo aberto" }),
    );
    expect((screen.getByText("Exportar Excel") as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("link", { name: /Checklist/ }));
    expect((screen.getAllByLabelText("Observação")[0] as HTMLTextAreaElement).value).toBe("Ralo aberto");
  });
  it("handles unauthorized or unknown inspections and load errors", async () => {
    setup(null, []);
    expect(await screen.findByText("Auditoria indisponível")).toBeTruthy();
    cleanup();
    api.inspection.mockRejectedValue({ code: "XX000", message: "db detail" });
    render(
      <MemoryRouter initialEntries={["/audit/inspections/i1"]}>
        <Routes>
          <Route
            path="/audit/inspections/:inspectionId/*"
            element={<InspectionPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("db detail")).toBeNull();
  });
});

describe("unit page", () => {
  const unit = { id: "A", code: "UA-1", name: "Cozinha Central", active: true };
  const final = (id: string, applied_on: string, final_score: number, final_classification: "adequate" | "partial") =>
    summary({ id, applied_on, status: "finalized", final_score, final_classification, finalized_at: `${applied_on}T12:00:00Z`, answered: 3, at_count: 3 });
  function renderUnit(path: string) {
    api.units.mockResolvedValue([unit]);
    api.summaries.mockResolvedValue([
      summary({ id: "d1", applied_on: "2026-10-01", answered: 1, at_count: 1 }),
      final("f2", "2026-09-20", 60, "partial"),
      final("f1", "2026-08-20", 90, "adequate"),
    ]);
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="/audit/units/:unitId/*" element={<UnitPage />} /></Routes>
      </MemoryRouter>,
    );
  }
  it("summarizes the unit: situation derived from the latest final result, draft and trend", async () => {
    renderUnit("/audit/units/A");
    expect(await screen.findByRole("heading", { name: "Cozinha Central" })).toBeTruthy();
    expect(api.summaries).toHaveBeenCalledWith({ p_unit: "A" });
    // Latest finalized is partial: attention wins over the open draft (D6).
    expect(screen.getByText("Em atenção")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Resumo" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Continuar" }).getAttribute("href")).toBe("/audit/inspections/d1/checklist");
    expect(screen.getByText(/-30,0 p\.p\. vs\. anterior/)).toBeTruthy();
    expect(screen.getByRole("group", { name: /últimas 2 auditorias finalizadas/ })).toBeTruthy();
  });
  it("lets readers follow an open draft instead of offering to continue it", async () => {
    permissions.allowed = false;
    renderUnit("/audit/units/A");
    const follow = await screen.findByRole("link", { name: "Acompanhar" });
    expect(follow.getAttribute("href")).toBe("/audit/inspections/d1");
    expect(screen.queryByRole("link", { name: "Continuar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nova auditoria" })).toBeNull();
  });
  it("lists every inspection and the history report on the Histórico tab", async () => {
    renderUnit("/audit/units/A/historico");
    expect(await screen.findByRole("heading", { name: "Auditorias" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Abrir" })).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "Relatório do histórico" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Exportar histórico" })).toBeTruthy();
  });
});
describe("audit overview by monitored unit", () => {
  const units = [
    { id: "u1", code: "U1", name: "Alfa", active: true },
    { id: "u2", code: "U2", name: "Beta", active: true },
    { id: "u3", code: "U3", name: "Gama", active: true },
    { id: "u4", code: "U4", name: "Delta", active: true },
  ];
  const fin = (unit_id: string, unit_name: string, final_score: number, final_classification: "adequate" | "partial" | "inadequate") =>
    summary({ id: `f-${unit_id}`, unit_id, unit_name, status: "finalized", final_score, final_classification, finalized_at: "2026-09-20T12:00:00Z", answered: 3, at_count: 3 });
  function renderOverview() {
    api.units.mockResolvedValue(units);
    api.summaries.mockResolvedValue([
      summary({ id: "d-u2", unit_id: "u2", unit_name: "Beta", applied_on: "2026-10-01", created_at: "2026-10-01T10:00:00Z" }),
      fin("u1", "Alfa", 95, "adequate"),
      fin("u3", "Gama", 40, "inadequate"),
    ]);
    render(<MemoryRouter><AuditOverview /></MemoryRouter>);
  }
  it("orders units by situation (attention, in progress, adequate, no data) and keeps the average neutral", async () => {
    renderOverview();
    await screen.findByRole("heading", { name: "Unidades monitoradas" });
    expect(api.summaries).toHaveBeenCalledWith({ p_overview: true });
    const names = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(["Gama", "Beta", "Alfa", "Delta"]);
    // (95 + 40) / 2 = 67.5, shown without a result band (D3).
    const average = screen.getByText("67,5%");
    expect(average.closest(".metric")?.className).toBe("metric");
    expect(screen.getByRole("link", { name: "Continuar" }).getAttribute("href")).toBe("/audit/inspections/d-u2/checklist");
  });
  it("derives recent activity only from start and finalization, and covers each card with its unit code", async () => {
    renderOverview();
    const activity = await screen.findByRole("region", { name: "Atividade recente" });
    const events = within(activity).getAllByRole("listitem").map((li) => li.textContent);
    // Two finalized + one draft: three starts, two finalizations, nothing else.
    expect(events.filter((t) => t?.startsWith("Auditoria iniciada"))).toHaveLength(3);
    expect(events.filter((t) => t?.startsWith("Auditoria finalizada"))).toHaveLength(2);
    expect(events).toHaveLength(5);
    const card = screen.getByRole("heading", { level: 3, name: "Gama" }).closest(".unit-card")!;
    expect(card.querySelector(".unit-cover .unit-cover-code")?.textContent).toBe("U3");
    expect(within(card as HTMLElement).getAllByRole("link")).toHaveLength(1);
  });
  it("filters units by situation and clears the filter", async () => {
    const user = userEvent.setup();
    renderOverview();
    await screen.findByRole("heading", { name: "Unidades monitoradas" });
    await user.click(screen.getByRole("button", { name: /^Em atenção/ }));
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Gama"]);
    await user.click(screen.getByRole("button", { name: /^Adequadas/ }));
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Alfa"]);
    await user.click(screen.getByRole("button", { name: /^Todas/ }));
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(4);
  });
});
describe("new inspection", () => {
  const units = [
    { id: "u1", code: "U1", name: "Alfa", active: true },
    { id: "u2", code: "U2", name: "Beta", active: true },
  ];
  function renderNew(props: { unitId?: string }) {
    render(
      <MemoryRouter initialEntries={["/audit"]}>
        <Routes>
          <Route path="/audit" element={<NewInspection units={units} lastApplied={{ u1: "2026-09-20" }} onClose={() => undefined} {...props} />} />
          <Route path="/audit/inspections/:inspectionId/*" element={<p>Checklist aberto</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }
  it("fixes the unit from the unit page, suggests the previous visit and opens the checklist", async () => {
    const user = userEvent.setup();
    api.createInspection.mockResolvedValue("new-id");
    renderNew({ unitId: "u1" });
    expect(screen.queryByRole("combobox", { name: "Unidade" })).toBeNull();
    expect(screen.getByText("Alfa")).toBeTruthy();
    expect((screen.getByLabelText("Data da visita anterior (opcional)") as HTMLInputElement).value).toBe("2026-09-20");
    await user.click(screen.getByText("Salvar"));
    expect(api.createInspection).toHaveBeenCalledWith("u1", expect.any(String), "2026-09-20");
    expect(await screen.findByText("Checklist aberto")).toBeTruthy();
  });
  it("suggests the previous visit per chosen unit until the user edits it", async () => {
    const user = userEvent.setup();
    renderNew({});
    const previous = screen.getByLabelText("Data da visita anterior (opcional)") as HTMLInputElement;
    expect(previous.value).toBe("");
    await user.selectOptions(screen.getByRole("combobox", { name: "Unidade" }), "u1");
    expect(previous.value).toBe("2026-09-20");
    await user.selectOptions(screen.getByRole("combobox", { name: "Unidade" }), "u2");
    expect(previous.value).toBe("");
  });
});
describe("Checklist evidence removal errors", () => {
  it.each([
    ["55000", "Esta operação não é permitida no estado atual do registro."],
    ["42501", "Você não tem permissão para esta operação. Atualize seu acesso."],
  ])("preserves %s through Confirm", async (code, expected) => {
    const user = userEvent.setup();
    const controller: EvidenceController = {
      data: undefined, error: "", loading: false, uploads: {}, reload: vi.fn(),
      send: vi.fn(), retry: vi.fn(), discard: vi.fn(),
      rows: [{ id: "e1", inspection_id: "i1", item_key: "item-001", object_key: "key",
        original_name: "laudo.pdf", content_type: "application/pdf", size_bytes: 10,
        created_by: "u", uploaded_by_name: "Ana", uploaded_at: "2026-09-30T12:00:00Z" }],
    };
    evidenceApi.removeEvidence.mockRejectedValueOnce({ code, message: "private SQL detail" });
    render(<ChecklistEvidence item={items[0]} editable controller={controller} />);
    await user.click(screen.getByRole("button", { name: "Remover laudo.pdf" }));
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText(expected)).toBeTruthy();
    expect(screen.queryByText(/Verifique sua conexão/i)).toBeNull();
    expect(screen.queryByText("private SQL detail")).toBeNull();
    expect(controller.reload).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Confirmar" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
