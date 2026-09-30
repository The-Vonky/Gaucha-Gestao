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
import { MemoryRouter, Route, Routes } from "react-router-dom";
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
const permissions = vi.hoisted(() => ({ allowed: true }));
vi.mock("../apps/web/src/core/auth/AuthProvider", () => ({
  useAuth: () => ({ can: () => permissions.allowed }),
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
function setup(s: InspectionSummary | null, rows: Answer[]) {
  api.inspection.mockResolvedValue(s);
  api.checklist.mockResolvedValue({ sections, items });
  api.answers.mockResolvedValue(rows);
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
    await user.click(screen.getByText("Confirmar"));
    await waitFor(()=>expect(api.finalize).toHaveBeenCalledWith("i1",1,["e9"]));
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
