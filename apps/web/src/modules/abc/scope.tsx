import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import { EmptyState, LoadingState, Notice, PageTitle } from "../../shared/ui";
import * as api from "./api";
import { BASIS_LABEL, competency } from "./format";
import type { CostBasis, UnitSummary } from "./types";

/** Like shared useResource, with the module's error messages (P0002, business rejections). */
export function useAbcData<T>(load: (() => Promise<T>) | null) {
  const [state, setState] = useState<{ data?: T; error: string; loading: boolean }>({ error: "", loading: !!load });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!load) {
      setState({ error: "", loading: false });
      return;
    }
    let current = true;
    setState({ error: "", loading: true });
    load()
      .then((data) => current && setState({ data, error: "", loading: false }))
      .catch((e) => current && setState({ error: api.abcMessage(e), loading: false }));
    return () => {
      current = false;
    };
  }, [load, revision]);
  return { ...state, reload: () => setRevision((x) => x + 1) };
}

const BASES: CostBasis[] = ["NET_PERIOD", "GROSS_PERIOD"];

// Per-tab convenience only (never authorization): storage can be blocked, so failures are ignored.
function readRemembered(key: string): string | null {
  try {
    return sessionStorage.getItem(`abc.scope.${key}`);
  } catch {
    return null;
  }
}
function remember(key: string, value: string) {
  try {
    sessionStorage.setItem(`abc.scope.${key}`, value);
  } catch {
    // Storage unavailable (private mode, blocked site data): the URL still carries the scope.
  }
}

/**
 * Unit and cost basis selected for the analytics areas, kept in the URL (?unidade=&modalidade=)
 * so links between areas preserve them. The list only contains units the database allows;
 * a guessed unit id in the URL is still refused by every RPC.
 */
export function useScope() {
  const [searchParams, setParams] = useSearchParams();
  // The sidebar links carry no query: fall back to the last scope this viewer chose in this tab.
  const params = useMemo(() => {
    if (searchParams.has("unidade")) return searchParams;
    const remembered = new URLSearchParams(searchParams);
    for (const key of ["unidade", "modalidade"]) {
      const value = readRemembered(key);
      if (value && !remembered.has(key)) remembered.set(key, value);
    }
    return remembered;
  }, [searchParams]);
  const loadUnits = useCallback(() => api.units(), []);
  const units = useAbcData(loadUnits);
  const requested = params.get("unidade");
  const fromUrl = searchParams.get("unidade");
  // Only an id typed in the URL is reported as unavailable; a stale remembered one falls back.
  const unit: UnitSummary | null =
    units.data?.find((u) => u.unit_id === requested) ?? (fromUrl ? null : units.data?.[0] ?? null);
  const basisParam = params.get("modalidade");
  const basis: CostBasis = BASES.includes(basisParam as CostBasis) ? (basisParam as CostBasis) : "NET_PERIOD";
  useEffect(() => {
    if (unit) remember("unidade", unit.unit_id);
    remember("modalidade", basis);
  }, [unit, basis]);
  const set = useCallback(
    (next: Record<string, string | null>) =>
      setParams(() => {
        const out = new URLSearchParams(params);
        for (const [k, v] of Object.entries(next)) if (v === null) out.delete(k); else out.set(k, v);
        return out;
      }, { replace: true }),
    [setParams, params],
  );
  const query = (extra: Record<string, string> = {}) => {
    const q = new URLSearchParams();
    if (unit) q.set("unidade", unit.unit_id);
    q.set("modalidade", basis);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return `?${q}`;
  };
  return { units, unit, unknownUnit: !!fromUrl && !!units.data && !unit, basis, params, set, query };
}
export type Scope = ReturnType<typeof useScope>;

const AREAS = [
  ["overview", "Visão geral"],
  ["imports", "Importações"],
  ["compare", "Comparações"],
  ["reports", "Relatórios"],
  ["products", "Produtos"],
  ["categories", "Categorias"],
] as const;

/** Area tabs inside the content: the sidebar holds the same links, but is a drawer on phones. */
function AreaTabs({ scope }: { scope: Scope }) {
  return (
    <nav className="abc-tabs" aria-label="Áreas da Curva ABC">
      {AREAS.map(([path, label]) => (
        <NavLink key={path} to={`/abc/${path}${scope.query()}`}>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function ScopeBar({ scope, children }: { scope: Scope; children?: ReactNode }) {
  const unitId = useId();
  const basisId = useId();
  return (
    <div className="abc-filters" role="group" aria-label="Filtros">
      <label htmlFor={unitId}>
        Unidade
        <select id={unitId} value={scope.unit?.unit_id ?? ""}
          onChange={(e) => scope.set({ unidade: e.target.value, competencia: null, base: null, atual: null, produto: null })}>
          {!scope.unit && <option value="">Selecione</option>}
          {scope.units.data?.map((u) => (
            <option key={u.unit_id} value={u.unit_id}>{u.name} ({u.code})</option>
          ))}
        </select>
      </label>
      <label htmlFor={basisId}>
        Modalidade de custo
        <select id={basisId} value={scope.basis}
          onChange={(e) => scope.set({ modalidade: e.target.value, competencia: null, base: null, atual: null })}>
          {BASES.map((b) => <option key={b} value={b}>{BASIS_LABEL[b]}</option>)}
        </select>
      </label>
      {children}
    </div>
  );
}

export function CompetencySelect({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id}>
      {label}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {[...options].reverse().map((c) => <option key={c} value={c}>{competency(c)}</option>)}
      </select>
    </label>
  );
}

/** Shared frame of the six areas: title, tabs, scope and the access states. */
export function AreaPage({ scope, title, description, actions, filters, children }: {
  scope: Scope; title: string; description: string; actions?: ReactNode; filters?: ReactNode; children: ReactNode;
}) {
  return (
    <>
      <PageTitle eyebrow="Custos · Curva ABC" title={title} description={description}>{actions}</PageTitle>
      <AreaTabs scope={scope} />
      {scope.units.loading && <LoadingState label="Carregando unidades…" />}
      {scope.units.error && (
        <Notice error>
          {scope.units.error}{" "}
          <button type="button" onClick={scope.units.reload}>Tentar novamente</button>
        </Notice>
      )}
      {scope.units.data && !scope.units.data.length && (
        <EmptyState title="Nenhuma unidade disponível">
          Seu acesso não inclui unidades com Curva ABC. Solicite o acesso à administração.
        </EmptyState>
      )}
      {scope.unknownUnit && (
        <EmptyState title="Unidade indisponível">Esta unidade não existe ou não está no seu acesso.</EmptyState>
      )}
      {scope.unit && (
        <>
          <ScopeBar scope={scope}>{filters}</ScopeBar>
          {children}
        </>
      )}
    </>
  );
}
