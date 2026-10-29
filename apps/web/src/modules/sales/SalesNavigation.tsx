import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../core/auth/AuthProvider";

/** Áreas independentes; links não ampliam capacidades. Mantém o recorte de retorno. */
export function SalesNavigation() {
  const auth = useAuth(), location = useLocation();
  const dashboard = location.pathname === "/sales/dashboard";
  const params = new URLSearchParams(location.search);
  const has = (permission: string) => !!auth.profile?.active && auth.grants.some(g => g.permission === permission && g.scope_type !== "sector");
  const state = location.state as { salesReturn?: string } | null;
  let target = state?.salesReturn;
  const otherPath = dashboard ? "/sales" : "/sales/dashboard";
  if (!target || !target.startsWith(`${otherPath}?`)) {
    const next = new URLSearchParams();
    if (dashboard) {
      if (params.get("from")) next.set("from", `${params.get("from")}-01`);
      const to = params.get("to");
      if (to && /^\d{4}-\d{2}$/.test(to)) {
        const end = new Date(`${to}-01T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
        if (!isNaN(end.getTime())) next.set("to", end.toISOString().slice(0, 10));
      }
      if (params.get("scope") !== "combined") next.set("method", "Stone");
    } else {
      for (const key of ["from", "to"]) { const value = params.get(key); if (value) next.set(key, value.slice(0, 7)); }
      if (params.get("method") === "PIX") next.set("scope", "combined");
    }
    // Só transfere unidade para a outra área se a capacidade de destino a cobrir.
    const unit = params.get("unit");
    if (unit && auth.can(dashboard ? "sales.entry.read" : "sales.dashboard.read", { unit_id: unit })) next.set("unit", unit);
    target = `${otherPath}?${next}`;
  }
  return <nav className="sales-area-nav" aria-label="Vendas / Maquininhas">
    {["read", "create", "edit", "delete"].some(p => has(`sales.entry.${p}`)) && (dashboard
      ? <Link to={target} state={{ salesReturn: location.pathname + location.search }}>Lançamentos</Link> : <span aria-current="page">Lançamentos</span>)}
    {has("sales.dashboard.read") && (dashboard ? <span aria-current="page">Dashboard gerencial</span>
      : <Link to={target} state={{ salesReturn: location.pathname + location.search }}>Dashboard gerencial</Link>)}
  </nav>;
}
