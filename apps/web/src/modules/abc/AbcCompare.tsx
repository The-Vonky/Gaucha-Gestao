import { useCallback, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, EmptyState, LoadingState, Metric, Notice, Pager, Table, type BadgeTone } from "../../shared/ui";
import * as api from "./api";
import { ClassDot, Diverging } from "./charts";
import { competency, money, quantity, signedMoney, signedPercent, unitCost } from "./format";
import { abs, cmp } from "./import/decimal";
import { AreaPage, CompetencySelect, useAbcData, useScope } from "./scope";
import type { CompareItem, CompareStatus } from "./types";

export const STATUS: Record<CompareStatus, [label: string, tone: BadgeTone]> = {
  up: ["Custo médio maior", "warning"],
  down: ["Custo médio menor", "success"],
  unchanged: ["Sem alteração", "neutral"],
  new: ["Novo no recorte", "info"],
  absent: ["Ausente no recorte", "neutral"],
  not_comparable: ["Não comparável", "neutral"],
};
const PAGE = 50;
const byDesc = (f: (i: CompareItem) => string | null) => (a: CompareItem, b: CompareItem) => cmp(f(b) ?? "0", f(a) ?? "0");

export function AbcCompare() {
  const scope = useScope();
  const unitId = scope.unit?.unit_id ?? null;
  const loadOverview = useCallback(() => api.overview(unitId!, scope.basis), [unitId, scope.basis]);
  const o = useAbcData(unitId ? loadOverview : null);
  const list = (o.data?.competencies ?? []).map((c) => c.competency);
  const base = scope.params.get("base") && list.includes(scope.params.get("base")!) ? scope.params.get("base")! : list.at(-2) ?? "";
  const current = scope.params.get("atual") && list.includes(scope.params.get("atual")!) ? scope.params.get("atual")! : list.at(-1) ?? "";
  const loadCompare = useCallback(() => api.compare(unitId!, scope.basis, base, current), [unitId, scope.basis, base, current]);
  const c = useAbcData(unitId && base && current && base !== current ? loadCompare : null);
  const [status, setStatus] = useState<"" | CompareStatus>("");
  const [baseClass, setBaseClass] = useState("");
  const [term, setTerm] = useState("");
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [page, setPage] = useState(0);
  const ids = { status: useId(), cls: useId(), term: useId() };

  const items = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (c.data?.items ?? []).filter((i) =>
      (!status || i.status === status)
      && (!baseClass || (baseClass === "none" ? !i.base?.calculated_class : i.base?.calculated_class === baseClass))
      && (!alertsOnly || i.alert)
      && (!t || i.code.toLowerCase().includes(t) || i.name.toLowerCase().includes(t)));
  }, [c.data, status, baseClass, alertsOnly, term]);
  const comparable = (c.data?.items ?? []).filter((i) => i.unit_variation !== null);
  const rankings = c.data && [
    ["Maiores aumentos do custo médio", [...comparable].filter((i) => cmp(i.unit_variation!, "0") > 0).sort(byDesc((i) => i.unit_variation)), (i: CompareItem) => signedPercent(i.unit_variation)],
    ["Maiores reduções do custo médio", [...comparable].filter((i) => cmp(i.unit_variation!, "0") < 0).sort((a, b) => cmp(a.unit_variation!, b.unit_variation!)), (i: CompareItem) => signedPercent(i.unit_variation)],
    ["Maiores impactos de preço", [...comparable].sort(byDesc((i) => abs(i.price_effect ?? "0"))), (i: CompareItem) => signedMoney(i.price_effect)],
  ] as const;
  const s = c.data?.summary;

  return (
    <AreaPage scope={scope} title="Comparações"
      description="Duas competências da mesma unidade e modalidade, produto a produto pelo código do ERP."
      filters={list.length >= 2 && (
        <>
          <CompetencySelect label="Competência base" value={base} options={list} onChange={(v) => { scope.set({ base: v }); setPage(0); }} />
          <CompetencySelect label="Competência atual" value={current} options={list} onChange={(v) => { scope.set({ atual: v }); setPage(0); }} />
        </>
      )}>
      {o.loading && <LoadingState label="Carregando competências…" />}
      {o.error && <Notice error>{o.error} <button type="button" onClick={o.reload}>Tentar novamente</button></Notice>}
      {o.data && list.length < 2 && (
        <EmptyState title="Comparação indisponível">
          É preciso ao menos duas competências publicadas nesta unidade e modalidade. Publicadas: {list.length}.
        </EmptyState>
      )}
      {base && current && base === current && <Notice tone="warning">Escolha duas competências diferentes.</Notice>}
      {c.loading && <LoadingState label="Comparando…" />}
      {c.error && <Notice error>{c.error} <button type="button" onClick={c.reload}>Tentar novamente</button></Notice>}
      {c.data && s && (
        <>
          <section className="abc-metrics" aria-label="Resumo da comparação">
            <Metric label={`Total ${competency(base)}`} value={money(c.data.base.total)} hint={`${s.counts.base} produtos`} />
            <Metric label={`Total ${competency(current)}`} value={money(c.data.current.total)} hint={`${s.counts.current} produtos`} />
            <Metric label="Diferença no total" value={signedMoney(c.data.total_delta)} hint={signedPercent(c.data.total_variation)}
              tone={cmp(c.data.total_delta, "0") > 0 ? "warning" : cmp(c.data.total_delta, "0") < 0 ? "success" : undefined} />
            <Metric label="Índice da carteira comum" value={signedPercent(s.common_basket.index)}
              hint={`Custo médio de ${s.common_basket.items} produtos comparáveis, pesado pela quantidade atual`} />
          </section>
          <ul className="abc-chips" aria-label="Produtos por situação">
            {(Object.keys(STATUS) as CompareStatus[]).map((k) => (
              <li key={k}><Badge tone={STATUS[k][1]}>{STATUS[k][0]}: {s.counts[k]}</Badge></li>
            ))}
            {s.counts.alerts > 0 && <li><Badge tone="danger" icon="warning">Para conferir: {s.counts.alerts}</Badge></li>}
          </ul>

          <div className="abc-grid-2">
            <section className="abc-section">
              <h2>De onde vem a diferença</h2>
              <Diverging caption={`Decomposição de ${signedMoney(c.data.total_delta)} no total`}
                rows={[
                  ["price", "Efeito de preço", s.bridge.price_effect],
                  ["quantity", "Efeito de quantidade", s.bridge.quantity_effect],
                  ["new", "Produtos novos", s.bridge.new],
                  ["absent", "Produtos ausentes", s.bridge.absent],
                  ["nc", "Não comparáveis", s.bridge.not_comparable],
                ].map(([key, label, value]) => ({ key, label, value, display: signedMoney(value) }))} />
              <p className="muted">
                Preço: (custo médio atual − base) × quantidade atual. Quantidade: custo médio base × variação da quantidade.
                Resíduo numérico: {money(s.bridge.residual)}.
              </p>
            </section>
            <section className="abc-section">
              <h2>Impacto por classe da base</h2>
              <Table headers={["Classe na base", "Produtos", "Base", "Atual", "Diferença"]}>
                {s.by_base_class.map((g) => (
                  <tr key={g.class}>
                    <td>{g.class === "NEW" ? "Novos (sem base)" : g.class === "NONE" ? "Sem classe (total zero)" : <><ClassDot cls={g.class as "A"} /> Classe {g.class}</>}</td>
                    <td className="numeric">{g.count}</td>
                    <td className="numeric">{money(g.base_total)}</td>
                    <td className="numeric">{money(g.current_total)}</td>
                    <td className="numeric">{signedMoney(g.delta)}</td>
                  </tr>
                ))}
              </Table>
            </section>
          </div>

          <div className="abc-grid-3">
            {rankings!.map(([title, rows, value]) => (
              <section className="abc-section" key={title}>
                <h2>{title}</h2>
                {rows.length ? (
                  <ol className="abc-ranking">
                    {rows.slice(0, 10).map((i) => (
                      <li key={i.code}>
                        <Link to={`/abc/products${scope.query({ produto: i.code })}`}>{i.name}</Link>
                        <span className="numeric">{value(i)}</span>
                        {i.alert && <Badge tone="danger" icon="warning">Conferir</Badge>}
                      </li>
                    ))}
                  </ol>
                ) : <p className="muted">Nenhum produto.</p>}
              </section>
            ))}
          </div>

          <section className="abc-section">
            <h2>Produtos</h2>
            <div className="abc-filters inline">
              <label htmlFor={ids.term}>Buscar código ou produto<input id={ids.term} type="search" value={term} onChange={(e) => { setTerm(e.target.value); setPage(0); }} /></label>
              <label htmlFor={ids.status}>Situação
                <select id={ids.status} value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(0); }}>
                  <option value="">Todas</option>
                  {(Object.keys(STATUS) as CompareStatus[]).map((k) => <option key={k} value={k}>{STATUS[k][0]}</option>)}
                </select>
              </label>
              <label htmlFor={ids.cls}>Classe na base
                <select id={ids.cls} value={baseClass} onChange={(e) => { setBaseClass(e.target.value); setPage(0); }}>
                  <option value="">Todas</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>
                  <option value="none">Sem classe / novos</option>
                </select>
              </label>
              <label className="check"><input type="checkbox" checked={alertsOnly} onChange={(e) => { setAlertsOnly(e.target.checked); setPage(0); }} /><span>Somente para conferir</span></label>
            </div>
            <p className="muted" role="status">{items.length} de {c.data.items.length} produtos. Ordenados pelo maior impacto absoluto no total.</p>
            <Table headers={["Produto", "Situação", "Custo médio base", "Custo médio atual", "Variação", "Qtd. base", "Qtd. atual", "Total base", "Total atual", "Diferença"]}>
              {items.slice(page * PAGE, (page + 1) * PAGE).map((i) => (
                <tr key={i.code}>
                  <td className="abc-name"><Link to={`/abc/products${scope.query({ produto: i.code })}`}>{i.name}</Link><br /><small className="muted">{i.code} · {i.current?.unit ?? i.base?.unit}</small></td>
                  <td><Badge tone={STATUS[i.status][1]}>{STATUS[i.status][0]}</Badge>{i.alert && <> <Badge tone="danger" icon="warning">Conferir</Badge></>}</td>
                  <td className="numeric">{unitCost(i.base?.avg_cost ?? null)}</td>
                  <td className="numeric">{unitCost(i.current?.avg_cost ?? null)}</td>
                  <td className="numeric">{signedPercent(i.unit_variation)}</td>
                  <td className="numeric">{i.base ? quantity(i.base.quantity) : "—"}</td>
                  <td className="numeric">{i.current ? quantity(i.current.quantity) : "—"}</td>
                  <td className="numeric">{i.base ? money(i.base.total) : "—"}</td>
                  <td className="numeric">{i.current ? money(i.current.total) : "—"}</td>
                  <td className="numeric">{signedMoney(i.total_delta)}</td>
                </tr>
              ))}
            </Table>
            <Pager page={page} count={items.length} size={PAGE} onChange={setPage} />
          </section>
          <p className="muted">
            Custo médio = custo total ÷ quantidade. Produtos são associados somente pelo código do ERP. Unidade de medida
            diferente ou quantidade zero tornam o produto “não comparável”. Alertas (≥ +300% ou ≤ −75%) indicam
            conferência, não erro comprovado.
          </p>
        </>
      )}
    </AreaPage>
  );
}
