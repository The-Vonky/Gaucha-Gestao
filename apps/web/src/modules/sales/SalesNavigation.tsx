import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../core/auth/AuthProvider";
import { readSelection, selectionError } from "./dashboard";
import { validDate } from "./format";

/** Atalho contextual; inclusive o recorte de retorno revalida a unidade de destino. */
export function SalesNavigation() {
  const auth = useAuth(), location = useLocation();
  const dashboard = location.pathname === "/sales/dashboard";
  const permissions = dashboard ? ["read", "create", "edit", "delete"].map(p => `sales.entry.${p}`) : ["sales.dashboard.read"];
  const allowed = !!auth.profile?.active && permissions.some(p => auth.grants.some(g => g.permission === p && g.scope_type !== "sector"));
  if (!allowed) return null;
  const params = new URLSearchParams(location.search);
  const otherPath = dashboard ? "/sales/entries" : "/sales/dashboard";
  const state = location.state as { salesReturn?: unknown } | null;
  const saved = typeof state?.salesReturn === "string" ? state.salesReturn : "";
  // Lista fechada de caminhos internos: não aceita prefixos ou URLs externas.
  const savedPath = saved.split("?")[0];
  const restore = savedPath === otherPath || (dashboard && savedPath === "/sales");
  const next = restore ? new URLSearchParams(saved.split("?")[1]) : new URLSearchParams();
  if (!restore) {
    if (dashboard) {
      const selection = readSelection(params);
      if (!selectionError(selection)) {
        next.set("from", `${selection.from}-01`);
        const [year, month] = selection.to.split("-").map(Number);
        const end = new Date(0); end.setUTCFullYear(year, month, 0);
        next.set("to", end.toISOString().slice(0, 10));
        if (selection.scope === "stone") next.set("method", "Stone");
      }
    } else {
      for (const key of ["from", "to"]) {
        const value = params.get(key);
        if (value && validDate(value)) next.set(key, value.slice(0, 7));
      }
      if (params.get("method") === "PIX" || !params.get("method")) next.set("scope", "combined");
    }
    const unit = params.get("unit");
    if (unit) next.set("unit", unit);
  }
  const unit = next.get("unit");
  if (unit && !auth.can(dashboard ? "sales.entry.read" : "sales.dashboard.read", { unit_id: unit })) next.delete("unit");
  const query = next.toString();
  return <Link className={`button-link${dashboard ? " primary" : ""}`} to={`${otherPath}${query ? `?${query}` : ""}`}
    state={{ salesReturn: location.pathname + location.search }}>{dashboard ? "Ir para lançamentos" : "Voltar ao dashboard"}</Link>;
}
