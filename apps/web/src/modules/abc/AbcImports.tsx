import { useCallback, useId, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../shared/icons";
import { Badge, EmptyState, LoadingState, Notice, Table } from "../../shared/ui";
import * as api from "./api";
import { competency, money } from "./format";
import { AreaPage, useAbcData, useScope } from "./scope";

/** Every publication of the unit: current and superseded revisions are kept, never deleted. */
export function AbcImports() {
  const scope = useScope();
  const unitId = scope.unit?.unit_id ?? null;
  const load = useCallback(() => api.unitRevisions(unitId!), [unitId]);
  const r = useAbcData(unitId ? load : null);
  const [state, setState] = useState<"all" | "current" | "superseded">("all");
  const stateId = useId();
  const rows = (r.data ?? []).filter((x) => x.cost_basis === scope.basis
    && (state === "all" || (state === "current") === x.current));
  return (
    <AreaPage scope={scope} title="Importações"
      description="Publicações por competência, com autor, motivo, avisos aceitos e o arquivo original. Substituir cria nova revisão; nada é apagado."
      actions={scope.unit?.can_publish && (
        <Link className="button-link primary" to={`/abc/units/${scope.unit.unit_id}/import`}>
          <Icon name="upload" /> Importar relatório
        </Link>
      )}
      filters={
        <label htmlFor={stateId}>
          Situação
          <select id={stateId} value={state} onChange={(e) => setState(e.target.value as typeof state)}>
            <option value="all">Todas</option>
            <option value="current">Vigentes</option>
            <option value="superseded">Substituídas</option>
          </select>
        </label>
      }>
      {!scope.unit?.can_publish && (
        <Notice>Seu acesso permite consultar. A importação é feita por quem tem permissão de publicar nesta unidade.</Notice>
      )}
      {r.loading && <LoadingState label="Carregando publicações…" />}
      {r.error && <Notice error>{r.error} <button type="button" onClick={r.reload}>Tentar novamente</button></Notice>}
      {r.data && !rows.length && (
        <EmptyState title="Nenhuma publicação encontrada">
          {r.data.length ? "Nenhuma revisão corresponde aos filtros." : "Ainda não há relatórios publicados para esta unidade."}
        </EmptyState>
      )}
      {rows.length > 0 && (
        <Table headers={["Competência", "Revisão", "Situação", "Publicado em", "Por", "Motivo", "Avisos", "Produtos", "Total geral", "Arquivo original"]}>
          {rows.map((x) => (
            <tr key={x.id}>
              <td><Link to={`/abc/revisions/${x.id}`}>{competency(x.competency)}</Link></td>
              <td className="numeric">{x.number}</td>
              <td>{x.current ? <Badge tone="success" icon="check">Vigente</Badge> : <Badge tone="neutral">Substituída</Badge>}</td>
              <td>{new Date(x.published_at).toLocaleString("pt-BR")}</td>
              <td>{x.published_by ?? "—"}</td>
              <td>{x.reason ?? "Primeira publicação"}</td>
              <td className="numeric">{x.warning_count ? <Badge tone="warning" icon="warning">{x.warning_count}</Badge> : "0"}</td>
              <td className="numeric">{x.line_count}</td>
              <td className="numeric">{money(x.declared_total)}</td>
              <td title={`SHA-256 ${x.sha256}`}>{x.original_name}</td>
            </tr>
          ))}
        </Table>
      )}
      <p className="muted">
        Para baixar o original ou conferir a publicação contra ele, abra a competência e use “Baixar original” ou
        “Conferir com o arquivo”.
      </p>
    </AreaPage>
  );
}
