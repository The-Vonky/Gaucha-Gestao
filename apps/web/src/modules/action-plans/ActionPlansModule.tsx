import { Link, Route, Routes } from "react-router-dom";
import { PageTitle } from "../../shared/ui";
import { ActionPlanPage } from "./ActionPlanPage";
import { ActionPlansOverview } from "./ActionPlansOverview";
export function ActionPlansModule() {
  return (
    <Routes>
      <Route index element={<ActionPlansOverview />} />
      <Route path=":planId" element={<ActionPlanPage />} />
      <Route
        path="*"
        element={
          <>
            <PageTitle
              title="Página não encontrada"
              description="Qualidade · Planos de Ação"
            />
            <Link to="/action-plans">Voltar para Planos de Ação</Link>
          </>
        }
      />
    </Routes>
  );
}
