import { useCallback, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, EmptyState, LoadingState, Notice, Pager, Table } from "../../shared/ui";
import * as api from "./api";
import { ClassDot, Columns } from "./charts";
import { competency, money, percent, quantity, unitCost } from "./format";
import { AreaPage, CompetencySelect, useAbcData, useScope, type Scope } from "./scope";

const PAGE = 100;
const ALIASES: Record<string, string> = { LT: "L", UND: "UN" };
/** Mirrors abc_private.unit_key: the database treats LT/L and UND/UN as the same unit. */
const unitKey = (label: string) => {
  const k = label.trim().toUpperCase();
  return ALIASES[k] ?? k;
};

function ProductHistory({ scope, code }: { scope: Scope; code: string }) {
  const unitId = scope.unit!.unit_id;
  const load = useCallback(() => api.productHistory(unitId, scope.basis, code), [unitId, scope.basis, code]);
  const r = useAbcData(load);
  const h = r.data ?? [];
  const last = h.at(-1);
  return (
    <section className="abc-section" aria-labelledby="abc-product-history">
      <div className="abc-section-head">
        <h2 id="abc-product-history">{last ? last.name : "Produto"} <small className="muted">{code}</small></h2>
        <button type="button" onClick={() => scope.set({ produto: null })}>Fechar histórico</button>
      </div>
      {r.loading && <LoadingState label="Carregando histórico…" />}
      {r.error && <Notice error>{r.error} <button type="button" onClick={r.reload}>Tentar novamente</button></Notice>}
      {r.data && !h.length && <p className="muted">Este código não aparece em competências publicadas nesta modalidade.</p>}
      {h.length > 0 && (
        <>
          {new Set(h.map((p) => unitKey(p.unit))).size > 1 && (
            <Notice tone="warning">A unidade de medida mudou entre competências; compare custos médios com cautela.</Notice>
          )}
          <div className="abc-grid-2">
            <Columns caption="Custo total por competência"
              points={h.map((p) => ({ key: p.competency, label: competency(p.competency), value: p.total, display: money(p.total).replace(/,\d+$/, "") }))} />
            <Columns caption="Custo médio (total ÷ quantidade) por competência"
              points={h.map((p) => ({ key: p.competency, label: competency(p.competency), value: p.avg_cost ?? "0", display: unitCost(p.avg_cost) }))} />
          </div>
          <Table headers={["Competência", "UN", "Quantidade", "Custo unit. ERP", "Custo médio", "Custo total", "% do total", "Curva ERP", "Curva calculada", "Origem"]}>
            {h.map((p) => {
              return (
                <tr key={p.competency}>
                  <td>{competency(p.competency)}</td>
                  <td>{p.unit}</td>
                  <td className="numeric">{quantity(p.quantity)}</td>
                  <td className="numeric">{unitCost(p.unit_cost)}</td>
                  <td className="numeric">{unitCost(p.avg_cost)}</td>
                  <td className="numeric">{money(p.total)}</td>
                  <td className="numeric">{percent(p.share)}</td>
                  <td>{p.erp_class ?? "—"}</td>
                  <td><ClassDot cls={p.calculated_class} /> {p.calculated_class ?? "—"}</td>
                  <td><Link to={`/abc/revisions/${p.revision_id}`}>Revisão {p.revision_number}, linha {p.source_row}</Link></td>
                </tr>
              );
            })}
          </Table>
          <p className="muted">
            Variações e efeitos de preço e quantidade entre duas competências estão em{" "}
            <Link to={`/abc/compare${scope.query()}`}>Comparações</Link>.
          </p>
        </>
      )}
    </section>
  );
}

