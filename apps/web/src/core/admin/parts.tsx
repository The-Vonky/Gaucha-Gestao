import { useEffect, useState, type ReactNode } from "react";
import type { Permission, Role } from "../types";
import { Badge, LoadingState, Notice } from "../../shared/ui";
import { PAGE_SIZE } from "./api";
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
/** Loading and error states shared by the admin lists (empty results use EmptyState). */
export function ListState({
  loading,
  error,
  label,
  onRetry,
}: {
  loading: boolean;
  error: string;
  label: string;
  onRetry: () => void;
}) {
  if (loading) return <LoadingState label={label} />;
  if (error)
    return (
      <Notice error>
        {error} <button onClick={onRetry}>Tentar novamente</button>
      </Notice>
    );
  return null;
}
/** Debounced name search, "show inactive" toggle and page of a filtered admin list. */
export function useListFilters() {
  const [page, setPage] = useState(0);
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [inactive, setInactive] = useState(false);
  // Waits for the user to stop typing before querying.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(term.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [term]);
  return {
    page,
    setPage,
    term,
    setTerm,
    search,
    inactive,
    setInactive: (value: boolean) => {
      setInactive(value);
      setPage(0);
    },
    clear: () => {
      setTerm("");
      setSearch("");
      setPage(0);
    },
  };
}
export type ListFilters = ReturnType<typeof useListFilters>;
/**
 * A page left past the end (its rows deactivated and now hidden) moves back to the
 * last page that still has rows, instead of showing an empty page without a pager.
 */
export function usePageClamp(filters: ListFilters, count?: number) {
  const { page, setPage } = filters;
  useEffect(() => {
    if (count === undefined) return;
    const last = Math.max(0, Math.ceil(count / PAGE_SIZE) - 1);
    if (page > last) setPage(last);
  }, [page, count, setPage]);
}
/** Keeps the previous result on screen while the next search, page or reload loads. */
export function useLatest<T>(resource: { data?: T; error: string }) {
  const [shown, setShown] = useState<T>();
  useEffect(() => {
    if (resource.data) setShown(resource.data);
  }, [resource.data]);
  return resource.error ? undefined : (resource.data ?? shown);
}
/** Grammatical forms for the result count ("3 unidades ativas"). */
export type Noun = {
  one: string;
  many: string;
  activeOne: string;
  activeMany: string;
  inactiveToggle: string;
};
/** Search, inactive toggle and the result count on one surface. */
export function ListToolbar({
  label,
  placeholder,
  filters,
  count,
  noun,
}: {
  label: string;
  placeholder: string;
  filters: ListFilters;
  count?: number;
  noun: Noun;
}) {
  return (
    <form
      className="filters adm-filters adm-toolbar"
      aria-label={label}
      onSubmit={(e) => e.preventDefault()}
    >
      <label className="adm-filter-wide">
        Buscar
        <input
          type="search"
          placeholder={placeholder}
          maxLength={160}
          value={filters.term}
          onChange={(e) => filters.setTerm(e.target.value)}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={filters.inactive}
          onChange={(e) => filters.setInactive(e.target.checked)}
        />
        <span>{noun.inactiveToggle}</span>
      </label>
      {count !== undefined && (
        <p className="adm-total" role="status">
          <strong className="numeric">{count}</strong>{" "}
          {count === 1 ? noun.one : noun.many}
          {filters.inactive
            ? ""
            : ` ${count === 1 ? noun.activeOne : noun.activeMany}`}
          {filters.search ? ` para “${filters.search}”` : ""}
        </p>
      )}
    </form>
  );
}
const DOMAINS: Record<string, string> = {
  core: "Plataforma",
  admin: "Administração",
  audit: "Auditoria",
  action_plan: "Planos de ação",
};
export const domainLabel = (domain: string) => DOMAINS[domain] ?? domain;
/** Permissions grouped by domain, in catalog order. */
export function byDomain(permissions: Permission[]) {
  const groups = new Map<string, Permission[]>();
  for (const p of permissions)
    groups.set(p.domain, [...(groups.get(p.domain) ?? []), p]);
  return [...groups];
}
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
