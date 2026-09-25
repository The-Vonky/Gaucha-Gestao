// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { can, type AccessGrant } from "../apps/web/src/core/auth/permissions";
import { visibleNavigation } from "../apps/web/src/app/navigation";
import { ActionPlansModule } from "../apps/web/src/modules/action-plans/ActionPlansModule";
import {
  isOverdue,
  missingForExecution,
  queueRank,
} from "../apps/web/src/modules/action-plans/lifecycle";
import type {
  Evidence,
  Plan,
  PlanSummary,
} from "../apps/web/src/modules/action-plans/types";
const api = vi.hoisted(() => ({
  summaries: vi.fn(),
  plan: vi.fn(),
  creationScopes: vi.fn(),
  createManual: vi.fn(),
  update: vi.fn(),
  setStatus: vi.fn(),
  verify: vi.fn(),
}));
vi.mock("../apps/web/src/modules/action-plans/api", () => api);
const ev = vi.hoisted(() => ({
  listEvidence: vi.fn(),
  removeEvidence: vi.fn(),
  beginUpload: vi.fn(),
  finishUpload: vi.fn(),
  downloadUrl: vi.fn(),
  openDownload: vi.fn(),
}));
vi.mock("../apps/web/src/modules/action-plans/evidence", async (original) => ({
  ...(await original<object>()),
  ...ev,
}));
const auth = vi.hoisted(() => ({ grants: [] as AccessGrant[] }));
vi.mock("../apps/web/src/core/auth/AuthProvider", () => ({
  useAuth: () => ({
    profile: { active: true },
    grants: auth.grants,
    can: (
      p: string,
      s?: { unit_id?: string | null; sector_id?: string | null },
    ) => can(true, auth.grants, p, s),
  }),
}));
const grant = (permission: string): AccessGrant => ({
  permission,
  scope_type: "unit",
  unit_id: "A",
  sector_id: null,
});
const grants = (...p: string[]) => p.map((x) => grant(`action_plan.${x}`));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  ev.listEvidence.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  auth.grants = [];
  ev.listEvidence.mockResolvedValue([]);
});
function plan(over: Partial<Plan> = {}): Plan {
  return {
    id: "p1",
    unit_id: "A",
    sector_id: null,
    source_type: "manual",
    source_inspection_id: null,
    source_item_key: null,
    source_active: null,
    source_response: null,
    source_observation: null,
    source_reactivated_after_verification: false,
    improvement_point: "Telas danificadas",
    action: "Reinstalar",
    how_to: "Manutenção",
    responsible: "Equipe de Manutenção",
    due_date: "2999-01-01",
    status: "pending",
    effectiveness_criterion: "Sem insetos",
    monitoring_start: null,
    monitoring_end: null,
    expected_evidence: "Checklist diário",
    effectiveness: null,
    verified_on: null,
    verification_notes: null,
    verified_by: null,
    verified_at: null,
    completed_by: null,
    completed_at: null,
    verification_round: 0,
    version: 1,
    created_at: "",
    updated_at: "",
    ...over,
  };
}
const summary = (p: Plan, over: Partial<PlanSummary> = {}): PlanSummary => ({
  plan: p,
  unit_name: "Unidade A",
  sector_name: null,
  inspection_applied_on: p.source_type === "checklist" ? "2026-09-20" : null,
  item_number: p.source_type === "checklist" ? 7 : null,
  verified_by_name: null,
  completed_by_name: null,
  ...over,
});
const checklist = (over: Partial<Plan> = {}) =>
  plan({
    source_type: "checklist",
    source_inspection_id: "i1",
    source_item_key: "item-007",
    source_active: true,
    source_response: "NAT",
    source_observation: "Tela rasgada na janela",
    ...over,
  });
