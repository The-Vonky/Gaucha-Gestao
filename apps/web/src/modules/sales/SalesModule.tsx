import { lazy, Suspense } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "../../core/auth/AuthProvider";
import { Loader } from "../../shared/brand";
import { EmptyState } from "../../shared/ui";
import { SalesPage } from "./SalesPage";

const SalesDashboardPage = lazy(() => import("./SalesDashboardPage").then(m => ({ default: m.SalesDashboardPage })));

function SalesEntry() {
  const auth = useAuth(), location = useLocation();
  const dashboard = !!auth.profile?.active && auth.grants.some(g => g.permission === "sales.dashboard.read" && g.scope_type !== "sector");
  // URLs operacionais antigas com query preservam integralmente filtros e estado.
  const path = location.search || !dashboard ? "/sales/entries" : "/sales/dashboard";
  return <Navigate replace to={path + location.search + location.hash} state={location.state} />;
}

export function SalesModule() {
  return <Routes>
    <Route index element={<SalesEntry />} />
    <Route path="dashboard" element={<Suspense fallback={<Loader label="Carregando dashboard…" />}><SalesDashboardPage /></Suspense>} />
    <Route path="entries" element={<SalesPage />} />
    <Route path="*" element={<EmptyState title="Página não encontrada" actions={<Link className="button-link" to="/sales">Voltar para Vendas / Maquininhas</Link>}>O endereço acessado não existe em Vendas / Maquininhas.</EmptyState>} />
  </Routes>;
}
