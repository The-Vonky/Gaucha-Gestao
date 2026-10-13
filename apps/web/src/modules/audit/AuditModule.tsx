import { Link, Route, Routes } from "react-router-dom";
import { EmptyState } from "../../shared/ui";
import { AuditOverview } from "./AuditOverview";
import { InspectionPage } from "./InspectionPage";
import { UnitPage } from "./UnitPage";
export function AuditModule() {
  return (
    <Routes>
      <Route index element={<AuditOverview />} />
      <Route path="units/:unitId/*" element={<UnitPage />} />
      <Route path="inspections/:inspectionId/*" element={<InspectionPage />} />
      <Route
        path="*"
        element={
          <EmptyState
            title="Página não encontrada"
            actions={
              <Link className="button-link" to="/audit">
                Voltar para Auditorias
              </Link>
            }
          >
            O endereço acessado não existe em Auditorias.
          </EmptyState>
        }
      />
    </Routes>
  );
}
