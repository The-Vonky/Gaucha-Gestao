import type { ReactNode } from "react";
import type { Role } from "../types";
import { Badge, Notice } from "../../shared/ui";
import "./admin.css";
// Presentation helpers shared by the Administration screens only.
export function ActiveBadge({
  active,
  on = "Ativo",
  off = "Inativo",
}: {
  active: boolean;
  on?: string;
  off?: string;
}) {
  return active ? (
    <Badge tone="success" icon="check">
      {on}
    </Badge>
  ) : (
    <Badge tone="neutral" icon="close">
      {off}
    </Badge>
  );
}
/** Secondary technical identifier (UUID, key): monospace and always wrapping. */
export function Identifier({
  children,
  label,
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <span className="adm-id">
      {label && <span className="adm-id-label">{label} </span>}
      <code>{children}</code>
    </span>
  );
}
/** Loading/error/empty states shared by the paginated admin lists. */
export function ListState({
  loading,
  error,
  empty,
  emptyText,
  onRetry,
}: {
  loading: boolean;
  error: string;
  empty: boolean;
  emptyText: string;
  onRetry: () => void;
}) {
  if (loading) return <Notice>Carregando…</Notice>;
  if (error)
    return (
      <Notice error>
        {error} <button onClick={onRetry}>Tentar novamente</button>
      </Notice>
    );
  return empty ? <Notice>{emptyText}</Notice> : null;
}
const DOMAINS: Record<string, string> = {
  admin: "Administração",
  audit: "Auditoria",
  action_plan: "Planos de ação",
};
export const domainLabel = (domain: string) => DOMAINS[domain] ?? domain;
/** System vs custom role, plus the global-only restriction. */
export function RoleKind({ role }: { role: Role }) {
  return (
    <>
      {role.system ? (
        <Badge tone="neutral" icon="roles">
          Sistema · protegido
        </Badge>
      ) : (
        <Badge tone="info">Personalizado</Badge>
      )}
      {role.global_only && <Badge tone="neutral">Somente global</Badge>}
    </>
  );
}
