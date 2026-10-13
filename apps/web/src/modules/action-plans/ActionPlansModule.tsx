import { Link, Route, Routes } from "react-router-dom";
import { EmptyState } from "../../shared/ui";
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
          <EmptyState
            title="Página não encontrada"
            actions={
              <Link className="button-link" to="/action-plans">
                Voltar para Planos de Ação
              </Link>
            }
          >
            O endereço acessado não existe em Planos de Ação.
          </EmptyState>
        }
      />
    </Routes>
  );
}
