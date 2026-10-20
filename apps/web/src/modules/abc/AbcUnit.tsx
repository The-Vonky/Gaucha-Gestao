import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { useResource } from "../../shared/useResource";
import { Icon } from "../../shared/icons";
import { EmptyState, LoadingState, Notice, PageTitle, Table } from "../../shared/ui";
import * as api from "./api";
import { BASIS_LABEL, competency, money } from "./format";
export function AbcUnit() {
  const { unitId = "" } = useParams();
  const load = useCallback(
    async () => {
      const [all, series] = await Promise.all([api.units(), api.unitSeries(unitId)]);
      return { unit: all.find((u) => u.unit_id === unitId) ?? null, series };
    },
    [unitId],
  );
  const r = useResource(load);
  const unit = r.data?.unit;
  return (
    <>
      <nav className="breadcrumb" aria-label="Você está em">
        <Link to="/abc">Curva ABC</Link>
        <Icon name="chevronRight" />
        <span aria-current="page">{unit?.name ?? "Unidade"}</span>
      </nav>
      <PageTitle
        eyebrow="Custos · Curva ABC"
        title={unit ? `${unit.name} (${unit.code})` : "Unidade"}
        description="Competências publicadas por modalidade de custo. Cada publicação preserva o arquivo original e o histórico de revisões."
      >
        {unit?.can_publish && (
          <Link className="button-link primary" to={`/abc/units/${unitId}/import`}>
            <Icon name="upload" />
            Importar relatório
          </Link>
        )}
      </PageTitle>
      {r.loading && <LoadingState label="Carregando competências…" />}
      {r.error && (
        <Notice error>
          {r.error}{" "}
          <button type="button" onClick={r.reload}>
            Tentar novamente
          </button>
        </Notice>
      )}
      {r.data && !unit && (
        <EmptyState title="Unidade indisponível">Esta unidade não existe ou não está no seu acesso.</EmptyState>
      )}
      {unit && r.data && !r.data.series.length && (
        <EmptyState title="Nenhum relatório publicado">
          {unit.can_publish
            ? "Importe o relatório “Curva ABC Geral (Realizado)” exportado do ERP para começar."
            : "Ainda não há relatórios publicados para esta unidade."}
        </EmptyState>
      )}
      {unit && r.data && r.data.series.length > 0 && (
        <Table headers={["Competência", "Modalidade", "Revisão", "Total geral", "Produtos", "Publicado em"]}>
          {r.data.series.map((s) => (
            <tr key={s.series_id}>
              <td>
                <Link to={`/abc/revisions/${s.revision_id}`}>{competency(s.competency)}</Link>
              </td>
              <td>{BASIS_LABEL[s.cost_basis]}</td>
              <td className="numeric">{s.revision_number}</td>
              <td className="numeric">{money(s.declared_total)}</td>
              <td className="numeric">{s.line_count}</td>
              <td>{new Date(s.published_at).toLocaleString("pt-BR")}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
