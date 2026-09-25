import { can, hasAnyScope, type AccessGrant } from "../core/auth/permissions";
import type { IconName } from "../shared/icons";
export const groups = [
  "Qualidade",
  "Custos",
  "Administrativo",
  "Comercial",
  "Transporte",
  "Administração",
] as const;
/** Static presentation copy for each area (product copy, not data). */
export const groupDescriptions: Partial<
  Record<(typeof groups)[number], string>
> = {
  Qualidade:
    "Auditorias do checklist geral e o ciclo das ações corretivas, da execução à verificação de eficácia.",
  Administração: "Acessos, estrutura organizacional e registros do sistema.",
};
export type Destination = {
  path: string;
  label: string;
  /** Short, static description of the area (product copy, not data). */
  description: string;
  icon: IconName;
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
    description: "Inspeções do checklist geral por unidade.",
    icon: "audit",
    group: "Qualidade",
    permissions: ["audit.inspection.read"],
    scope: "any",
    nested: true,
  },
  {
    path: "/action-plans",
    label: "Planos de Ação",
    description: "Ações corretivas, execução e verificação de eficácia.",
    icon: "actionPlan",
    group: "Qualidade",
    permissions: ["action_plan.read"],
    scope: "any",
    nested: true,
  },
  {
    path: "/admin/users",
    label: "Usuários",
    description: "Contas, situação e atribuições de acesso.",
    icon: "users",
    group: "Administração",
    permissions: ["admin.user.read", "admin.user.manage"],
    scope: "global",
  },
  {
    path: "/admin/roles",
    label: "Perfis de acesso",
    description: "Perfis e seus conjuntos de permissões.",
    icon: "roles",
    group: "Administração",
    permissions: ["admin.role.read", "admin.role.manage"],
    scope: "global",
  },
  {
    path: "/admin/permissions",
    label: "Permissões",
    description: "Catálogo de permissões da plataforma.",
    icon: "permissions",
    group: "Administração",
    permissions: ["admin.role.read", "admin.role.manage"],
    scope: "global",
  },
  {
    path: "/admin/units",
    label: "Unidades",
    description: "Unidades operacionais e seus setores.",
    icon: "units",
    group: "Administração",
    permissions: ["admin.unit.read", "admin.unit.manage"],
    scope: "any",
  },
  {
    path: "/admin/sectors",
    label: "Setores",
    description: "Setores corporativos da organização.",
    icon: "sectors",
    group: "Administração",
    permissions: ["admin.sector.read", "admin.sector.manage"],
    scope: "global",
  },
  {
    path: "/admin/logs",
    label: "Logs do sistema",
    description: "Registro das alterações sensíveis.",
    icon: "logs",
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
