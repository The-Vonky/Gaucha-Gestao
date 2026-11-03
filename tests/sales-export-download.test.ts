// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { downloadExport } from "../apps/web/src/modules/sales/export/download";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("download web com ObjectURL temporária, sem caminhos de servidor", () => {
  vi.useFakeTimers();
  const create = vi.fn(() => "blob:synthetic"), revoke = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe("vendas-periodo-filtrado-20261103025959.xlsx");
    expect(this.href).toBe("blob:synthetic"); expect(document.body.contains(this)).toBe(true);
  });
  downloadExport(new Blob(["synthetic"]), "vendas-periodo-filtrado-20261103025959.xlsx");
  expect(click).toHaveBeenCalledTimes(1); expect(document.querySelector("a")).toBeNull(); expect(revoke).not.toHaveBeenCalled();
  vi.advanceTimersByTime(30000); expect(revoke).toHaveBeenCalledWith("blob:synthetic");
});
