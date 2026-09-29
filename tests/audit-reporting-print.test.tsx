// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PrintSurface } from "../apps/web/src/modules/audit/reporting/PrintSurface";
import type { HistoryReport, InspectionReport } from "../apps/web/src/modules/audit/reporting/types";

const id = "00000000-0000-0000-0000-000000000001";
const common = { schema_version: 1 as const, generated_at: "2026-09-29T12:00:00Z",
  display_timezone: "America/Sao_Paulo" as const,
  generated_by: { id, name: "@Usuário" }, unit: { id, code: "A", name: "Unidade Á" } };
const counts = { total: 158, answered: 0, unanswered: 158, applicable: 0, at: 0, ap: 0, nat: 0, nap: 0 };
const inspection: InspectionReport = { ...common, kind: "inspection", record_count: 1,
  inspection: { id, template_version: "v1", applied_on: "2026-09-29", previous_visit_on: null,
    responsible_id: id, responsible_name: "<img onerror=alert(1)>", status: "draft", counts,
    progress_percent: 0, score: null, classification: null, finalized_at: null, version: 1, created_at: common.generated_at },
  sections: Array.from({ length: 9 }, (_, section) => ({ key: `s-${section}`, position: section + 1,
    name: `Seção ${section + 1}`, counts, score: null, complete: false, classification: null,
    items: Array.from({ length: section === 0 ? 22 : 17 }, (_, position) => ({ key: `i-${section}-${position}`,
      position: position + 1, number: position + 1, text: `Critério ${section}-${position}`,
      response: null, observation: position === 0 ? "=SUM(1,2)\n" + "á".repeat(1800) : "",
      version: 1, updated_at: common.generated_at })) })) };
afterEach(() => { cleanup(); document.getElementById("root")?.remove(); });

describe("Audit print surface", () => {
  it("renders all nine sections, 158 criteria, observations and draft label in a dedicated portal", async () => {
    const root = document.createElement("div"); root.id = "root"; root.textContent = "App navigation chrome"; document.body.append(root);
    const onClose = vi.fn();
    render(<PrintSurface report={inspection} onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Prévia de impressão" });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.querySelectorAll(".report-section")).toHaveLength(9);
    expect(dialog.querySelectorAll(".report-section li")).toHaveLength(158);
    expect(dialog.textContent).toContain("RASCUNHO · RESULTADO PARCIAL");
    expect(dialog.textContent).toContain("=SUM(1,2)");
    expect(dialog.querySelector("img")).toBeNull();
    expect(dialog.textContent).not.toContain("App navigation chrome");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Fechar relatório" }));
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Imprimir / Salvar como PDF" }));
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Fechar relatório" }));
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("includes complete zero or nonempty history with repeatable print headers", () => {
    const history: HistoryReport = { ...common, kind: "unit_history", record_count: 1,
      filters: { from: "2026-09-29", to: "2026-09-29" }, ordering: "applied_on DESC, created_at DESC, id DESC",
      records: [{ ...inspection.inspection, delta_pp: null }] };
    render(<PrintSurface report={history} onClose={() => {}} />);
    expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(1);
    expect(screen.getByRole("columnheader", { name: "Conformidade / delta" })).toBeTruthy();
    const css = readFileSync("apps/web/src/modules/audit/reporting/print.css", "utf8");
    expect(css).toMatch(/@media print[\s\S]*body > #root\s*\{ display: none !important/);
    expect(css).toMatch(/\.report-history thead\s*\{ display: table-header-group/);
    expect(css).toMatch(/@media \(max-width: 600px\)/);
    expect(css).toMatch(/overflow-wrap: anywhere/);
  });
});
