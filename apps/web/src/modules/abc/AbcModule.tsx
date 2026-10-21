import { Link, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { EmptyState } from "../../shared/ui";
import { AbcCategories } from "./AbcCategories";
import { AbcCompare } from "./AbcCompare";
import { AbcImport } from "./AbcImport";
import { AbcImports } from "./AbcImports";
import { AbcOverview } from "./AbcOverview";
import { AbcProducts } from "./AbcProducts";
import { AbcReports } from "./AbcReports";
import { AbcRevision } from "./AbcRevision";
import "./abc.css";
/** /abc keeps working as the module entry; the query (unit, basis) is preserved. */
function ToOverview() {
  const { search } = useLocation();
  return <Navigate replace to={`/abc/overview${search}`} />;
}
/** Former unit page (v1): its series list now lives in Importações. */
function ToImports() {
  const { unitId = "" } = useParams();
  return <Navigate replace to={`/abc/imports?unidade=${encodeURIComponent(unitId)}`} />;
}
export function AbcModule() {
  return (
    <Routes>
      <Route index element={<ToOverview />} />
      <Route path="overview" element={<AbcOverview />} />
      <Route path="imports" element={<AbcImports />} />
      <Route path="compare" element={<AbcCompare />} />
      <Route path="reports" element={<AbcReports />} />
      <Route path="products" element={<AbcProducts />} />
      <Route path="categories" element={<AbcCategories />} />
      <Route path="units/:unitId" element={<ToImports />} />
      <Route path="units/:unitId/import" element={<AbcImport />} />
      <Route path="revisions/:revisionId" element={<AbcRevision />} />
      <Route
        path="*"
        element={
          <EmptyState
            title="Página não encontrada"
            actions={
              <Link className="button-link" to="/abc">
                Voltar para Curva ABC
              </Link>
            }
          >
            O endereço acessado não existe em Curva ABC.
          </EmptyState>
        }
      />
    </Routes>
  );
}
