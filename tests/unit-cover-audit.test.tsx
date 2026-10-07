// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuditOverview } from "../apps/web/src/modules/audit/AuditOverview";
import { UnitPage } from "../apps/web/src/modules/audit/UnitPage";
import { UnitCover } from "../apps/web/src/modules/audit/UnitIdentity";
import { clearUnitCoverCache } from "../apps/web/src/core/unitCovers";
const api = vi.hoisted(() => ({ units: vi.fn(), summaries: vi.fn(), createInspection: vi.fn() }));
vi.mock("../apps/web/src/modules/audit/api", () => api);
vi.mock("../apps/web/src/modules/action-plans/api", () => ({ summaries: vi.fn(async () => []) }));
vi.mock("../apps/web/src/modules/audit/reporting/api", () => ({ inspectionExport: vi.fn(), historyExport: vi.fn() }));
vi.mock("../apps/web/src/core/auth/AuthProvider", () => ({
  useAuth: () => ({ session: { user: { id: "u" } }, profile: { active: true }, grants: [], can: () => true }),
}));
const supa = vi.hoisted(() => {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    rows,
    rpc: vi.fn(async (_name: string, args: { p_units: string[] }) => ({
      data: args.p_units.filter((id) => rows.has(id)).map((id) => rows.get(id)),
      error: null,
    })),
    sign: vi.fn(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://storage.test/${path}?token=${Math.random()}`, error: null })),
      error: null,
    })),
  };
});
vi.mock("../apps/web/src/core/client", () => ({
  database: () => ({ rpc: supa.rpc }),
  client: { storage: { from: () => ({ createSignedUrls: supa.sign }) } },
}));
const unit = (n: number) => ({ id: `unit-${String(n).padStart(2, "0")}`, code: `U${n}`, name: `Unidade ${n}`, active: true });
function cover(n: number, x = 20, y = 80) {
  const u = unit(n);
  supa.rows.set(u.id, { unit_id: u.id, asset_id: `asset-${n}`, object_key: `units/${u.id}/covers/asset-${n}.jpg`, position_x: x, position_y: y, width: 1600, height: 900, ready_at: "" });
}
const photos = () => [...document.querySelectorAll<HTMLImageElement>("img.unit-cover-photo")];
beforeEach(() => {
  clearUnitCoverCache();
  supa.rows.clear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("Audit consumes Core unit covers", () => {
  it("keeps the monogram fallback without a cover and renders the photo with its framing", () => {
    const { container, rerender } = render(<UnitCover unit={unit(1)}>x</UnitCover>);
    expect(container.querySelector(".unit-cover-monogram")?.textContent).toBe("U1");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".unit-cover")?.hasAttribute("data-photo")).toBe(false);
    rerender(
      <UnitCover unit={unit(1)} cover={{ unitId: "unit-01", assetId: "a", url: "https://storage.test/a.jpg", x: 12.5, y: 100, width: 1, height: 1 }}>x</UnitCover>,
    );
    const img = container.querySelector<HTMLImageElement>("img.unit-cover-photo")!;
    expect(img.getAttribute("src")).toBe("https://storage.test/a.jpg");
    expect(img.style.objectPosition).toBe("12.5% 100%");
    expect(img.alt).toBe("");
    expect(img.closest("[aria-hidden='true']")).not.toBeNull();
    expect(container.querySelector(".unit-cover")?.hasAttribute("data-photo")).toBe(true);
    expect(container.querySelector(".unit-cover-monogram")).not.toBeNull();
  });
  it("falls back to the monogram when the image fails and reports it once", () => {
    const onError = vi.fn();
    const c = { unitId: "unit-01", assetId: "a", url: "https://storage.test/a.jpg", x: 50, y: 50, width: 1, height: 1 };
    const { container } = render(<UnitCover unit={unit(1)} cover={c} onCoverError={onError}>x</UnitCover>);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".unit-cover")?.hasAttribute("data-photo")).toBe(false);
    expect(onError).toHaveBeenCalledWith(c);
  });
  it("resolves every overview card with one RPC and one signing call (no N+1)", async () => {
    const units = Array.from({ length: 25 }, (_, n) => unit(n));
    for (const n of [0, 3, 7, 24]) cover(n, n * 4, 100 - n * 4);
    api.units.mockResolvedValue(units);
    api.summaries.mockResolvedValue([]);
    render(<MemoryRouter><AuditOverview /></MemoryRouter>);
    await waitFor(() => expect(photos()).toHaveLength(4));
    expect(supa.rpc).toHaveBeenCalledTimes(1);
    expect(supa.rpc.mock.calls[0][0]).toBe("unit_covers");
    expect(supa.rpc.mock.calls[0][1].p_units).toHaveLength(25);
    expect(supa.sign).toHaveBeenCalledTimes(1);
    expect(supa.sign.mock.calls[0][1]).toBe(300);
    const card = screen.getByRole("link", { name: "Unidade 7" }).closest("article")!;
    expect(card.querySelector<HTMLImageElement>("img.unit-cover-photo")!.style.objectPosition).toBe("28% 72%");
    // Search and filters reuse the same resolution.
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Unidade 2" } });
    await act(async () => {});
    expect(supa.rpc).toHaveBeenCalledTimes(1);
  });
  it("re-signs failed images in one batch and keeps the fallback after a second failure", async () => {
    cover(1);
    cover(2);
    api.units.mockResolvedValue([unit(1), unit(2), unit(3)]);
    api.summaries.mockResolvedValue([]);
    render(<MemoryRouter><AuditOverview /></MemoryRouter>);
    await waitFor(() => expect(photos()).toHaveLength(2));
    const first = photos().map((i) => i.src);
    for (const img of photos()) fireEvent.error(img);
    await waitFor(() => expect(supa.rpc).toHaveBeenCalledTimes(2));
    expect(supa.rpc.mock.calls[1][1].p_units.sort()).toEqual(["unit-01", "unit-02"]);
    await waitFor(() => expect(photos()).toHaveLength(2));
    expect(photos().map((i) => i.src)).not.toEqual(first);
    for (const img of photos()) fireEvent.error(img);
    await waitFor(() => expect(photos()).toHaveLength(0));
    expect(supa.rpc).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText(/^U[123]$/).length).toBeGreaterThan(0);
  });
  it("shows the same cover in the UnitPage hero with one batch call", async () => {
    cover(5, 0, 25);
    api.units.mockResolvedValue([unit(5), unit(6)]);
    api.summaries.mockResolvedValue([]);
    render(
      <MemoryRouter initialEntries={["/audit/units/unit-05"]}>
        <Routes><Route path="/audit/units/:unitId/*" element={<UnitPage />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(photos()).toHaveLength(1));
    expect(photos()[0].closest(".unit-cover-hero")).not.toBeNull();
    expect(photos()[0].style.objectPosition).toBe("0% 25%");
    expect(supa.rpc).toHaveBeenCalledTimes(1);
    expect(supa.rpc.mock.calls[0][1].p_units).toEqual(["unit-05"]);
  });
  it("renders the page with the fallback when cover resolution fails", async () => {
    supa.rpc.mockRejectedValueOnce(new Error("network"));
    api.units.mockResolvedValue([unit(1)]);
    api.summaries.mockResolvedValue([]);
    render(<MemoryRouter><AuditOverview /></MemoryRouter>);
    expect(await screen.findByRole("link", { name: "Unidade 1" })).toBeTruthy();
    await waitFor(() => expect(supa.rpc).toHaveBeenCalledTimes(1));
    expect(photos()).toHaveLength(0);
    expect(document.querySelector(".unit-cover-monogram")?.textContent).toBe("U1");
  });
});
