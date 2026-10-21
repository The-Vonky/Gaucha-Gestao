import { useCallback } from "react";
import { Link } from "react-router-dom";
import { EmptyState, LoadingState, Notice, Table } from "../../shared/ui";
import * as api from "./api";
import { ClassDot, ClassMatrix, ClassShareBar } from "./charts";
import { competency, money, percent } from "./format";
import { AreaPage, CompetencySelect, useAbcData, useScope } from "./scope";

/**
 * ABC classes (A/B/C by cumulative spend) per competency. Not to be confused with commercial
 * product categories (protein, groceries…), which need an approved catalogue (Decision D3).
 */
export function AbcCategories() {
  const scope = useScope();
  const unitId = scope.unit?.unit_id ?? null;
  const loadOverview = useCallback(() => api.overview(unitId!, scope.basis), [unitId, scope.basis]);
  const o = useAbcData(unitId ? loadOverview : null);
  const list = (o.data?.competencies ?? []).map((c) => c.competency);
  const selected = scope.params.get("competencia");
  const comp = selected && list.includes(selected) ? selected : list.at(-1) ?? "";
  const loadProducts = useCallback(() => api.competencyProducts(unitId!, scope.basis, comp), [unitId, scope.basis, comp]);
  const p = useAbcData(unitId && comp ? loadProducts : null);
  const summary = p.data?.summary;
  return (
    <AreaPage scope={scope} title="Categorias"
      description="Distribuição financeira entre as classes A, B e C da Curva ABC, por competência."
      filters={list.length > 0 && (
        <CompetencySelect label="Competência" value={comp} options={list} onChange={(v) => scope.set({ competencia: v })} />
      )}>
      <Notice>
        <strong>Classe ABC não é categoria de produto.</strong> A classe vem do peso no custo total (A até 70% do acumulado,
        B até 90%, C o restante). Categorias comerciais, como proteínas ou hortifrúti, dependem de um cadastro gerenciado
        ainda não aprovado; nenhum produto é classificado por palavra-chave ou prefixo.
      </Notice>
      {o.loading && <LoadingState label="Carregando competências…" />}
      {o.error && <Notice error>{o.error} <button type="button" onClick={o.reload}>Tentar novamente</button></Notice>}
      {o.data && !list.length && <EmptyState title="Nenhum relatório publicado">Não há competências publicadas nesta modalidade.</EmptyState>}
      {p.loading && <LoadingState label="Carregando classes…" />}
      {p.error && <Notice error>{p.error} <button type="button" onClick={p.reload}>Tentar novamente</button></Notice>}
      {summary && p.data && (
        <>
          <div className="abc-grid-2">
            <section className="abc-section">
              <h2>{competency(comp)}</h2>
              <ClassShareBar classes={summary.classes} caption="Participação financeira por classe calculada" />
              <Table headers={["Classe", "Produtos", "Custo total", "Participação"]}>
                {summary.classes.map((c) => (
                  <tr key={c.class}>
                    <td><ClassDot cls={c.class} /> <Link to={`/abc/products${scope.query({ competencia: comp })}`}>Classe {c.class}</Link></td>
                    <td className="numeric">{c.count}</td>
                    <td className="numeric">{money(c.total)}</td>
                    <td className="numeric">{percent(c.share)}</td>
                  </tr>
                ))}
                <tr>
                  <td>Sem classe (total zero)</td>
                  <td className="numeric">{summary.unclassified}</td>
                  <td className="numeric">{money("0")}</td>
                  <td className="numeric">—</td>
                </tr>
                <tr>
                  <th scope="row">Total</th>
                  <td className="numeric">{p.data.revision.line_count}</td>
                  <td className="numeric">{money(p.data.revision.calculated_total)}</td>
                  <td className="numeric">{percent("100")}</td>
                </tr>
              </Table>
            </section>
            <section className="abc-section">
              <h2>Classe do ERP × classe calculada</h2>
              <p className="muted">A classe do ERP é preservada como veio; a calculada usa a metodologia aprovada. A diagonal destacada concorda.</p>
              <ClassMatrix cells={summary.matrix} />
            </section>
          </div>
          <section className="abc-section">
            <h2>Classes ao longo das competências</h2>
            <Table headers={["Competência", "A: produtos", "A: participação", "B: produtos", "B: participação", "C: produtos", "C: participação", "Total"]}>
              {[...(o.data?.competencies ?? [])].reverse().map((c) => (
                <tr key={c.competency} aria-current={c.competency === comp ? "true" : undefined}>
                  <td>{competency(c.competency)}</td>
                  {c.classes.flatMap((k) => [
                    <td key={`${k.class}n`} className="numeric">{k.count}</td>,
                    <td key={`${k.class}s`} className="numeric">{percent(k.share)}</td>,
                  ])}
                  <td className="numeric">{money(c.calculated_total)}</td>
                </tr>
              ))}
            </Table>
          </section>
        </>
      )}
    </AreaPage>
  );
}
