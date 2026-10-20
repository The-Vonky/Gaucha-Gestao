import { Link, Route, Routes } from "react-router-dom";
import { EmptyState } from "../../shared/ui";
import { AbcImport } from "./AbcImport";
import { AbcRevision } from "./AbcRevision";
import { AbcUnit } from "./AbcUnit";
import { AbcUnits } from "./AbcUnits";
import "./abc.css";
export function AbcModule() {
  return (
    <Routes>
      <Route index element={<AbcUnits />} />
      <Route path="units/:unitId" element={<AbcUnit />} />
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
