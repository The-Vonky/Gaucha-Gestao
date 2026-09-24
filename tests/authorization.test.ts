import { describe, expect, it } from "vitest";
import { can, type AccessGrant } from "../apps/web/src/core/auth/permissions";
import { visibleNavigation } from "../apps/web/src/app/navigation";
const grant = (
  permission: string,
  scope_type: AccessGrant["scope_type"],
  unit_id: string | null = null,
  sector_id: string | null = null,
): AccessGrant => ({ permission, scope_type, unit_id, sector_id });
describe("permission and scope contracts", () => {
  it("denies inactive and unassigned users", () => {
    expect(
      can(
        false,
        [grant("audit.inspection.read", "global")],
        "audit.inspection.read",
      ),
    ).toBe(false);
    expect(can(true, [], "audit.inspection.read")).toBe(false);
  });
  it("denies missing permission and another domain", () => {
    expect(
      can(
        true,
        [grant("audit.inspection.read", "global")],
        "action_plan.write",
      ),
    ).toBe(false);
  });
  it("grants global permission", () => {
    expect(
      can(
        true,
        [grant("audit.inspection.read", "global")],
        "audit.inspection.read",
        { unit_id: "A", sector_id: "S" },
      ),
    ).toBe(true);
  });
  it("limits unit permission to that unit", () => {
    const g = [grant("audit.inspection.read", "unit", "A")];
    expect(can(true, g, "audit.inspection.read", { unit_id: "A" })).toBe(true);
    expect(can(true, g, "audit.inspection.read", { unit_id: "B" })).toBe(false);
    expect(can(true, g, "audit.inspection.read")).toBe(false);
  });
  it("limits sector permission to the unit-sector pair", () => {
    const g = [grant("audit.inspection.read", "sector", "A", "S")];
    expect(
      can(true, g, "audit.inspection.read", { unit_id: "A", sector_id: "S" }),
    ).toBe(true);
    for (const scope of [
      { unit_id: "B", sector_id: "S" },
      { unit_id: "A", sector_id: "T" },
      { unit_id: "A" },
    ])
      expect(can(true, g, "audit.inspection.read", scope)).toBe(false);
  });
  it("does not mix scopes between assignments", () => {
    const g = [
      grant("audit.inspection.read", "unit", "A"),
      grant("action_plan.write", "unit", "B"),
    ];
    expect(can(true, g, "audit.inspection.read", { unit_id: "B" })).toBe(false);
    expect(can(true, g, "action_plan.write", { unit_id: "B" })).toBe(true);
  });
  it("omits empty groups and inaccessible admin pages", () => {
    expect(visibleNavigation(true, [])).toEqual([]);
    const n = visibleNavigation(true, [
      grant("audit.inspection.read", "unit", "A"),
    ]);
    expect(n.map((x) => x.group)).toEqual(["Qualidade"]);
    expect(n[0].destinations.map((x) => x.path)).toEqual(["/audit"]);
    expect(
      visibleNavigation(false, [grant("admin.user.read", "global")]),
    ).toEqual([]);
  });
});
