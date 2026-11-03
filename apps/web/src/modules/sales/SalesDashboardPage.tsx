import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../core/auth/AuthProvider";
import { EmptyState, LoadingState, Metric, Notice, PageTitle } from "../../shared/ui";
import { salesDashboard, salesMessage } from "./api";
import { comparisonLabel, competency, dashboardFilters, dashboardMoney as money, defaultSelection, monthStatus, percent, readSelection, selectionError, selectionParams, type DashboardSelection } from "./dashboard";
import { CompactPercent, DailyAnalysis, Figure, Heatmap, MonthlyEvolution, PaymentMix, Ranking, Scroll, Stacked } from "./DashboardCharts";
import { CompetencySelect } from "./CompetencySelect";
import { SalesNavigation } from "./SalesNavigation";
import type { SalesDashboard } from "./types";
import "./sales.css";
import "./dashboard.css";

export function SalesDashboardPage() {
  const auth = useAuth(), location = useLocation(), navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selection = readSelection(params), serialized = JSON.stringify(selection);
  const [revision, setRevision] = useState(0), [dailyRevision, setDailyRevision] = useState(0), [formRevision, setFormRevision] = useState(0);
  const active = !!auth.profile?.active && !!auth.session && !auth.loading && !auth.error;
  const allowed = active && auth.grants.some(g => g.permission === "sales.dashboard.read" && g.scope_type !== "sector");
  const access = JSON.stringify([auth.session?.user.id, active, auth.grants]);
  // O dia é foco sobre agregados já recebidos; não exige outra leitura financeira.
  const filters = dashboardFilters(selection), query = JSON.stringify(filters);
  // A competência diária não invalida os agregados do recorte principal.
  const mainQuery = JSON.stringify({ ...filters, daily_month: undefined });
  const key = JSON.stringify([access, mainQuery, revision]);
  const dailyKey = JSON.stringify([key, query, dailyRevision]);
  const formKey = JSON.stringify([access, mainQuery, selection.baseFrom, selection.baseTo, formRevision]);
  const invalid = selectionError(selection);
  const outside = !!selection.unit && !auth.can("sales.dashboard.read", { unit_id: selection.unit });
  const [result, setResult] = useState<{ key: string; data?: SalesDashboard; error?: string; at?: string }>();
  const [dailyResult, setDailyResult] = useState<{ key: string; data?: Pick<SalesDashboard, "daily" | "months">; error?: string }>();
  useEffect(() => { setResult(undefined); setDailyResult(undefined); }, [access]);
  const current = result?.key === key ? result : undefined;
  const data = !invalid && !outside ? current?.data : undefined;
  useEffect(() => {
    let obsolete = false;
    if (!allowed || invalid || outside) return;
    const requestFilters = JSON.parse(query) as ReturnType<typeof dashboardFilters>;
    void salesDashboard(requestFilters).then(data => {
      if (!obsolete) {
        setResult(previous => previous?.key === key && previous.data ? previous : { key, data, at: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date()) });
        setDailyResult({ key: dailyKey, data: { daily: data.daily, months: data.months } });
      }
    }).catch(error => {
      if (!obsolete) {
        const message = error?.code === "23514"
        ? "Selecione um recorte válido de até 100 unidades e 24 competências. Para uma base maior, informe uma unidade autorizada pelo UUID. Nenhum total parcial foi exibido."
        : salesMessage(error);
        // Uma recusa de autorização/sessão invalida também o snapshot principal.
        const denied = ["42501", "28000", "28P01", "PGRST301", "PGRST302", "PGRST303"].includes(error?.code);
        setResult(previous => !denied && previous?.key === key && previous.data ? previous : { key, error: message });
        setDailyResult({ key: dailyKey, error: message });
      }
    });
    return () => { obsolete = true; };
  }, [allowed, invalid, outside, query, key, dailyKey]);
  const update = useCallback((next: DashboardSelection) => {
    if (JSON.stringify(next) !== serialized) setParams(selectionParams(next), { state: { salesFocus: true } });
  }, [serialized, setParams]);
  const dailyCurrent = dailyResult?.key === dailyKey ? dailyResult : undefined;
  const focus = useCallback((unit?: string, month?: string, day?: string) => {
    const previous = JSON.parse(serialized) as DashboardSelection;
    const next = { ...previous, ...(unit ? { unit } : {}), ...(month ? { from: month.slice(0, 7), to: month.slice(0, 7), daily: month.slice(0, 7), day: "" } : {}),
      ...(day ? { daily: dailyCurrent?.data?.daily.competency?.slice(0, 7) ?? previous.daily, day } : {}) };
    update(next);
  }, [serialized, update, dailyCurrent?.data?.daily.competency]);
  const changeDailyMonth = useCallback((daily: string) => {
    const previous = JSON.parse(serialized) as DashboardSelection;
    if (daily && data?.months.some(m => m.competency.slice(0, 7) === daily && !data.metadata.missing_months.includes(m.competency))
      && daily >= previous.from && daily <= previous.to) update({ ...previous, daily, day: "" });
  }, [serialized, data, update]);
  function refresh() { auth.refresh(); setRevision(v => v + 1); }
  if (!allowed) return <EmptyState title="Acesso não autorizado">Você não possui acesso gerencial a Vendas / Maquininhas.</EmptyState>;
  const error = invalid || (outside ? "Unidade indisponível para este acesso. Confira o recorte da URL." : current?.error);
  const latest = data?.summary.latest, summary = data?.summary;
  const dailyMonth = dailyCurrent?.data?.months.find(m => m.competency === dailyCurrent.data?.daily.competency);
  const leader = data?.units.find(u => u.id === summary?.leader?.unit_id);
  const focused = !!selection.unit || selection.from !== selection.baseFrom || selection.to !== selection.baseTo || !!selection.day;
  return <section className="sales-dashboard">
    <PageTitle title="Dashboard gerencial" description="Evolução, participação e ritmo das vendas no recorte autorizado."><SalesNavigation /></PageTitle>
    <DashboardFiltersForm key={formKey} selection={selection} data={data} onApply={update}>
      <div className="actions"><button type="submit" className="primary">Aplicar filtros</button><button type="button" onClick={refresh}>Atualizar</button>
        <button type="button" onClick={() => { update(defaultSelection()); setRevision(v => v + 1); setFormRevision(v => v + 1); }}>Redefinir</button>
        <button type="button" disabled={!focused && !(location.state as { salesFocus?: boolean } | null)?.salesFocus} onClick={() => {
          if ((location.state as { salesFocus?: boolean } | null)?.salesFocus) void navigate(-1);
          else update({ ...selection, unit: "", from: selection.baseFrom, to: selection.baseTo, daily: "", day: "" });
        }}>Voltar</button>
        <button type="button" onClick={() => update({ ...selection, unit: "", from: selection.baseFrom, to: selection.baseTo, daily: "", day: "" })}>Comparar tudo</button>
      </div>
    </DashboardFiltersForm>
    {error ? <Notice error>{error}<div className="actions"><button onClick={refresh}>Tentar novamente</button></div></Notice> : !data ? <LoadingState label="Carregando dashboard…" /> : <>
      <div className="sales-applied" role="status"><strong>{focused ? "Foco ativo" : "Comparação gerencial"}</strong><span>{competency(data.filters.from)} a {competency(data.filters.to)} · {data.filters.scope === "stone" ? "Stone" : "Stone + PIX"} · {data.units.length} unidades autorizadas neste recorte · leitura às {current?.at} (São Paulo)</span></div>
      {!data.months.length && <EmptyState title="Sem movimento no período">A consulta não retornou competências disponíveis. Altere o período ou o recorte autorizado.</EmptyState>}
      {data.months.some(m => m.status_basis === "historical_unavailable") && <Notice>Status histórico indisponível para este acesso. Os totais autorizados continuam disponíveis; comparação, média diária e projeção podem não ter base válida.</Notice>}
      {data.months.some(m => m.partial === true) && <Notice tone="warning">Há competência parcial. Comparações usam o corte diário informado pela API; projeções são estimativas lineares.</Notice>}
      <div className="sales-kpis" role="group" aria-label="Indicadores executivos">
        <Metric label="Total financeiro do período" value={<KpiMoney value={summary!.total} />} hint="Movimento diário + ajuste mensal · escopo selecionado" />
        <div className="sales-kpi-action"><Metric label="Competência mais recente" value={<KpiMoney value={latest?.total} />} hint={<>{competency(latest?.competency)} · <CompactPercent value={latest?.comparison.available ? latest.comparison.variation_pct : null} /><br />{latest ? monthStatus(latest) : "Indisponível"}</>} />{latest && <button onClick={() => focus(undefined, latest.competency)}>Focar mais recente</button>}</div>
        <div className="sales-kpi-action"><Metric label={summary!.best_closed?.is_closed === true ? "Melhor competência fechada confirmada" : "Melhor competência completa (VEN-03)"} value={<KpiMoney value={summary!.best_closed?.total} />} hint={summary!.best_closed ? `${competency(summary!.best_closed.competency)} · ${monthStatus(summary!.best_closed)}` : "Sem competência completa confirmada"} />{summary!.best_closed && <button onClick={() => focus(undefined, summary!.best_closed!.competency)}>Focar melhor completa</button>}</div>
        <div className="sales-kpi-action"><Metric label="Unidade líder no período" value={<span className="sales-leader-name" title={leader ? `${leader.code} · ${leader.name}` : "Indisponível"}>{leader ? `${leader.code} · ${leader.name}` : "Indisponível"}</span>} hint={<>{money(summary!.leader?.total)} · <CompactPercent value={summary!.leader?.share_pct} /> de participação</>} />{leader && <button onClick={() => focus(leader.id)}>Focar líder</button>}</div>
      </div>
      <Insights data={data} />
      <SectionHeading title="Desempenho das unidades" description="Evolução dos recebimentos e contribuição de cada unidade no recorte autorizado." />
      <div className="sales-analysis-grid"><MonthlyEvolution data={data} onFocus={focus} /><Ranking data={data} onFocus={focus} /></div>
      <Stacked key={access} data={data} onFocus={focus} />
      <SectionHeading title="Comparativo por unidade" description="Mapa de intensidade e resumo mensal com valores exatos." />
      <Heatmap data={data} onFocus={focus} />
      <MonthlySummary data={data} onFocus={focus} />
      <SectionHeading title="Ritmo de vendas" description="Observado, referência e projeção explicitamente separados." />
      <DailyAnalysis data={data} analysis={dailyCurrent?.data} loading={!dailyCurrent} error={dailyCurrent?.error}
        dailyMonth={selection.daily} day={selection.day} onFocus={focus} onDailyMonthChange={changeDailyMonth} onRetry={() => setDailyRevision(v => v + 1)} />
      <SectionHeading title="Indicadores complementares" description="Detalhes do período, comparações e estimativas da API." />
      <div className="sales-kpis sales-secondary-kpis" role="group" aria-label="Indicadores complementares">
        <Metric label="Variação da competência recente" value={<CompactPercent value={latest?.comparison.available ? latest.comparison.variation_pct : null} />} hint={<>{comparisonLabel(latest ?? null)}{latest?.comparison.available && <><br />{money(latest.comparison.current_amount)} × {money(latest.comparison.reference_amount)}</>}</>} />
        <Metric label="Média diária do período" value={money(summary!.daily_average)} hint="Dias considerados de cada competência; indisponível se status indeterminado" />
        <Metric label="Média mensal do período" value={money(summary!.monthly_average)} hint={`${data.months.length} competências disponíveis; lacunas não são zeros`} />
        <Metric label="Participação da líder" value={summary!.leader ? <CompactPercent value={summary!.leader.share_pct} /> : "Indisponível"} hint="Sobre o total financeiro selecionado" />
        <Metric label="Concentração das duas maiores" value={summary!.top_two_share_pct === null ? "Indisponível" : <CompactPercent value={summary!.top_two_share_pct} />} hint="Participação no período selecionado" />
        <Metric label="Projeção da competência diária — estimativa" value={money(dailyMonth?.projection_is_estimate ? dailyMonth.projection : null)} hint={`${competency(dailyCurrent?.data?.daily.competency)} · somente ritmo diário observado`} />
      </div>
      <PaymentMix data={data} />
      <BaseContext data={data} />
    </>}
  </section>;
}