export function AbcProducts() {
  const scope = useScope();
  const unitId = scope.unit?.unit_id ?? null;
  const loadOverview = useCallback(() => api.overview(unitId!, scope.basis), [unitId, scope.basis]);
  const o = useAbcData(unitId ? loadOverview : null);
  const list = (o.data?.competencies ?? []).map((c) => c.competency);
  const selected = scope.params.get("competencia");
  const comp = selected && list.includes(selected) ? selected : list.at(-1) ?? "";
  const loadProducts = useCallback(() => api.competencyProducts(unitId!, scope.basis, comp), [unitId, scope.basis, comp]);
  const p = useAbcData(unitId && comp ? loadProducts : null);
  const [term, setTerm] = useState("");
  const [cls, setCls] = useState("");
  const [erp, setErp] = useState("");
  const [page, setPage] = useState(0);
  const ids = { term: useId(), cls: useId(), erp: useId() };
  const product = scope.params.get("produto");
  const lines = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (p.data?.lines ?? []).filter((l) => (!t || l.code.toLowerCase().includes(t) || l.name.toLowerCase().includes(t))
      && (!cls || (cls === "none" ? !l.calculated_class : l.calculated_class === cls))
      && (!erp || (erp === "none" ? !l.erp_class : l.erp_class === erp)));
  }, [p.data, term, cls, erp]);

  return (
    <AreaPage scope={scope} title="Produtos"
      description="Produtos importados por competência, com consumo, custos, participação e classes; selecione um produto para ver sua evolução."
      filters={list.length > 0 && (
        <CompetencySelect label="Competência" value={comp} options={list} onChange={(v) => { scope.set({ competencia: v }); setPage(0); }} />
      )}>
      {product && scope.unit && <ProductHistory scope={scope} code={product} />}
      {o.loading && <LoadingState label="Carregando competências…" />}
      {o.error && <Notice error>{o.error} <button type="button" onClick={o.reload}>Tentar novamente</button></Notice>}
      {o.data && !list.length && <EmptyState title="Nenhum relatório publicado">Não há competências publicadas nesta modalidade.</EmptyState>}
      {p.loading && <LoadingState label="Carregando produtos…" />}
      {p.error && <Notice error>{p.error} <button type="button" onClick={p.reload}>Tentar novamente</button></Notice>}
      {p.data && (
        <section className="abc-section">
          <h2>{competency(comp)} · revisão {p.data.revision.number}</h2>
          <div className="abc-filters inline">
            <label htmlFor={ids.term}>Buscar código ou descrição
              <input id={ids.term} type="search" value={term} onChange={(e) => { setTerm(e.target.value); setPage(0); }} />
            </label>
            <label htmlFor={ids.cls}>Classe calculada
              <select id={ids.cls} value={cls} onChange={(e) => { setCls(e.target.value); setPage(0); }}>
                <option value="">Todas</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="none">Sem classe</option>
              </select>
            </label>
            <label htmlFor={ids.erp}>Classe do ERP
              <select id={ids.erp} value={erp} onChange={(e) => { setErp(e.target.value); setPage(0); }}>
                <option value="">Todas</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="none">Sem classe</option>
              </select>
            </label>
          </div>
          <p className="muted" role="status">
            {lines.length} de {p.data.lines.length} produtos. Categoria comercial ainda não está disponível (aguarda aprovação do cadastro de categorias).
          </p>
          <Table headers={["#", "Código", "Produto", "UN", "Quantidade", "Custo unit. ERP", "Custo médio", "Custo total", "% do total", "% acumulado anterior", "Curva ERP", "Curva calculada"]}>
            {lines.slice(page * PAGE, (page + 1) * PAGE).map((l) => (
              <tr key={l.code} aria-current={l.code === product ? "true" : undefined}>
                <td className="numeric">{l.rank}</td>
                <td className="numeric">{l.code}</td>
                <td className="abc-name"><Link to={`/abc/products${scope.query({ competencia: comp, produto: l.code })}`}>{l.name}</Link></td>
                <td>{l.unit}</td>
                <td className="numeric">{quantity(l.quantity)}</td>
                <td className="numeric">{unitCost(l.unit_cost)}</td>
                <td className="numeric">{unitCost(l.avg_cost)}</td>
                <td className="numeric">{money(l.total)}</td>
                <td className="numeric">{percent(l.share)}</td>
                <td className="numeric">{percent(l.cumulative_share)}</td>
                <td>{l.erp_class ?? "—"}</td>
                <td>{l.calculated_class ? <Badge tone={l.calculated_class === l.erp_class ? "neutral" : "info"}><ClassDot cls={l.calculated_class} /> {l.calculated_class}</Badge> : "—"}</td>
              </tr>
            ))}
          </Table>
          <Pager page={page} count={lines.length} size={PAGE} onChange={setPage} />
        </section>
      )}
    </AreaPage>
  );
}
