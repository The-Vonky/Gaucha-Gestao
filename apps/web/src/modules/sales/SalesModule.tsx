import { lazy, Suspense } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "../../core/auth/AuthProvider";
import { Loader } from "../../shared/brand";
import { EmptyState } from "../../shared/ui";
import { SalesPage } from "./SalesPage";
import { validDate } from "./format";

const SalesDashboardPage = lazy(() => import("./SalesDashboardPage").then(m => ({ default: m.SalesDashboardPage })));

function SalesEntry() {
  const auth = useAuth(), location = useLocation();
  const dashboard = !!auth.profile?.active && auth.grants.some(g => g.permission === "sales.dashboard.read" && g.scope_type !== "sector");
  const operation = !!auth.profile?.active && auth.grants.some(g => ["read", "create", "edit", "delete"].some(p => g.permission === `sales.entry.${p}`) && g.scope_type !== "sector");
  // URLs operacionais antigas com query preservam integralmente filtros e estado.
  if (operation && location.search || !dashboard)
    return <Navigate replace to={"/sales/entries" + location.search + location.hash} state={location.state} />;
  // Um bookmark operacional não direciona o gerente a uma área proibida.
  const params = new URLSearchParams(location.search);
  for (const key of ["from", "to"]) {
    const value = params.get(key);
    if (value && validDate(value)) params.set(key, value.slice(0, 7));
  }
  if (params.has("method")) {
    params.set("scope", params.get("method") === "Stone" ? "stone" : "combined");
    params.delete("method");
  }
  params.delete("page");
  const unit = params.get("unit");
  if (unit && !auth.can("sales.dashboard.read", { unit_id: unit })) params.delete("unit");
  const query = params.toString();
  return <Navigate replace to={`/sales/dashboard${query ? `?${query}` : ""}${location.hash}`} state={location.state} />;
}

export function SalesModule() {
  return <Routes>
    <Route index element={<SalesEntry />} />
    <Route path="dashboard" element={<Suspense fallback={<Loader label="Carregando dashboard…" />}><SalesDashboardPage /></Suspense>} />
    <Route path="entries" element={<SalesPage />} />
    <Route path="*" element={<EmptyState title="Página não encontrada" actions={<Link className="button-link" to="/sales">Voltar para Vendas / Maquininhas</Link>}>O endereço acessado não existe em Vendas / Maquininhas.</EmptyState>} />
  </Routes>;
}
