export type Scope = { unit_id?: string | null; sector_id?: string | null };
export type AccessGrant = {
  permission: string;
  scope_type: "global" | "unit" | "sector";
  unit_id: string | null;
  sector_id: string | null;
};
// UI projection only. Database RLS evaluates current permissions independently.
export function can(
  active: boolean,
  grants: AccessGrant[],
  permission: string,
  scope: Scope = {},
): boolean {
  return (
    active &&
    grants.some(
      (g) =>
        g.permission === permission &&
        (g.scope_type === "global" ||
          (!!scope.unit_id &&
            g.unit_id === scope.unit_id &&
            (g.scope_type === "unit" ||
              (!!scope.sector_id && g.sector_id === scope.sector_id)))),
    )
  );
}
export function hasAnyScope(
  active: boolean,
  grants: AccessGrant[],
  permission: string,
): boolean {
  return active && grants.some((g) => g.permission === permission);
}
