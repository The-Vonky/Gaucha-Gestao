import { useCallback } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../shared/icons";
import { EmptyState, LoadingState, Metric, Notice, Table } from "../../shared/ui";
import * as api from "./api";
import { BarList, ClassShareBar, Columns } from "./charts";
import { BASIS_LABEL, competency, money, percent, signedMoney, signedPercent } from "./format";
import { cmp } from "./import/decimal";
import { AreaPage, useAbcData, useScope } from "./scope";
import type { CompareItem } from "./types";

const TOP = 10;

/** Executive view of one unit: latest published competency, its classes and the change since the previous one. */
export function AbcOverview() {
  const scope = useScope();
  const unitId = scope.unit?.unit_id ?? null;
  const load = useCallback(async () => {
    const o = await api.overview(unitId!, scope.basis);
    const list = o.competencies;
    const latest = list.at(-1) ?? null;
    const previous = list.at(-2) ?? null;
    const [products, comparison] = await Promise.all([
      latest ? api.competencyProducts(unitId!, scope.basis, latest.competency) : null,
      latest && previous ? api.compare(unitId!, scope.basis, previous.competency, latest.competency) : null,
    ]);
    return { o, latest, previous, products, comparison };
  }, [unitId, scope.basis]);
  const r = useAbcData(unitId ? load : null);
  const d = r.data;
  const other = d?.o.bases.find((b) => b !== scope.basis);
  const changes = (sign: 1 | -1) =>
    (d?.comparison?.items ?? [])
      .filter((i): i is CompareItem & { total_delta: string } => i.total_delta !== null && cmp(i.total_delta, "0") === sign)
      .sort((a, b) => sign * cmp(b.total_delta, a.total_delta))
      .slice(0, 5);

  return (
    <AreaPage scope={scope} title="Visão geral"
      description="Consumo valorizado publicado da unidade: última competência, distribuição das classes e evolução."
      actions={scope.unit?.can_publish && (
        <Link className="button-link primary" to={`/abc/units/${scope.unit.unit_id}/import`}>
          <Icon name="upload" /> Importar relatório
        </Link>
      )}>
      {r.loading && <LoadingState label="Carregando indicadores…" />}
      {r.error && <Notice error>{r.error} <button type="button" onClick={r.reload}>Tentar novamente</button></Notice>}
      {d && !d.latest && (
        <EmptyState title="Nenhum relatório publicado nesta modalidade"
          actions={<>
            {other && (
              <button type="button" onClick={() => scope.set({ modalidade: other })}>Ver {BASIS_LABEL[other].toLowerCase()}</button>
            )}
            {scope.unit?.can_publish && (
              <Link className="button-link primary" to={`/abc/units/${scope.unit.unit_id}/import`}>Importar o primeiro relatório</Link>
            )}
          </>}>
          {scope.unit?.can_publish
            ? "Importe o relatório “Curva ABC Geral (Realizado)” exportado do ERP para começar. Os indicadores usam somente dados publicados."
            : "Ainda não há relatórios publicados para esta unidade e modalidade. Solicite a importação a quem publica relatórios."}
        </EmptyState>
      )}
      {d?.latest && (
        <>
          <section className="abc-metrics" aria-label="Indicadores da última competência">
            <Metric label="Competência" value={competency(d.latest.competency)} hint={`Revisão ${d.latest.revision_number}`} />
            <Metric label="Consumo valorizado" value={money(d.latest.calculated_total)}
              hint={d.comparison ? `${signedMoney(d.comparison.total_delta)} (${signedPercent(d.comparison.total_variation)}) vs ${competency(d.previous!.competency)}` : "Sem competência anterior"} />
            <Metric label="Produtos analisados" value={d.latest.line_count}
              hint={d.latest.unclassified ? `${d.latest.unclassified} sem classe (total zero)` : undefined} />
            <Metric label="Classe A" value={percent(d.latest.classes[0].share)}
              hint={`${d.latest.classes[0].count} produtos concentram esta parcela`} />
          </section>

          <div className="abc-grid-2">
            <section className="abc-section">
              <h2>Distribuição das classes</h2>
              <ClassShareBar classes={d.latest.classes} caption={`Participação financeira por classe calculada — ${competency(d.latest.competency)}`} />
              <p className="muted">Método <code>abc-70-90-inicio-v1</code>: classe pelo acumulado anterior ao item (A até 70%, B até 90%).</p>
            </section>
            <section className="abc-section">
              <h2>Evolução do consumo</h2>
              <Columns caption="Consumo valorizado por competência"
                points={d.o.competencies.map((c) => ({ key: c.competency, label: competency(c.competency), value: c.calculated_total, display: money(c.calculated_total).replace(/,\d+$/, "") }))} />
              <Table headers={["Competência", "Consumo valorizado", "Produtos", "Revisão"]}>
                {[...d.o.competencies].reverse().map((c) => (
                  <tr key={c.competency}>
                    <td><Link to={`/abc/revisions/${c.revision_id}`}>{competency(c.competency)}</Link></td>
                    <td className="numeric">{money(c.calculated_total)}</td>
                    <td className="numeric">{c.line_count}</td>
                    <td className="numeric">{c.revision_number}</td>
                  </tr>
                ))}
              </Table>
            </section>
          </div>

          <div className="abc-grid-2">
            <section className="abc-section">
              <h2>Produtos de maior impacto</h2>
              {d.products && (
                <BarList caption={`Os ${TOP} maiores custos totais de ${competency(d.latest.competency)}`}
                  rows={d.products.lines.slice(0, TOP).map((l) => ({
                    key: l.code, cls: l.calculated_class, value: l.total, display: money(l.total),
                    label: <Link to={`/abc/products${scope.query({ produto: l.code })}`}>{l.name}</Link>,
                    detail: `${l.code} · ${percent(l.share)}`,
                  }))} />
              )}
              <Link to={`/abc/products${scope.query()}`}>Ver todos os produtos</Link>
            </section>
            <section className="abc-section">
              <h2>Aumentos e reduções de custo</h2>
              {!d.comparison && <p className="muted">É preciso ao menos duas competências publicadas nesta modalidade.</p>}
              {d.comparison && (
                <>
                  <p className="muted">
                    {competency(d.previous!.competency)} → {competency(d.latest.competency)}: {d.comparison.summary.counts.up} com custo
                    médio maior, {d.comparison.summary.counts.down} menor, {d.comparison.summary.counts.new} novos,{" "}
                    {d.comparison.summary.counts.absent} ausentes.
                    {d.comparison.summary.counts.alerts > 0 && ` ${d.comparison.summary.counts.alerts} variações para conferir.`}
                  </p>
                  {(["aumentos", "reduções"] as const).map((kind) => {
                    const rows = changes(kind === "aumentos" ? 1 : -1);
                    return (
                      <div key={kind}>
                        <h3>Maiores {kind} no custo total</h3>
                        {rows.length ? (
                          <Table headers={["Produto", "Diferença", "Variação"]}>
                            {rows.map((i) => (
                              <tr key={i.code}>
                                <td className="abc-name"><Link to={`/abc/products${scope.query({ produto: i.code })}`}>{i.name}</Link><br /><small className="muted">{i.code}</small></td>
                                <td className="numeric">{signedMoney(i.total_delta)}</td>
                                <td className="numeric">{signedPercent(i.total_variation)}</td>
                              </tr>
                            ))}
                          </Table>
                        ) : <p className="muted">Nenhum.</p>}
                      </div>
                    );
                  })}
                  <Link to={`/abc/compare${scope.query({ base: d.previous!.competency, atual: d.latest.competency })}`}>Abrir a comparação completa</Link>
                </>
              )}
            </section>
          </div>

          <nav className="abc-shortcuts" aria-label="Atalhos">
            <Link to={`/abc/reports${scope.query()}`}><Icon name="file" /> Relatórios gerenciais</Link>
            <Link to={`/abc/categories${scope.query()}`}><Icon name="costs" /> Distribuição por classe</Link>
            <Link to={`/abc/imports${scope.query()}`}><Icon name="upload" /> Importações e revisões</Link>
          </nav>
        </>
      )}
    </AreaPage>
  );
}
