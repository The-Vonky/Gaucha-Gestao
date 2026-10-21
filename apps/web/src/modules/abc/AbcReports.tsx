import { useCallback } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../shared/icons";
import { Badge, EmptyState, LoadingState, Notice, Table } from "../../shared/ui";
import * as api from "./api";
import { BarList, ClassDot, ClassMatrix, ClassShareBar, Columns } from "./charts";
import { BASIS_LABEL, competency, money, percent, quantity, signedMoney, signedPercent, unitCost } from "./format";
import { abs, cmp } from "./import/decimal";
import { AreaPage, CompetencySelect, useAbcData, useScope } from "./scope";
import type { CompareItem } from "./types";

const TOP = 20;

/** Management reports over published data only; printing uses the browser and the same access. */
export function AbcReports() {
  const scope = useScope();
  const unitId = scope.unit?.unit_id ?? null;
  const loadOverview = useCallback(() => api.overview(unitId!, scope.basis), [unitId, scope.basis]);
  const o = useAbcData(unitId ? loadOverview : null);
  const list = (o.data?.competencies ?? []).map((c) => c.competency);
  const pick = (key: string, allowed: string[]) => {
    const v = scope.params.get(key);
    return v && allowed.includes(v) ? v : allowed.at(-1) ?? "";
  };
  const current = pick("atual", list);
  // Only earlier competencies are offered as the comparison base; a URL value outside them is ignored.
  const base = pick("base", list.filter((c) => c < current));
  const load = useCallback(async () => {
    const [products, comparison] = await Promise.all([
      api.competencyProducts(unitId!, scope.basis, current),
      base && base !== current ? api.compare(unitId!, scope.basis, base, current) : null,
    ]);
    return { products, comparison };
  }, [unitId, scope.basis, base, current]);
  const r = useAbcData(unitId && current ? load : null);
  const d = r.data;
  const comparable = (d?.comparison?.items ?? []).filter((i): i is CompareItem & { unit_variation: string } => i.unit_variation !== null);
  const increases = comparable.filter((i) => cmp(i.unit_variation, "0") > 0 && !i.alert)
    .sort((a, b) => cmp(b.unit_variation, a.unit_variation)).slice(0, TOP);
  const impacts = comparable.filter((i) => !i.alert).sort((a, b) => cmp(abs(b.price_effect!), abs(a.price_effect!))).slice(0, TOP);
  const alerts = (d?.comparison?.items ?? []).filter((i) => i.alert);
  const byAvg = [...(d?.products.lines ?? [])].filter((l) => l.avg_cost !== null)
    .sort((a, b) => cmp(b.avg_cost!, a.avg_cost!)).slice(0, TOP);

  return (
    <AreaPage scope={scope} title="Relatórios"
      description="Relatórios gerenciais sobre revisões publicadas: distribuição, principais produtos, evolução, variações e impactos."
      actions={d && (
        <button type="button" onClick={() => window.print()}><Icon name="download" /> Imprimir ou salvar em PDF</button>
      )}
      filters={list.length > 0 && (
        <>
          <CompetencySelect label="Competência" value={current} options={list} onChange={(v) => scope.set({ atual: v, base: null })} />
          {list.filter((c) => c < current).length > 0 && (
            <CompetencySelect label="Comparar com" value={base} options={list.filter((c) => c < current)} onChange={(v) => scope.set({ base: v })} />
          )}
        </>
      )}>
      {o.loading && <LoadingState label="Carregando competências…" />}
      {o.error && <Notice error>{o.error} <button type="button" onClick={o.reload}>Tentar novamente</button></Notice>}
      {o.data && !list.length && <EmptyState title="Nenhum relatório publicado">Não há competências publicadas nesta modalidade.</EmptyState>}
      {r.loading && <LoadingState label="Montando relatórios…" />}
      {r.error && <Notice error>{r.error} <button type="button" onClick={r.reload}>Tentar novamente</button></Notice>}
      {d && (
        <div className="abc-report">
          <p className="abc-print-only">
            {scope.unit?.name} ({scope.unit?.code}) · {BASIS_LABEL[scope.basis]} · {competency(current)}
            {base && ` comparada a ${competency(base)}`} · revisão {d.products.revision.number} · emitido em {new Date().toLocaleString("pt-BR")}
          </p>
          <div className="abc-grid-2">
            <section className="abc-section">
              <h2>1. Distribuição financeira da Curva ABC</h2>
              <ClassShareBar classes={d.products.summary.classes} caption={`${competency(current)} · total ${money(d.products.revision.calculated_total)}`} />
            </section>
            <section className="abc-section">
              <h2>2. Classe do ERP × classe calculada</h2>
              <ClassMatrix cells={d.products.summary.matrix} />
            </section>
          </div>

          <div className="abc-grid-2">
            <section className="abc-section">
              <h2>3. Principais produtos por custo total</h2>
              <BarList caption={`Os ${TOP} maiores custos totais`} rows={d.products.lines.slice(0, TOP).map((l) => ({
                key: l.code, cls: l.calculated_class, value: l.total, display: money(l.total),
                label: <Link to={`/abc/products${scope.query({ competencia: current, produto: l.code })}`}>{l.name}</Link>,
                detail: `${l.code} · ${percent(l.share)} · acumulado anterior ${percent(l.cumulative_share)}`,
              }))} />
            </section>
            <section className="abc-section">
              <h2>4. Maiores custos médios</h2>
              <p className="muted">Custo total ÷ quantidade, na unidade de medida de cada produto: não compare valores de unidades diferentes.</p>
              <Table headers={["Produto", "UN", "Custo médio", "Custo total"]}>
                {byAvg.map((l) => (
                  <tr key={l.code}>
                    <td className="abc-name">{l.name}<br /><small className="muted">{l.code}</small></td>
                    <td>{l.unit}</td>
                    <td className="numeric">{unitCost(l.avg_cost)}</td>
                    <td className="numeric">{money(l.total)}</td>
                  </tr>
                ))}
              </Table>
            </section>
          </div>

          <div className="abc-grid-2">
            <section className="abc-section">
              <h2>5. Gasto por unidade de medida</h2>
              <Table headers={["Unidade", "Produtos", "Quantidade", "Custo total", "Participação"]}>
                {d.products.summary.units.map((u) => (
                  <tr key={u.unit}>
                    <td>{u.unit}</td>
                    <td className="numeric">{u.count}</td>
                    <td className="numeric">{quantity(u.quantity)}</td>
                    <td className="numeric">{money(u.total)}</td>
                    <td className="numeric">{percent(u.share)}</td>
                  </tr>
                ))}
              </Table>
            </section>
            <section className="abc-section">
              <h2>6. Evolução dos custos</h2>
              <Columns caption="Consumo valorizado por competência" points={(o.data?.competencies ?? []).map((c) => ({
                key: c.competency, label: competency(c.competency), value: c.calculated_total, display: money(c.calculated_total).replace(/,\d+$/, ""),
              }))} />
              <Table headers={["Competência", "Total", "A", "B", "C"]}>
                {[...(o.data?.competencies ?? [])].reverse().map((c) => (
                  <tr key={c.competency}>
                    <td>{competency(c.competency)}</td>
                    <td className="numeric">{money(c.calculated_total)}</td>
                    {c.classes.map((k) => <td key={k.class} className="numeric">{percent(k.share)}</td>)}
                  </tr>
                ))}
              </Table>
            </section>
          </div>

          {!d.comparison && (
            <Notice>Relatórios de variação e impacto exigem uma competência anterior publicada nesta modalidade.</Notice>
          )}
          {d.comparison && (
            <>
              <section className="abc-section">
                <h2>7. Comparação entre {competency(base)} e {competency(current)}</h2>
                <Table headers={["Indicador", "Valor"]}>
                  <tr><td>Total {competency(base)}</td><td className="numeric">{money(d.comparison.base.total)}</td></tr>
                  <tr><td>Total {competency(current)}</td><td className="numeric">{money(d.comparison.current.total)}</td></tr>
                  <tr><td>Diferença</td><td className="numeric">{signedMoney(d.comparison.total_delta)} ({signedPercent(d.comparison.total_variation)})</td></tr>
                  <tr><td>Efeito de preço</td><td className="numeric">{signedMoney(d.comparison.summary.bridge.price_effect)}</td></tr>
                  <tr><td>Efeito de quantidade</td><td className="numeric">{signedMoney(d.comparison.summary.bridge.quantity_effect)}</td></tr>
                  <tr><td>Produtos novos / ausentes</td><td className="numeric">{signedMoney(d.comparison.summary.bridge.new)} / {signedMoney(d.comparison.summary.bridge.absent)}</td></tr>
                  <tr><td>Não comparáveis</td><td className="numeric">{signedMoney(d.comparison.summary.bridge.not_comparable)}</td></tr>
                  <tr><td>Índice da carteira comum ({d.comparison.summary.common_basket.items} produtos)</td><td className="numeric">{signedPercent(d.comparison.summary.common_basket.index)}</td></tr>
                </Table>
              </section>
              <div className="abc-grid-2">
                <section className="abc-section">
                  <h2>8. Variações de preço (custo médio)</h2>
                  <Table headers={["Produto", "Base", "Atual", "Variação"]}>
                    {increases.map((i) => (
                      <tr key={i.code}>
                        <td className="abc-name">{i.name}<br /><small className="muted">{i.code}</small></td>
                        <td className="numeric">{unitCost(i.base!.avg_cost)}</td>
                        <td className="numeric">{unitCost(i.current!.avg_cost)}</td>
                        <td className="numeric">{signedPercent(i.unit_variation)}</td>
                      </tr>
                    ))}
                  </Table>
                </section>
                <section className="abc-section">
                  <h2>9. Impactos financeiros de preço</h2>
                  <Table headers={["Produto", "Classe na base", "Efeito de preço", "Diferença no total"]}>
                    {impacts.map((i) => (
                      <tr key={i.code}>
                        <td className="abc-name">{i.name}<br /><small className="muted">{i.code}</small></td>
                        <td><ClassDot cls={i.base!.calculated_class} /> {i.base!.calculated_class ?? "—"}</td>
                        <td className="numeric">{signedMoney(i.price_effect)}</td>
                        <td className="numeric">{signedMoney(i.total_delta)}</td>
                      </tr>
                    ))}
                  </Table>
                </section>
              </div>
              <section className="abc-section">
                <h2>10. Variações para conferir</h2>
                <p className="muted">Custo médio com aumento ≥ 300% ou queda ≥ 75%. Indicam conferência no ERP; não são excluídas dos totais.</p>
                {alerts.length ? (
                  <Table headers={["Produto", "Base", "Atual", "Variação", "Situação"]}>
                    {alerts.map((i) => (
                      <tr key={i.code}>
                        <td className="abc-name">{i.name}<br /><small className="muted">{i.code}</small></td>
                        <td className="numeric">{unitCost(i.base?.avg_cost ?? null)}</td>
                        <td className="numeric">{unitCost(i.current?.avg_cost ?? null)}</td>
                        <td className="numeric">{signedPercent(i.unit_variation)}</td>
                        <td><Badge tone="danger" icon="warning">Conferir</Badge></td>
                      </tr>
                    ))}
                  </Table>
                ) : <p className="muted">Nenhuma variação fora dos limites.</p>}
              </section>
            </>
          )}
          <p className="muted">
            Dados das revisões vigentes publicadas. A exportação em planilha aguarda decisão de governança; a impressão usa o
            navegador e mostra apenas o que esta tela já exibe.
          </p>
        </div>
      )}
    </AreaPage>
  );
}
