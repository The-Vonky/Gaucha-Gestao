import { Link, Route, Routes } from "react-router-dom";
import { PageTitle } from "../../shared/ui";
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
          <>
            <PageTitle
              title="Página não encontrada"
              description="Qualidade · Auditorias"
            />
            <Link to="/audit">Voltar para Auditorias</Link>
          </>
        }
      />
    </Routes>
  );
}
