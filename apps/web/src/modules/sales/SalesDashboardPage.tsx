import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../core/auth/AuthProvider";
import { EmptyState, LoadingState, Metric, Notice, PageTitle } from "../../shared/ui";
import { salesDashboard, salesMessage } from "./api";
import { comparisonLabel, competency, dashboardFilters, dashboardMoney as money, defaultSelection, monthStatus, percent, readSelection, selectionError, selectionParams, type DashboardSelection } from "./dashboard";
import { DailyAnalysis, Figure, Heatmap, MonthlyEvolution, PaymentMix, Ranking, Scroll, Stacked } from "./DashboardCharts";
import { SalesNavigation } from "./SalesNavigation";
import type { SalesDashboard } from "./types";
import "./sales.css";
import "./dashboard.css";

export function SalesDashboardPage() {
  const auth = useAuth(), location = useLocation(), navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selection = readSelection(params), serialized = JSON.stringify(selection);
  const [revision, setRevision] = useState(0);
  const active = !!auth.profile?.active && !!auth.session && !auth.loading && !auth.error;
  const allowed = active && auth.grants.some(g => g.permission === "sales.dashboard.read" && g.scope_type !== "sector");
  const access = JSON.stringify([auth.session?.user.id, active, auth.grants]);
  // O dia é foco sobre agregados já recebidos; não exige outra leitura financeira.
  const filters = dashboardFilters(selection), query = JSON.stringify(filters);
  const key = JSON.stringify([access, query, revision]);
  const invalid = selectionError(selection);
  const outside = !!selection.unit && !auth.can("sales.dashboard.read", { unit_id: selection.unit });
  const [result, setResult] = useState<{ key: string; data?: SalesDashboard; error?: string; at?: string }>();
  useEffect(() => { setResult(undefined); }, [access]);
  const current = result?.key === key ? result : undefined;
  const data = !invalid && !outside ? current?.data : undefined;
  useEffect(() => {
    let obsolete = false;
    if (!allowed || invalid || outside) return;
    const requestFilters = JSON.parse(query) as ReturnType<typeof dashboardFilters>;
    void salesDashboard(requestFilters).then(data => {
      if (!obsolete) setResult({ key, data, at: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date()) });
    }).catch(error => {
      if (!obsolete) setResult({ key, error: error?.code === "23514"
        ? "Selecione um recorte válido de até 100 unidades e 24 competências. Para uma base maior, informe uma unidade autorizada pelo UUID. Nenhum total parcial foi exibido."
        : salesMessage(error) });
    });
    return () => { obsolete = true; };
  }, [allowed, invalid, outside, query, key]);
  const update = useCallback((next: DashboardSelection) => {
    if (JSON.stringify(next) !== serialized) setParams(selectionParams(next), { state: { salesFocus: true } });
  }, [serialized, setParams]);
  const focus = useCallback((unit?: string, month?: string, day?: string) => {
    const previous = JSON.parse(serialized) as DashboardSelection;
    const next = { ...previous, ...(unit ? { unit } : {}), ...(month ? { from: month.slice(0, 7), to: month.slice(0, 7), daily: month.slice(0, 7), day: "" } : {}),
      ...(day ? { daily: data?.daily.competency?.slice(0, 7) ?? previous.daily, day } : {}) };
    update(next);
  }, [serialized, update, data?.daily.competency]);
  function refresh() { auth.refresh(); setRevision(v => v + 1); }
  if (!allowed) return <EmptyState title="Acesso não autorizado">Você não possui acesso gerencial a Vendas / Maquininhas.</EmptyState>;
  const error = invalid || (outside ? "Unidade indisponível para este acesso. Confira o recorte da URL." : current?.error);
  const latest = data?.summary.latest, summary = data?.summary;
  const dailyMonth = data?.months.find(m => m.competency === data.daily.competency);
  const leader = data?.units.find(u => u.id === summary?.leader?.unit_id);
  const focused = !!selection.unit || selection.from !== selection.baseFrom || selection.to !== selection.baseTo || !!selection.day;
  return <section className="sales-dashboard">
    <PageTitle eyebrow="Comercial · Vendas / Maquininhas" title="Dashboard gerencial" description="Evolução, participação e ritmo das vendas no recorte autorizado." />
    <SalesNavigation />
    <form className="sales-dashboard-filters" key={serialized} onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      const from = String(form.get("from")), to = String(form.get("to")), daily = String(form.get("daily"));
      const next = { ...selection, from, to, unit: String(form.get("unitId") || form.get("unit") || ""),
        daily, scope: String(form.get("scope")) as DashboardSelection["scope"], day: "", baseFrom: from, baseTo: to };
      update(next);
    }}>
      <label>Competência inicial<input name="from" type="month" required min="0001-01" max="9999-12" defaultValue={selection.from} /></label>
      <label>Competência final<input name="to" type="month" required min="0001-01" max="9999-12" defaultValue={selection.to} /></label>
      <label>Unidade<select aria-label="Unidade" name="unit" defaultValue={selection.unit}>
        <option value="">Todas as autorizadas</option>
        {data?.units.map(u => <option key={u.id} value={u.id}>{u.code} · {u.name}{!u.active && " (inativa)"}</option>)}
        {selection.unit && !data?.units.some(u => u.id === selection.unit) && <option value={selection.unit}>Unidade selecionada na URL</option>}
      </select></label>
      <label>Escopo financeiro<select aria-label="Escopo financeiro" name="scope" defaultValue={selection.scope}><option value="stone">Stone</option><option value="combined">Stone + PIX</option></select></label>
      <label>Competência diária<input aria-label="Competência diária" name="daily" type="month" min={selection.from} max={selection.to} defaultValue={selection.daily} /><small>Vazia: última disponível no período</small></label>
      <details className="sales-direct-unit"><summary>Recorte direto por UUID</summary><label>Unidade por UUID<input name="unitId" placeholder="UUID autorizado" autoComplete="off" /></label><small>Use para selecionar uma unidade quando a base exceder 100. O banco valida o acesso.</small></details>
      <div className="actions"><button type="submit" className="primary">Aplicar filtros</button><button type="button" onClick={refresh}>Atualizar</button>
        <button type="button" onClick={() => { update(defaultSelection()); setRevision(v => v + 1); }}>Redefinir</button>
        <button type="button" disabled={!focused && !(location.state as { salesFocus?: boolean } | null)?.salesFocus} onClick={() => {
          if ((location.state as { salesFocus?: boolean } | null)?.salesFocus) void navigate(-1);
          else update({ ...selection, unit: "", from: selection.baseFrom, to: selection.baseTo, daily: "", day: "" });
        }}>Voltar</button>
        <button type="button" onClick={() => update({ ...selection, unit: "", from: selection.baseFrom, to: selection.baseTo, daily: "", day: "" })}>Comparar tudo</button>
      </div>
    </form>
    {error ? <Notice error>{error}<div className="actions"><button onClick={refresh}>Tentar novamente</button></div></Notice> : !data ? <LoadingState label="Carregando dashboard…" /> : <>
      <div className="sales-applied" role="status"><strong>{focused ? "Foco ativo" : "Comparação gerencial"}</strong><span>{competency(data.filters.from)} a {competency(data.filters.to)} · {data.filters.scope === "stone" ? "Stone" : "Stone + PIX"} · {data.units.length} unidades autorizadas neste recorte · leitura às {current?.at} (São Paulo)</span></div>
      {!data.months.length && <EmptyState title="Sem movimento no período">A consulta não retornou competências disponíveis. Altere o período ou o recorte autorizado.</EmptyState>}
      {data.months.some(m => m.status_basis === "historical_unavailable") && <Notice>Status histórico indisponível para este acesso. Os totais autorizados continuam disponíveis; comparação, média diária e projeção podem não ter base válida.</Notice>}
      {data.months.some(m => m.partial === true) && <Notice tone="warning">Há competência parcial. Comparações usam o corte diário informado pela API; projeções são estimativas lineares.</Notice>}
      <div className="sales-kpis" aria-label="Indicadores executivos">
        <Metric label="Total financeiro do período" value={money(summary!.total)} hint="Movimento diário + ajuste mensal · escopo selecionado" />
        <div className="sales-kpi-action"><Metric label="Competência mais recente" value={money(latest?.total)} hint={competency(latest?.competency)} />{latest && <button onClick={() => focus(undefined, latest.competency)}>Focar mais recente</button>}</div>
        <Metric label="Variação da competência recente" value={latest?.comparison.available ? percent(latest.comparison.variation_pct) : "Sem comparação"} hint={<>{comparisonLabel(latest ?? null)}{latest?.comparison.available && <><br />{money(latest.comparison.current_amount)} × {money(latest.comparison.reference_amount)}</>}</>} />
        <Metric label="Média diária do período" value={money(summary!.daily_average)} hint="Dias considerados de cada competência; indisponível se status indeterminado" />
        <Metric label="Média mensal do período" value={money(summary!.monthly_average)} hint={`${data.months.length} competências disponíveis; lacunas não são zeros`} />
        <div className="sales-kpi-action"><Metric label={summary!.best_closed?.is_closed === true ? "Melhor competência fechada confirmada" : "Melhor competência completa (VEN-03)"} value={money(summary!.best_closed?.total)} hint={summary!.best_closed ? `${competency(summary!.best_closed.competency)} · ${monthStatus(summary!.best_closed)}` : "Sem competência completa confirmada"} />{summary!.best_closed && <button onClick={() => focus(undefined, summary!.best_closed!.competency)}>Focar melhor completa</button>}</div>
        <div className="sales-kpi-action"><Metric label="Unidade líder no período" value={leader ? `${leader.code} · ${leader.name}` : "Indisponível"} hint={money(summary!.leader?.total)} />{leader && <button onClick={() => focus(leader.id)}>Focar líder</button>}</div>
        <Metric label="Participação da líder" value={summary!.leader ? percent(summary!.leader.share_pct) : "Indisponível"} hint="Sobre o total financeiro selecionado" />
        <Metric label="Concentração das duas maiores" value={summary!.top_two_share_pct === null ? "Indisponível" : percent(summary!.top_two_share_pct)} hint="Participação no período selecionado" />
        <Metric label="Projeção da competência diária — estimativa" value={money(dailyMonth?.projection_is_estimate ? dailyMonth.projection : null)} hint={`${competency(data.daily.competency)} · somente ritmo diário observado`} />
      </div>
      <div className="sales-analysis-grid"><MonthlyEvolution data={data} onFocus={focus} /><Ranking data={data} onFocus={focus} /></div>
      <Stacked key={access} data={data} onFocus={focus} />
      <Heatmap data={data} onFocus={focus} />
      <MonthlySummary data={data} onFocus={focus} />
      <DailyAnalysis data={data} day={selection.day} onFocus={focus} />
      <div className="sales-analysis-grid"><PaymentMix data={data} /><Insights data={data} /></div>
      <BaseContext data={data} />
    </>}
  </section>;
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
function Insights({ data }: { data: SalesDashboard }) {
  const { strongest_advance: advance, largest_decline: decline, pace } = data.insights;
  return <Figure title="Insights gerenciais" description="Somente comparações e projeções fornecidas pelo motor analítico.">
    <dl className="sales-definition"><div><dt>Maior avanço comparável</dt><dd>{advance ? `${competency(advance.competency)} · ${percent(advance.comparison.variation_pct)} · ${comparisonLabel(advance)}` : "Sem competências fechadas comparáveis"}</dd></div>
      <div><dt>Maior recuo</dt><dd>{decline ? `${competency(decline.competency)} · ${percent(decline.comparison.variation_pct)} · ${comparisonLabel(decline)}` : "Sem recuo comparável disponível"}</dd></div>
      <div><dt>Concentração das duas principais</dt><dd>{data.summary.top_two_share_pct === null ? "Indisponível" : percent(data.summary.top_two_share_pct)}</dd></div>
      <div><dt>Ritmo da competência recente</dt><dd>{pace ? `${competency(pace.competency)} · ${pace.comparison.available ? percent(pace.comparison.variation_pct) : "Sem comparação"}` : "Indisponível"}</dd></div>
      <div><dt>Projeção linear — estimativa</dt><dd>{money(pace?.is_estimate ? pace.projection : null)}</dd></div>
      <div><dt>Comparação projetada</dt><dd>{pace?.is_estimate ? `${percent(pace.projected_variation_pct)} · referência ${competency(pace.reference_month)}` : "Sem comparação projetada disponível"}</dd></div>
    </dl>
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
