import { Link, Route, Routes } from "react-router-dom";
import { PageTitle } from "../../shared/ui";
import { AuditOverview } from "./AuditOverview";
import { InspectionPage } from "./InspectionPage";
import { UnitHistory } from "./UnitHistory";
export function AuditModule() {
  return (
    <Routes>
      <Route index element={<AuditOverview />} />
      <Route path="units/:unitId" element={<UnitHistory />} />
      <Route path="inspections/:inspectionId" element={<InspectionPage />} />
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
