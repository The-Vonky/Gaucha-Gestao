import { Link } from "react-router-dom";
import { useResource } from "../../shared/useResource";
import { EmptyState, LoadingState, Notice, PageTitle, Table } from "../../shared/ui";
import * as api from "./api";
import { competency } from "./format";
export function AbcUnits() {
  const r = useResource(api.units);
  return (
    <>
      <PageTitle
        eyebrow="Custos"
        title="Curva ABC"
        description="Relatórios de consumo valorizado por unidade e competência, importados do ERP."
      />
      {r.loading && <LoadingState label="Carregando unidades…" />}
      {r.error && (
        <Notice error>
          {r.error}{" "}
          <button type="button" onClick={r.reload}>
            Tentar novamente
          </button>
        </Notice>
      )}
      {r.data && !r.data.length && (
        <EmptyState title="Nenhuma unidade disponível">
          Seu acesso não inclui unidades com Curva ABC. Solicite o acesso à administração.
        </EmptyState>
      )}
      {r.data && r.data.length > 0 && (
        <Table headers={["Unidade", "Código", "Competências publicadas", "Última competência"]}>
          {r.data.map((u) => (
            <tr key={u.unit_id}>
              <td>
                <Link to={`/abc/units/${u.unit_id}`}>{u.name}</Link>
              </td>
              <td className="numeric">{u.code}</td>
              <td className="numeric">{u.series_count}</td>
              <td>{u.last_competency ? competency(u.last_competency) : "Sem relatório"}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
