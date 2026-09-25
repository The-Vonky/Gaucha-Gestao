import { can, hasAnyScope, type AccessGrant } from "../core/auth/permissions";
export const groups = [
  "Qualidade",
  "Custos",
  "Administrativo",
  "Comercial",
  "Transporte",
  "Administração",
] as const;
export type Destination = {
  path: string;
  label: string;
  group: (typeof groups)[number];
  permissions: string[];
  scope: "global" | "any";
  /** The destination owns sub-routes below its path. */
  nested?: boolean;
};
export const destinations: Destination[] = [
  {
    path: "/audit",
    label: "Auditorias",
    group: "Qualidade",
    permissions: ["audit.inspection.read"],
    scope: "any",
    nested: true,
  },
  {
    path: "/action-plans",
    label: "Planos de Ação",
    group: "Qualidade",
    permissions: ["action_plan.read"],
    scope: "any",
    nested: true,
  },
  {
    path: "/admin/users",
    label: "Usuários",
    group: "Administração",
    permissions: ["admin.user.read", "admin.user.manage"],
    scope: "global",
  },
  {
    path: "/admin/roles",
    label: "Perfis de acesso",
    group: "Administração",
    permissions: ["admin.role.read", "admin.role.manage"],
    scope: "global",
  },
  {
    path: "/admin/permissions",
    label: "Permissões",
    group: "Administração",
    permissions: ["admin.role.read", "admin.role.manage"],
    scope: "global",
  },
  {
    path: "/admin/units",
    label: "Unidades",
    group: "Administração",
    permissions: ["admin.unit.read", "admin.unit.manage"],
    scope: "any",
  },
  {
    path: "/admin/sectors",
    label: "Setores",
    group: "Administração",
    permissions: ["admin.sector.read", "admin.sector.manage"],
    scope: "global",
  },
  {
    path: "/admin/logs",
    label: "Logs do sistema",
    group: "Administração",
    permissions: ["admin.audit_log.read"],
    scope: "any",
  },
];
export function visibleNavigation(active: boolean, grants: AccessGrant[]) {
  return groups
    .map((group) => ({
      group,
      destinations: destinations.filter(
        (d) =>
          d.group === group &&
          d.permissions.some((p) =>
            d.scope === "global"
              ? can(active, grants, p)
              : hasAnyScope(active, grants, p),
          ),
      ),
    }))
    .filter((g) => g.destinations.length);
}
