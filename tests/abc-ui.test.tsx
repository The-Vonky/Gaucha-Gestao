// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { visibleNavigation } from "../apps/web/src/app/navigation";
import type { AccessGrant } from "../apps/web/src/core/auth/permissions";
import { AbcModule } from "../apps/web/src/modules/abc/AbcModule";
import { formatDecimal, round } from "../apps/web/src/modules/abc/format";
import { makeXlsx, reportRows } from "./abc-fixture";

const api = vi.hoisted(() => ({
  units: vi.fn(),
  unitSeries: vi.fn(),
  revisionDetail: vi.fn(),
  unitRevisions: vi.fn(),
  overview: vi.fn(),
  competencyProducts: vi.fn(),
  productHistory: vi.fn(),
  compare: vi.fn(),
  publish: vi.fn(),
  downloadOriginal: vi.fn(),
  downloadUrl: vi.fn(),
  recordFileCheck: vi.fn(),
}));
vi.mock("../apps/web/src/modules/abc/api", async (original) => ({ ...(await original<object>()), ...api }));

const unit = { unit_id: "U1", code: "0001", name: "Filial Teste", series_count: 0, last_competency: null, can_publish: true };
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/abc/*" element={<AbcModule />} />
      </Routes>
    </MemoryRouter>,
  );
}
function xlsxFile(name: string, rows = reportRows()) {
  const bytes = makeXlsx(rows);
  const file = new File([bytes], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  // jsdom's File lacks arrayBuffer().
  Object.defineProperty(file, "arrayBuffer", { value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  return file;
}
async function choose(file: File) {
  const input = await screen.findByLabelText(/Relatório “Curva ABC Geral/);
  fireEvent.change(input, { target: { files: [file] } });
}

describe("Curva ABC navigation", () => {
  const g = (permission: string): AccessGrant => ({ permission, scope_type: "unit", unit_id: "U1", sector_id: null });
  it("shows Custos > Curva ABC only with abc.report.read", () => {
    expect(visibleNavigation(true, [g("abc.report.publish")])).toEqual([]);
    expect(visibleNavigation(true, [g("action_plan.read")]).some((x) => x.group === "Custos")).toBe(false);
    const nav = visibleNavigation(true, [g("abc.report.read")]);
    expect(nav.map((x) => [x.group, x.destinations.map((d) => d.label)])).toEqual([["Custos", ["Curva ABC"]]]);
    expect(visibleNavigation(false, [g("abc.report.read")])).toEqual([]);
  });
});

describe("Curva ABC display formatting", () => {
  it("rounds half up on strings without binary floats", () => {
    expect(round("2.345", 2)).toBe("2.35");
    expect(round("2.344", 2)).toBe("2.34");
    expect(round("0.995", 2)).toBe("1");
    expect(formatDecimal("123456789012345678901.235", 2)).toBe("123.456.789.012.345.678.901,24");
    expect(formatDecimal("-0.004", 2)).toBe("0,00");
  });
});

describe("Curva ABC import", () => {
  it("blocks publication when the preview has blockers", async () => {
    api.units.mockResolvedValue([unit]);
    api.unitSeries.mockResolvedValue([]);
    renderAt("/abc/units/U1/import");
    await choose(xlsxFile("relatorio.xlsx", reportRows({ G7: ["n", "26"] })));
    expect(await screen.findByText(/tem bloqueios e não pode ser publicado/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Publicar relatório" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText("Bloqueio").length).toBeGreaterThan(0);
  });

  it("explains that .xls is not accepted, without reading it", async () => {
    api.units.mockResolvedValue([unit]);
    api.unitSeries.mockResolvedValue([]);
    renderAt("/abc/units/U1/import");
    await choose(new File([new Uint8Array([0xd0, 0xcf])], "relatorio.XLS"));
    expect(await screen.findByText(/formato .xls .* não é aceito/i)).toBeTruthy();
  });

  it("reports a technical read failure with its cause instead of blaming the file", async () => {
    api.units.mockResolvedValue([unit]);
    api.unitSeries.mockResolvedValue([]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderAt("/abc/units/U1/import");
    const file = new File([new Uint8Array([1])], "relatorio.xlsx");
    Object.defineProperty(file, "arrayBuffer", { value: async () => { throw new TypeError("leitura negada"); } });
    await choose(file);
    expect(await screen.findByText(/Falha técnica ao ler o arquivo neste navegador \(TypeError: leitura negada\)/)).toBeTruthy();
  });

  it("previews and publishes in a non-secure context without crypto.subtle", async () => {
    api.units.mockResolvedValue([unit]);
    api.unitSeries.mockResolvedValue([]);
    api.publish.mockResolvedValue("R1");
    api.revisionDetail.mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("crypto", {});
    try {
      renderAt("/abc/units/U1/import");
      await choose(xlsxFile("01-08_ate_31-08.xlsx"));
      expect(await screen.findByText(/Validação concluída/)).toBeTruthy();
      await userEvent.click(screen.getByRole("button", { name: "Publicar relatório" }));
      await waitFor(() => expect(api.publish).toHaveBeenCalled());
      expect(api.publish.mock.calls[0][0].payload.file_sha256).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects a branch different from the selected unit", async () => {
    api.units.mockResolvedValue([{ ...unit, code: "0002" }]);
    api.unitSeries.mockResolvedValue([]);
    renderAt("/abc/units/U1/import");
    await choose(xlsxFile("relatorio.xlsx"));
    expect(await screen.findByText("Filial não corresponde à unidade selecionada.")).toBeTruthy();
  });

  it("requires accepting warnings, then publishes the parsed payload", async () => {
    api.units.mockResolvedValue([unit]);
    api.unitSeries.mockResolvedValue([]);
    api.publish.mockResolvedValue("R1");
    api.revisionDetail.mockReturnValue(new Promise(() => {}));
    renderAt("/abc/units/U1/import");
    await choose(xlsxFile("01-07_ate_31-07.xlsx"));
    const button = await screen.findByRole("button", { name: "Publicar relatório" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole("checkbox"));
    expect((button as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(button);
    await waitFor(() => expect(api.publish).toHaveBeenCalledTimes(1));
    const args = api.publish.mock.calls[0][0];
    expect(args).toMatchObject({ unitId: "U1", expectedVersion: 0, reason: null, acceptWarnings: true });
    expect(args.payload).toMatchObject({ unit_code: "0001", period_start: "2026-08-01", declared_total: "25" });
    expect(await screen.findByText("Carregando relatório…")).toBeTruthy();
  });

  it("requires a reason to replace a published revision and shows conflicts", async () => {
    api.units.mockResolvedValue([unit]);
    api.unitSeries.mockResolvedValue([{ series_id: "S1", competency: "2026-08-01", cost_basis: "NET_PERIOD", version: 3,
      revision_id: "R0", revision_number: 3, declared_total: "25", calculated_total: "25", line_count: 1, published_at: "2026-09-01T10:00:00Z" }]);
    api.publish.mockRejectedValue({ code: "40001", message: "Concurrent change" });
    renderAt("/abc/units/U1/import");
    await choose(xlsxFile("relatorio.xlsx"));
    expect(await screen.findByText(/Publicar cria a revisão 4/)).toBeTruthy();
    const button = screen.getByRole("button", { name: "Publicar relatório" }) as HTMLButtonElement;
    await userEvent.click(screen.getByRole("checkbox"));
    expect(button.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(/Motivo da substituição/), "Reexportado do ERP");
    expect(button.disabled).toBe(false);
    await userEvent.click(button);
    expect(await screen.findByText(/foi alterado ou não está mais disponível/)).toBeTruthy();
    expect(api.publish.mock.calls[0][0]).toMatchObject({ expectedVersion: 3, reason: "Reexportado do ERP" });
  });

  it("hides import for users who cannot publish", async () => {
    api.units.mockResolvedValue([{ ...unit, can_publish: false }]);
    api.unitRevisions.mockResolvedValue([]);
    renderAt("/abc/units/U1");
    expect(await screen.findByText("Ainda não há relatórios publicados para esta unidade.")).toBeTruthy();
    expect(screen.queryByText("Importar relatório")).toBeNull();
  });
});