function DashboardFiltersForm({ selection, data, onApply, children }: {
  selection: DashboardSelection; data?: SalesDashboard; onApply: (next: DashboardSelection) => void; children: ReactNode;
}) {
  const [from, setFrom] = useState(selection.from), [to, setTo] = useState(selection.to), [daily, setDaily] = useState(selection.daily);
  useEffect(() => { setDaily(selection.daily >= from && selection.daily <= to ? selection.daily : ""); }, [selection.daily]);
  const anchors = [selection.from, selection.to, data?.metadata.first_available_month ?? "", data?.metadata.latest_available_month ?? ""];
  return <form className="sales-dashboard-filters" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const validDaily = daily && daily >= from && daily <= to ? daily : "";
    onApply({ ...selection, from, to, unit: String(form.get("unitId") || form.get("unit") || ""), daily: validDaily,
      scope: String(form.get("scope")) as DashboardSelection["scope"], day: "", baseFrom: from, baseTo: to });
  }}>
    <CompetencySelect label="Competência inicial" name="from" value={from} onChange={value => { setFrom(value); if (daily && daily < value) setDaily(""); }} anchors={anchors} />
    <CompetencySelect label="Competência final" name="to" value={to} onChange={value => { setTo(value); if (daily && daily > value) setDaily(""); }} anchors={anchors} />
    <label>Unidade<select aria-label="Unidade" name="unit" defaultValue={selection.unit}>
      <option value="">Todas as autorizadas</option>
      {data?.units.map(u => <option key={u.id} value={u.id}>{u.code} · {u.name}{!u.active && " (inativa)"}</option>)}
      {selection.unit && !data?.units.some(u => u.id === selection.unit) && <option value={selection.unit}>Unidade selecionada na URL</option>}
    </select></label>
    <fieldset className="sales-scope"><legend>Escopo financeiro</legend><div className="sales-segmented">
      <label><input type="radio" name="scope" value="stone" defaultChecked={selection.scope === "stone"} /><span>Stone</span></label>
      <label><input type="radio" name="scope" value="combined" defaultChecked={selection.scope === "combined"} /><span>Stone + PIX</span></label>
    </div></fieldset>
    {children}
    <details className="sales-advanced"><summary>Filtros avançados</summary><div>
      <label>Competência diária<input aria-label="Competência diária" name="daily" type="month" min={from} max={to} value={daily} onChange={e => setDaily(e.target.value)} /><small>Vazia: última disponível no período</small></label>
      <label>Recorte direto por UUID<input aria-label="Unidade por UUID" name="unitId" placeholder="UUID autorizado" autoComplete="off" /><small>Até uma unidade autorizada; o banco valida o acesso.</small></label>
    </div></details>
  </form>;
}

