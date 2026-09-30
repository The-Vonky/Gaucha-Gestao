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
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { ChecklistEvidence } from "../apps/web/src/modules/audit/ChecklistEvidence";
import type { EvidenceController } from "../apps/web/src/modules/audit/useChecklistEvidence";
import { InspectionPage } from "../apps/web/src/modules/audit/InspectionPage";
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
}));
vi.mock("../apps/web/src/modules/audit/api", () => api);
const evidenceApi=vi.hoisted(()=>({listEvidence:vi.fn(async()=>[]),pendingCount:vi.fn(async()=>0),beginUpload:vi.fn(),finishUpload:vi.fn(),removeEvidence:vi.fn(),downloadEvidence:vi.fn(),evidenceMessage:vi.fn(()=> "Envio falhou"),retryable:vi.fn(()=>true),ACCEPT:".pdf",FORMATS_HINT:"PDF",formatSize:vi.fn(()=> "1 KB"),typeLabel:vi.fn(()=> "PDF")}));
vi.mock("../apps/web/src/modules/audit/evidence",()=>evidenceApi);
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
function setup(s: InspectionSummary | null, rows: Answer[], onRender?: React.ProfilerOnRenderCallback) {
  api.inspection.mockResolvedValue(s);
  api.checklist.mockResolvedValue({ sections, items });
  api.answers.mockResolvedValue(rows);
  render(
    <MemoryRouter initialEntries={["/audit/inspections/i1"]}>
      <Routes>
        <Route
          path="/audit/inspections/:inspectionId"
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
    render(<MemoryRouter initialEntries={["/audit/inspections/i1"]}>
      <Link to="/audit/inspections/i2">Outra auditoria</Link>
      <Routes><Route path="/audit/inspections/:inspectionId" element={<InspectionPage/>}/></Routes>
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
  it("handles unauthorized or unknown inspections and load errors", async () => {
    setup(null, []);
    expect(await screen.findByText("Auditoria indisponível")).toBeTruthy();
    cleanup();
    api.inspection.mockRejectedValue({ code: "XX000", message: "db detail" });
    render(
      <MemoryRouter initialEntries={["/audit/inspections/i1"]}>
        <Routes>
          <Route
            path="/audit/inspections/:inspectionId"
            element={<InspectionPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("db detail")).toBeNull();
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