function open(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/action-plans/*" element={<ActionPlansModule />} />
      </Routes>
    </MemoryRouter>,
  );
}
describe("action plan lifecycle rules", () => {
  it("computes overdue only for open plans past the due date", () => {
    expect(isOverdue(plan({ due_date: "2026-09-01" }), "2026-09-02")).toBe(
      true,
    );
    expect(isOverdue(plan({ due_date: "2026-09-02" }), "2026-09-02")).toBe(
      false,
    );
    expect(
      isOverdue(
        plan({ due_date: "2026-09-01", status: "completed" }),
        "2026-09-02",
      ),
    ).toBe(false);
    expect(isOverdue(plan({ due_date: null }), "2026-09-02")).toBe(false);
  });
  it("lists missing planning fields before execution", () => {
    expect(missingForExecution(plan())).toEqual([]);
    expect(
      missingForExecution(
        plan({ action: " ", due_date: null, expected_evidence: "" }),
      ),
    ).toEqual(["O que fazer", "Prazo", "Evidência esperada"]);
  });
  it("orders the operational queue", () => {
    const d = "2026-09-02";
    const ranks = [
      plan({ due_date: "2026-09-01" }),
      checklist(),
      plan(),
      plan({ status: "completed", completed_at: "x" }),
      plan({ status: "completed", effectiveness: "effective" }),
    ].map((p) => queueRank(p, d));
    expect(ranks).toEqual([0, 1, 2, 3, 4]);
  });
});
describe("action plans UI", () => {
  it("shows Planos de Ação only with read permission", () => {
    expect(visibleNavigation(true, grants("create_manual", "write"))).toEqual(
      [],
    );
    const nav = visibleNavigation(true, grants("read"));
    expect(nav[0].destinations.map((d) => d.label)).toEqual(["Planos de Ação"]);
  });
  it("renders the queue with states, hides inactive sources and honors create permission", async () => {
    auth.grants = grants("read");
    api.summaries.mockResolvedValue([
      summary(
        plan({
          id: "late",
          improvement_point: "Atrasado A",
          due_date: "2020-01-01",
        }),
      ),
      summary(
        plan({
          id: "done",
          improvement_point: "Concluído B",
          status: "completed",
          completed_at: "x",
        }),
      ),
      summary(
        checklist({
          id: "old",
          improvement_point: "Histórico C",
          source_active: false,
        }),
      ),
    ]);
    open("/action-plans");
    expect(await screen.findByText("Atrasado A")).toBeTruthy();
    expect(screen.getAllByText("Atrasado").length).toBeGreaterThan(0);
    expect(screen.getByText("Aguardando verificação de eficácia")).toBeTruthy();
    expect(screen.queryByText(/Histórico C/)).toBeNull();
    expect(screen.queryByText("Novo plano")).toBeNull();
    expect(api.creationScopes).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .click(screen.getByLabelText("Incluir origens inativas"));
    expect(screen.getByText(/Histórico C/)).toBeTruthy();
    expect(screen.getByText("Origem inativa (histórico)")).toBeTruthy();
  });
  it("offers manual creation only with create permission", async () => {
    auth.grants = grants("read", "create_manual");
    api.summaries.mockResolvedValue([summary(plan())]);
    api.creationScopes.mockResolvedValue([
      {
        unit_id: "A",
        unit_name: "Unidade A",
        sector_id: null,
        sector_name: null,
      },
    ]);
    open("/action-plans");
    await userEvent.setup().click(await screen.findByText("Novo plano"));
    expect(screen.getByLabelText("Unidade (obrigatório)")).toBeTruthy();
    expect(
      screen.getByLabelText("Ponto de melhoria (obrigatório)"),
    ).toBeTruthy();
  });
  it("filters the queue by ?inspection", async () => {
    auth.grants = grants("read");
    api.summaries.mockResolvedValue([]);
    open("/action-plans?inspection=i1");
    expect(
      await screen.findByText(
        /Nenhum plano de ação disponível para esta auditoria/,
      ),
    ).toBeTruthy();
    expect(api.summaries).toHaveBeenCalledWith({ p_inspection: "i1" });
  });
  it("shows empty and error states", async () => {
    auth.grants = grants("read");
    api.summaries.mockRejectedValue({ code: "XX000", message: "db detail" });
    open("/action-plans");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("db detail")).toBeNull();
  });
  it("renders checklist source context and the reactivation warning", async () => {
    auth.grants = grants("read");
    api.plan.mockResolvedValue(
      summary(
        checklist({
          status: "completed",
          completed_at: "2026-09-21T10:00:00Z",
          effectiveness: "effective",
          verified_on: "2026-09-22",
          verification_notes: "Sem reincidência",
          verified_at: "2026-09-22T10:00:00Z",
          source_reactivated_after_verification: true,
        }),
        { verified_by_name: "Vera" },
      ),
    );
    open("/action-plans/p1");
    expect(await screen.findByText("Tela rasgada na janela")).toBeTruthy();
    expect(screen.getByText("NAT (ativa)")).toBeTruthy();
    expect(
      screen.getByText(/voltou a ser AP\/NAT depois da verificação/),
    ).toBeTruthy();
    expect(screen.getByText("Eficaz", { selector: "dd" })).toBeTruthy();
    // No audit read: no link back; no write/verify: no actions.
    expect(screen.queryByText("Abrir auditoria")).toBeNull();
    expect(
      screen.queryByText(/Verificar eficácia|Editar planejamento/),
    ).toBeNull();
  });
  it("shows the verification form only with verify permission on completed plans", async () => {
    auth.grants = grants("read", "write");
    api.plan.mockResolvedValue(
      summary(plan({ status: "completed", completed_at: "x" })),
    );
    open("/action-plans/p1");
    expect(await screen.findByText("Retomar execução")).toBeTruthy();
    expect(screen.queryByText("Verificar eficácia")).toBeNull();
    cleanup();
    auth.grants = grants("read", "verify");
    open("/action-plans/p1");
    const user = userEvent.setup();
    await user.click(await screen.findByText("Verificar eficácia"));
    expect(screen.queryByText("Retomar execução")).toBeNull();
    expect(screen.getByText("Resultado (obrigatório)")).toBeTruthy();
    expect(screen.getAllByText("Sem insetos").length).toBeGreaterThan(0);
    cleanup();
    api.plan.mockResolvedValue(summary(plan()));
    open("/action-plans/p1");
    expect(await screen.findByText("Telas danificadas")).toBeTruthy();
    expect(screen.queryByText("Verificar eficácia")).toBeNull();
  });
  it("reloads and reports a concurrent change", async () => {
    auth.grants = grants("read", "write");
    api.plan.mockResolvedValue(summary(plan()));
    api.setStatus.mockRejectedValue({ code: "40001" });
    open("/action-plans/p1");
    const user = userEvent.setup();
    await user.click(await screen.findByText("Iniciar execução"));
    await user.click(screen.getByText("Confirmar"));
    expect(await screen.findByText(/alterado em outra sessão/)).toBeTruthy();
    await waitFor(() => expect(api.plan).toHaveBeenCalledTimes(2));
  });
  it("blocks execution transitions until planning is complete and handles unknown plans", async () => {
    auth.grants = grants("read", "write");
    api.plan.mockResolvedValue(summary(plan({ action: "", responsible: "" })));
    open("/action-plans/p1");
    const start = (await screen.findByText(
      "Iniciar execução",
    )) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    expect(screen.getByText(/preencha: O que fazer, Responsável/)).toBeTruthy();
    cleanup();
    api.plan.mockResolvedValue(null);
    open("/action-plans/unknown");
    expect(await screen.findByText("Plano de ação indisponível")).toBeTruthy();
  });
});
const evidence = (over: Partial<Evidence> = {}): Evidence => ({
  id: "e1",
  plan_id: "p1",
  kind: "execution",
  verification_round: null,
  object_key: "p1/e1",
  original_name: "laudo.pdf",
  content_type: "application/pdf",
  size_bytes: 2 * 1024 * 1024,
  created_by: "u1",
  uploaded_by_name: "Ana",
  uploaded_at: "2026-09-25T10:00:00Z",
  ...over,
});
const verifiedPlan = (round: number) =>
  plan({
    status: "completed",
    completed_at: "2026-09-21T10:00:00Z",
    effectiveness: "effective",
    verified_on: "2026-09-22",
    verification_notes: "Sem reincidência",
    verified_at: "2026-09-22T10:00:00Z",
    verification_round: round,
  });
const fileInput = () =>
  document.querySelector('input[type="file"]') as HTMLInputElement;
describe("Action Plan evidence UI", () => {
  it("lets write change execution evidence only before verification", async () => {
    auth.grants = grants("read", "write");
    api.plan.mockResolvedValue(summary(plan()));
    ev.listEvidence.mockResolvedValue([evidence()]);
    open("/action-plans/p1");
    expect(await screen.findByText("laudo.pdf")).toBeTruthy();
    expect(screen.getByText(/PDF · 2 MB · Ana/)).toBeTruthy();
    expect(screen.getByText("Anexar evidência da execução")).toBeTruthy();
    expect(screen.getByLabelText("Remover laudo.pdf")).toBeTruthy();
    expect(screen.queryByText("Anexar evidência da verificação")).toBeNull();
    expect(fileInput().accept).toContain(".pdf");
    expect(fileInput().accept).not.toMatch(/\.xls,|\.doc,|heic|svg|zip/);
    cleanup();
    api.plan.mockResolvedValue(summary(verifiedPlan(1)));
    open("/action-plans/p1");
    expect(await screen.findByText("laudo.pdf")).toBeTruthy();
    expect(screen.queryByText("Anexar evidência da execução")).toBeNull();
    expect(screen.queryByLabelText("Remover laudo.pdf")).toBeNull();
    cleanup();
    auth.grants = grants("read");
    api.plan.mockResolvedValue(summary(plan()));
    open("/action-plans/p1");
    expect(await screen.findByText("laudo.pdf")).toBeTruthy();
    expect(screen.getByText("Baixar")).toBeTruthy();
    expect(screen.queryByText(/Anexar evidência/)).toBeNull();
    expect(screen.queryByText("Remover")).toBeNull();
  });
  it("groups verification evidence by round and only the open round can change", async () => {
    auth.grants = grants("read", "verify");
    api.plan.mockResolvedValue(summary(verifiedPlan(2)));
    const round = (id: string, n: number) =>
      evidence({
        id,
        kind: "verification",
        verification_round: n,
        original_name: `${id}.pdf`,
      });
    ev.listEvidence.mockResolvedValue([
      evidence({ id: "x", original_name: "execucao.pdf" }),
      round("v1", 1),
      round("v2", 2),
      round("v3", 3),
    ]);
    open("/action-plans/p1");
    expect(await screen.findByText("v3.pdf")).toBeTruthy();
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual([
      "Para a próxima verificação",
      "Verificação nº 2 (atual)",
      "Verificação nº 1",
    ]);
    expect(screen.getByLabelText("Remover v3.pdf")).toBeTruthy();
    for (const name of ["v1.pdf", "v2.pdf", "execucao.pdf"])
      expect(screen.queryByLabelText(`Remover ${name}`)).toBeNull();
    expect(screen.getByText("Anexar evidência da verificação")).toBeTruthy();
    // The verification form shows the material this verification will be bound to.
    const user = userEvent.setup();
    await user.click(screen.getByText("Reverificar eficácia"));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Evidências desta verificação");
    expect(dialog.textContent).toContain("execucao.pdf");
    expect(dialog.textContent).toContain("v3.pdf");
    expect(dialog.textContent).not.toContain("v2.pdf");
    cleanup();
    api.plan.mockResolvedValue(summary(plan({ status: "in_progress" })));
    ev.listEvidence.mockResolvedValue([]);
    open("/action-plans/p1");
    expect(
      await screen.findByText(/podem ser anexadas após a conclusão/),
    ).toBeTruthy();
    expect(screen.getByText("Para a verificação")).toBeTruthy();
    expect(screen.queryByText("Anexar evidência da verificação")).toBeNull();
  });
  it("verifies only against the evidence set the verifier is shown", async () => {
    auth.grants = grants("read", "verify");
    const completed = plan({ status: "completed", version: 3 });
    api.plan.mockResolvedValue(summary(completed));
    api.verify.mockResolvedValue(undefined);
    const x = evidence({ id: "x", original_name: "execucao.pdf" });
    const y = evidence({
      id: "y",
      kind: "verification",
      verification_round: 1,
      original_name: "medicao.pdf",
    });
    ev.listEvidence.mockResolvedValue([x]);
    open("/action-plans/p1");
    expect(await screen.findByText("execucao.pdf")).toBeTruthy();
    // Another verifier attached Y after this page loaded: opening the form shows it.
    ev.listEvidence.mockResolvedValue([x, y]);
    const user = userEvent.setup();
    await user.click(screen.getByText("Verificar eficácia"));
    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(dialog.textContent).toContain("medicao.pdf"));
    await user.click(screen.getByLabelText("Eficaz"));
    await user.type(screen.getByLabelText(/Análise/), "Critério atendido");
    // Y is removed while the form is open: the verification is not recorded.
    ev.listEvidence.mockResolvedValue([x]);
    await user.click(screen.getByText("Salvar"));
    expect(
      await screen.findByText(/As evidências desta verificação mudaram/),
    ).toBeTruthy();
    expect(api.verify).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("dialog").textContent).not.toContain(
        "medicao.pdf",
      ),
    );
    // Confirming again after reviewing the current set records it.
    await user.click(screen.getByText("Salvar"));
    await waitFor(() => expect(api.verify).toHaveBeenCalledTimes(1));
    expect(api.verify.mock.calls[0][0]).toMatchObject({ id: "p1", version: 3 });
  });
  it("uploads one file, keeps a failed attempt for retry and reloads the list", async () => {
    auth.grants = grants("read", "write");
    api.plan.mockResolvedValue(summary(plan()));
    const attempt = { evidenceId: "e9", key: "p1/e9", body: new Blob(["x"]) };
    ev.beginUpload.mockResolvedValue(attempt);
    ev.finishUpload
      // The shape PostgREST gives a lost confirm response (no server code).
      .mockRejectedValueOnce({
        message: "TypeError: Failed to fetch",
        code: "",
      })
      .mockResolvedValueOnce(undefined);
    open("/action-plans/p1");
    await screen.findAllByText("Nenhuma evidência anexada.");
    const user = userEvent.setup();
    const file = new File(["%PDF-1.4"], "laudo.pdf", {
      type: "application/pdf",
    });
    await user.upload(fileInput(), file);
    expect(ev.beginUpload).toHaveBeenCalledWith("p1", "execution", file);
    expect(await screen.findByText(/Verifique sua conexão/)).toBeTruthy();
    await user.click(screen.getByText("Tentar novamente"));
    await waitFor(() => expect(ev.finishUpload).toHaveBeenCalledTimes(2));
    expect(ev.finishUpload).toHaveBeenLastCalledWith(attempt);
    expect(ev.beginUpload).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(ev.listEvidence).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Tentar novamente")).toBeNull();
  });
  it("shows a specific message and no retry when the server rejects the upload", async () => {
    auth.grants = grants("read", "write");
    api.plan.mockResolvedValue(summary(plan()));
    ev.beginUpload.mockRejectedValue({
      code: "23514",
      message: "Evidence limit reached",
    });
    open("/action-plans/p1");
    await screen.findAllByText("Nenhuma evidência anexada.");
    await userEvent.setup().upload(fileInput(), new File(["x"], "a.pdf"));
    expect(await screen.findByText(/Limite de 20 evidências/)).toBeTruthy();
    expect(screen.queryByText("Tentar novamente")).toBeNull();
  });
  it("removes only after an application dialog, never a native confirm", async () => {
    const native = vi.spyOn(window, "confirm");
    auth.grants = grants("read", "write");
    api.plan.mockResolvedValue(summary(plan()));
    ev.listEvidence.mockResolvedValue([evidence()]);
    ev.removeEvidence.mockResolvedValue(undefined);
    open("/action-plans/p1");
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText("Remover laudo.pdf"));
    expect(screen.getByRole("dialog").textContent).toContain(
      "Remover evidência",
    );
    expect(ev.removeEvidence).not.toHaveBeenCalled();
    await user.click(screen.getByText("Confirmar"));
    await waitFor(() => expect(ev.removeEvidence).toHaveBeenCalledWith("e1"));
    await waitFor(() => expect(ev.listEvidence).toHaveBeenCalledTimes(2));
    expect(native).not.toHaveBeenCalled();
  });
  it("downloads through a short-lived URL requested on click", async () => {
    auth.grants = grants("read");
    api.plan.mockResolvedValue(summary(plan()));
    const row = evidence();
    ev.listEvidence.mockResolvedValue([row]);
    ev.downloadUrl
      .mockResolvedValueOnce("https://storage.test/signed")
      .mockRejectedValueOnce(new Error("Object not found"));
    open("/action-plans/p1");
    const user = userEvent.setup();
    await user.click(await screen.findByText("Baixar"));
    expect(ev.downloadUrl).toHaveBeenCalledWith(row);
    expect(ev.openDownload).toHaveBeenCalledWith("https://storage.test/signed");
    await user.click(screen.getByText("Baixar"));
    expect(await screen.findByText("Arquivo indisponível.")).toBeTruthy();
  });
  it("shows evidence loading and error states without hiding the plan", async () => {
    auth.grants = grants("read");
    api.plan.mockResolvedValue(summary(plan()));
    ev.listEvidence.mockRejectedValue(new Error("offline"));
    open("/action-plans/p1");
    expect(
      await screen.findAllByText(/Não foi possível carregar as evidências/),
    ).toHaveLength(2);
    expect(screen.getByText("Telas danificadas")).toBeTruthy();
  });
});