function MonthlySummary({ data, onFocus }: { data: SalesDashboard; onFocus: (unit?: string, month?: string) => void }) {
  const combined = data.filters.scope === "combined";
  return <Figure title="Resumo mensal" description="Status segue a API; idade da competência não confirma fechamento. Unidades com total positivo / unidades consideradas. Valores exatos em reais.">
    <Scroll label="Resumo mensal"><table><thead><tr>{["Competência", "Stone", ...(combined ? ["PIX"] : []), "Total exibido", "Variação", "Média por dia", "Dias de base", "Unidades", "Situação", "Comparação"].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{data.months.map(m => <tr key={m.competency}><th scope="row"><button onClick={() => onFocus(undefined, m.competency)}>{competency(m.competency)}</button></th>
        <td>{money(m.stone)}</td>{combined && <td>{money(m.pix)}</td>}<td>{money(m.total)}</td><td>{m.comparison.available ? percent(m.comparison.variation_pct) : "Sem comparação"}</td>
        <td>{money(m.daily_average)}</td><td>{m.partial === null ? "Indisponível" : m.partial ? m.last_day_with_data : m.days_in_month}</td>
        <td>{data.unit_months.filter(c => c.competency === m.competency && !c.total.startsWith("-") && c.total !== "0.00").length} / {data.units.length}</td>
        <td>{monthStatus(m)}</td><td>{comparisonLabel(m)}{m.comparison.available && <small>{money(m.comparison.current_amount)} × {money(m.comparison.reference_amount)}</small>}</td></tr>)}</tbody>
      <tfoot><tr><th scope="row">Total do período</th><td>{money(data.summary.stone)}</td>{combined && <td>{money(data.summary.pix)}</td>}<td>{money(data.summary.total)}</td><td colSpan={6}>Consolidado da API</td></tr></tfoot>
    </table></Scroll>
  </Figure>;
}
function KpiMoney({ value }: { value: string | null | undefined }) {
  const formatted = money(value);
  return <span className={`sales-kpi-money${formatted.length > 20 ? " sales-kpi-money-long" : ""}`} title={formatted} tabIndex={formatted.length > 20 ? 0 : undefined}>{formatted}</span>;
}
function SectionHeading({ title, description }: { title: string; description: string }) {
  return <header className="sales-section-heading"><h2>{title}</h2><p>{description}</p></header>;
}
function Insights({ data }: { data: SalesDashboard }) {
  const { strongest_advance: advance, largest_decline: decline, pace } = data.insights;
  return <Figure title="Panorama Gaúcha" description="Principais movimentos no recorte selecionado, fornecidos pelo motor analítico.">
    <div className="sales-insights">
      <article className="sales-insight" data-tone={advance?.comparison.trend ?? "neutral"}><h3>Maior avanço</h3>
        <p>{advance ? <><strong>{competency(advance.competency)} · <CompactPercent value={advance.comparison.variation_pct} /></strong><small>{comparisonLabel(advance)}</small></> : "Sem competências fechadas comparáveis"}</p></article>
      <article className="sales-insight" data-tone={decline ? "down" : "neutral"}><h3>Ponto de atenção</h3>
        <p>{decline ? <><strong>{competency(decline.competency)} · <CompactPercent value={decline.comparison.variation_pct} /></strong><small>Maior recuo · {comparisonLabel(decline)}</small></> : "Sem recuo comparável disponível"}</p></article>
      <article className="sales-insight" data-tone="neutral"><h3>Ritmo atual e concentração</h3>
        <p>{pace ? <><strong>{competency(pace.competency)} · <CompactPercent value={pace.comparison.available ? pace.comparison.variation_pct : null} /></strong><small>Ritmo da competência recente</small></> : "Indisponível"}</p>
        <p>Projeção linear — estimativa: <strong>{money(pace?.is_estimate ? pace.projection : null)}</strong>
          <small>Comparação projetada: {pace?.is_estimate ? <><CompactPercent value={pace.projected_variation_pct} /> · referência {competency(pace.reference_month)}</> : "Sem comparação projetada disponível"}</small></p>
        <p>As duas principais: <strong><CompactPercent value={data.summary.top_two_share_pct} /></strong></p>
        <details><summary>Precisão dos percentuais</summary><small>Ritmo: {percent(pace?.comparison.available ? pace.comparison.variation_pct : null)} · concentração: {percent(data.summary.top_two_share_pct)} · projeção: {pace?.is_estimate ? `${percent(pace.projected_variation_pct)} · referência ${competency(pace.reference_month)}` : "Sem comparação"}</small></details>
      </article>
    </div>
  </Figure>;
}
function BaseContext({ data }: { data: SalesDashboard }) {
  const s = data.summary;
  return <Figure title="Contexto da base e reconciliação" description="Reconciliação interna: total mensal − diário − ajuste. Não constitui conciliação bancária independente nem migração real do histórico.">
    <dl className="sales-definition sales-context"><div><dt>Período efetivo</dt><dd>{competency(data.filters.from)} a {competency(data.filters.to)}</dd></div>
      <div><dt>Modalidade</dt><dd>{data.filters.scope === "stone" ? "Stone" : "Stone + PIX"}</dd></div><div><dt>Competências e lacunas</dt><dd>{data.months.length} disponíveis · {data.metadata.missing_months.length ? data.metadata.missing_months.map(competency).join(", ") : "sem lacunas"}</dd></div>
      <div><dt>Disponibilidade até o fim consultado</dt><dd>{competency(data.metadata.first_available_month)} a {competency(data.metadata.latest_available_month)}</dd></div>
      <div><dt>Histórico de status</dt><dd>{data.metadata.global_status_visible ? "Snapshot global quando existente; derivação conforme contrato" : "Somente datas autorizadas; status histórico global indisponível"}</dd></div>
      <div><dt>Unidades consideradas</dt><dd>{data.units.length ? data.units.map(u => `${u.code} · ${u.name}${!u.active ? " (inativa)" : ""}`).join("; ") : "Nenhuma unidade neste recorte"}</dd></div></dl>
    <Scroll label="Reconciliação interna"><table><thead><tr>{["Competência", "Total diário", "Ajuste mensal sem data", "Total mensal", "Diferença aritmética", "Status / cobertura"].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{data.months.map(m => <tr key={m.competency}><th scope="row">{competency(m.competency)}</th><td>{money(m.daily_total)}</td><td>{money(m.adjustment_total)}</td><td>{money(m.total)}</td><td>{money(m.reconciliation_difference)}</td><td>{monthStatus(m)} · último dia informado {m.last_day_with_data || "indisponível"}</td></tr>)}</tbody>
      <tfoot><tr><th scope="row">Período selecionado</th><td>{money(s.daily_total)}</td><td>{money(s.adjustment_total)}</td><td>{money(s.total)}</td><td>{money(s.reconciliation_difference)}</td><td>Identidade aritmética dos componentes</td></tr></tfoot>
    </table></Scroll>
  </Figure>;
}
