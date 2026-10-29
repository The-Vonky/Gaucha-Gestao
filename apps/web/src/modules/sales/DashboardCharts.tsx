import { memo, useId, useMemo, useState, type ReactNode } from "react";
import { competency, dashboardMoney as money, intensity, monthStatus, percent, visualMaximum, visualRatio } from "./dashboard";
import type { SalesDashboard } from "./types";

type Focus = (unit?: string, month?: string, day?: string) => void;
export function Figure({ title, children, description }: { title: string; description?: ReactNode; children: ReactNode }) {
  const id = useId();
  return <figure className="sales-figure" aria-labelledby={id}>
    <figcaption id={id}><h2>{title}</h2>{description && <p>{description}</p>}</figcaption>{children}
  </figure>;
}
export function Scroll({ label, children }: { label: string; children: ReactNode }) {
  return <div className="sales-chart-scroll" tabIndex={0} role="region" aria-label={label}>{children}</div>;
}
function Mark({ label, onFocus, children }: { label: string; onFocus: () => void; children: ReactNode }) {
  return <g role="button" tabIndex={0} aria-label={label} onClick={onFocus} onKeyDown={e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onFocus(); }
  }}><title>{label}</title>{children}</g>;
}
const colors = ["#976020", "#276b4e", "#386aaa", "#89508c", "#b34f39", "#596637", "#5a6587", "#86654a"];
const zero = (v: string) => /^-?0\.00$/.test(v);
const path = (points: { x: number; y: number }[]) => points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");

export const MonthlyEvolution = memo(function MonthlyEvolution({ data, onFocus }: { data: SalesDashboard; onFocus: Focus }) {
  const { months } = data;
  // Lacunas ocupam a posição civil real; não são pontos financeiros com valor zero.
  const from = data.filters.from.slice(0, 7), to = data.filters.to.slice(0, 7);
  const index = (v: string) => Number(v.slice(0, 4)) * 12 + Number(v.slice(5, 7));
  const span = Math.max(1, index(to) - index(from));
  const width = Math.max(720, (span + 1) * 180);
  const max = visualMaximum([...months.map(m => m.total), data.summary.monthly_average ?? "0.00"]);
  const negative = months.some(m => m.total.startsWith("-"));
  const baseline = negative ? 145 : 250, scale = negative ? 105 : 210;
  const x = (v: string) => 90 + (index(v) - index(from)) / span * (width - 180);
  const y = (v: string) => baseline - visualRatio(v, max) * scale;
  const groups: typeof months[] = [];
  for (const month of months) {
    const last = groups.at(-1);
    if (last && index(month.competency) - index(last.at(-1)!.competency) === 1) last.push(month);
    else groups.push([month]);
  }
  return <Figure title="Evolução mensal" description="Linha: total mensal com ajustes. Tracejado: média mensal do período. * Parcial; lacunas interrompem a linha. Valores também no resumo mensal.">
    <Scroll label="Gráfico de evolução mensal">
      <svg viewBox={`0 0 ${width} 310`} style={{ minWidth: width }} aria-label="Evolução mensal e média" role="group">
        <line className="sales-axis" x1="40" x2={width - 40} y1={baseline} y2={baseline} />
        {data.summary.monthly_average !== null && <line className="sales-average" x1="40" x2={width - 40} y1={y(data.summary.monthly_average)} y2={y(data.summary.monthly_average)} />}
        {groups.map((group, i) => <path key={i} className="sales-line" d={path(group.map(m => ({ x: x(m.competency), y: y(m.total) })))} />)}
        {data.metadata.missing_months.map(m => <text key={m} x={x(m)} y="292" textAnchor="middle">{competency(m)} · lacuna</text>)}
        {months.map(m => <Mark key={m.competency} label={`Focar competência ${competency(m.competency)}: ${money(m.total)} · ${monthStatus(m)}`} onFocus={() => onFocus(undefined, m.competency)}>
          <circle cx={x(m.competency)} cy={y(m.total)} r="7" className={m.partial === true ? "sales-point partial" : "sales-point"} />
          <text x={x(m.competency)} y={Math.max(20, y(m.total) - 18)} textAnchor="middle">{money(m.total)}</text>
          <text x={x(m.competency)} y="292" textAnchor="middle">{competency(m.competency)}{m.partial === true ? " *" : ""}</text>
        </Mark>)}
      </svg>
    </Scroll>
    <p className="sales-chart-note">Média mensal: <strong>{money(data.summary.monthly_average)}</strong></p>
  </Figure>;
});

export const Ranking = memo(function Ranking({ data, onFocus }: { data: SalesDashboard; onFocus: Focus }) {
  const names = new Map(data.units.map(u => [u.id, `${u.code} · ${u.name}${u.active ? "" : " (inativa)"}`]));
  const max = visualMaximum(data.ranking.map(r => r.total));
  return <Figure title="Ranking de unidades" description="Participação no período selecionado. Empates preservam a ordem da API por UUID. Selecione para focar.">
    {!data.ranking.length ? <p>Sem unidades com total positivo neste recorte.</p> : <ol className="sales-ranking">{data.ranking.map(r =>
      <li key={r.unit_id}><button className="sales-rank" onClick={() => onFocus(r.unit_id)} aria-label={`Focar unidade ${names.get(r.unit_id)}`}>
        <span><strong>{r.position}. {names.get(r.unit_id)}</strong>{r.position === 1 && <small>Líder do recorte</small>}</span>
        <span className="sales-rank-track" aria-hidden="true"><span style={{ width: `${visualRatio(r.total, max) * 100}%` }} /></span>
        <span className="numeric">{money(r.total)}<small>{percent(r.share_pct)} de participação</small></span>
      </button></li>)}</ol>}
  </Figure>;
});

export const Stacked = memo(function Stacked({ data, onFocus }: { data: SalesDashboard; onFocus: Focus }) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const matrix = useMemo(() => new Map(data.unit_months.map(c => [`${c.unit_id}/${c.competency}`, c])), [data.unit_months]);
  const max = visualMaximum(data.unit_months.map(c => c.total));
  // Somente coordenadas visuais são acumuladas; totais exibidos vêm da API.
  const bars = data.months.map(m => {
    let positive = 0, negative = 0;
    return data.units.filter(u => !hidden.has(u.id)).map(u => {
      const c = matrix.get(`${u.id}/${m.competency}`)!;
      const size = visualRatio(c.total, max), start = size >= 0 ? positive : negative;
      if (size >= 0) positive += size; else negative += size;
      return { c, u, start, end: start + size };
    });
  });
  const upper = Math.max(1, ...bars.flatMap(b => b.map(s => s.end))), lower = Math.min(0, ...bars.flatMap(b => b.map(s => s.end)));
  const width = Math.max(720, data.months.length * 150);
  const y = (v: number) => 25 + (upper - v) / (upper - lower) * 215;
  return <Figure title="Composição mensal por unidade" description="Barras empilhadas. A legenda altera apenas o desenho: indicadores e filtros permanecem iguais. Valores e foco também disponíveis no heatmap.">
    <div className="sales-legend" role="group" aria-label="Séries das barras empilhadas">{data.units.map((u, i) =>
      <button key={u.id} aria-pressed={!hidden.has(u.id)} onClick={() => setHidden(old => { const next = new Set(old); if (next.has(u.id)) next.delete(u.id); else next.add(u.id); return next; })}>
        <span className="sales-swatch" style={{ background: colors[i % colors.length] }} aria-hidden="true" />{u.code} · {u.name} · {hidden.has(u.id) ? "oculta" : "visível"}
      </button>)}</div>
    {!data.units.some(u => !hidden.has(u.id)) && <p role="status">Todas as séries estão ocultas. Ative uma série na legenda.</p>}
    <Scroll label="Gráfico de barras empilhadas"><svg viewBox={`0 0 ${width} 290`} style={{ minWidth: width }} role="group" aria-label="Barras empilhadas por unidade e competência">
      <line className="sales-axis" x1="30" x2={width - 30} y1={y(0)} y2={y(0)} />
      {bars.map((bar, i) => <g key={data.months[i].competency}>{bar.filter(s => !zero(s.c.total)).map(s =>
        <Mark key={s.u.id} label={`Focar ${s.u.code} · ${s.u.name}, ${competency(s.c.competency)}: ${money(s.c.total)}`} onFocus={() => onFocus(s.u.id, s.c.competency)}>
          <rect x={i * (width - 60) / bars.length + 55} y={Math.min(y(s.start), y(s.end))} width="65" height={Math.max(1, Math.abs(y(s.end) - y(s.start)))} fill={colors[data.units.indexOf(s.u) % colors.length]} />
        </Mark>)}<text x={i * (width - 60) / bars.length + 87} y="273" textAnchor="middle">{competency(data.months[i].competency)}</text></g>)}
    </svg></Scroll>
  </Figure>;
});

export const Heatmap = memo(function Heatmap({ data, onFocus }: { data: SalesDashboard; onFocus: Focus }) {
  const matrix = useMemo(() => new Map(data.unit_months.map(c => [`${c.unit_id}/${c.competency}`, c])), [data.unit_months]);
  return <Figure title="Heatmap · unidade × competência" description="A intensidade vem do contrato analítico. Cada célula informa seu valor e pode ser selecionada por Enter ou Espaço.">
    <Scroll label="Heatmap de vendas"><table><thead><tr><th scope="col">Unidade</th>{data.months.map(m => <th key={m.competency} scope="col">{competency(m.competency)}{m.partial === true ? " · parcial" : ""}</th>)}</tr></thead>
      <tbody>{data.units.map(u => <tr key={u.id}><th scope="row">{u.code} · {u.name}{!u.active && " (inativa)"}</th>{data.months.map(m => {
        const c = matrix.get(`${u.id}/${m.competency}`)!;
        return <td key={m.competency}><button className="sales-heat-cell" data-intensity={c.intensity}
          style={{ backgroundColor: `rgba(39,107,78,${0.05 + intensity(c.intensity) * 0.25})` }}
          aria-label={`Focar célula ${u.code} · ${u.name}, ${competency(m.competency)}: ${money(c.total)}${zero(c.total) ? ", sem movimento financeiro" : ""}`}
          onClick={() => onFocus(u.id, m.competency)}>{money(c.total)}{zero(c.total) && <small>Sem movimento financeiro</small>}</button></td>;
      })}</tr>)}</tbody></table></Scroll>
  </Figure>;
});

export const DailyAnalysis = memo(function DailyAnalysis({ data, day, onFocus }: { data: SalesDashboard; day: string; onFocus: Focus }) {
  const { daily } = data;
  const month = data.months.find(m => m.competency === daily.competency);
  const elapsed = new Set(data.daily.points.filter(p => p.has_elapsed).map(p => `${p.competency}/${p.day}`));
  const current = daily.totals.filter(p => p.competency === daily.competency && elapsed.has(`${p.competency}/${p.day}`));
  const reference = daily.totals.filter(p => p.competency === daily.reference_month && elapsed.has(`${p.competency}/${p.day}`));
  const estimate = month?.projection_is_estimate === true ? month.projection : null;
  const max = visualMaximum([...current, ...reference].map(p => p.cumulative).concat(estimate ?? "0.00"));
  const maxDay = Math.max(month?.days_in_month ?? 31, ...reference.map(p => p.day));
  const x = (d: number) => 85 + (d - 1) / (maxDay - 1) * 760;
  const y = (v: string) => 230 - visualRatio(v, max) * 185;
  const observed = current.at(-1);
  const selected = current.find(p => String(p.day) === day);
  return <Figure title="Acumulado diário e projeção" description={<>Competência {competency(daily.competency)} · referência {competency(daily.reference_month)}{daily.cutoff_day !== null && ` · corte até dia ${daily.cutoff_day}`}. Ajustes mensais não são distribuídos entre dias.</>}>
    <div className="sales-daily-metrics"><p>Acumulado observado: <strong>{observed ? money(observed.cumulative) : "Indisponível"}</strong></p><p>Projeção linear — estimativa: <strong>{money(estimate)}</strong></p></div>
    {!current.length && <p>Sem detalhamento diário observado nesta competência.</p>}
    <Scroll label="Gráfico de acumulado diário"><svg viewBox="0 0 940 290" style={{ minWidth: 720 }} role="img" aria-label={`Acumulado diário de ${competency(daily.competency)}; valores exatos na tabela diária`}>
      <line className="sales-axis" x1="65" x2="870" y1="230" y2="230" />
      <path className="sales-reference" d={path(reference.map(p => ({ x: x(p.day), y: y(p.cumulative) })))} />
      <path className="sales-line" d={path(current.map(p => ({ x: x(p.day), y: y(p.cumulative) })))} />
      {observed && <><circle className="sales-point" cx={x(observed.day)} cy={y(observed.cumulative)} r="5" /><text x={x(observed.day)} y={Math.max(18, y(observed.cumulative) - 12)}>{money(observed.cumulative)}</text></>}
      {estimate !== null && observed && month && <><path className="sales-projection" d={`M${x(observed.day)},${y(observed.cumulative)} L${x(month.days_in_month)},${y(estimate)}`} />
        <text x={x(month.days_in_month)} y={Math.max(18, y(estimate) - 14)} textAnchor="end">Estimativa {money(estimate)}</text></>}
      {daily.cutoff_day !== null && <><line className="sales-cutoff" x1={x(daily.cutoff_day)} x2={x(daily.cutoff_day)} y1="25" y2="235" /><text x={x(daily.cutoff_day)} y="278" textAnchor="middle">Corte {daily.cutoff_day}</text></>}
      {[1, 5, 10, 15, 20, 25, maxDay].map(d => <text key={d} x={x(d)} y="255" textAnchor="middle">{d}</text>)}
    </svg></Scroll>
    <p className="sales-chart-note">Linha contínua: observado · tracejado cinza: referência anterior · tracejado âmbar: estimativa após o observado.</p>
    {day && <p role="status">Foco no dia {day}: {selected ? `${money(selected.total)} no dia · ${money(selected.cumulative)} acumulado` : "sem valor observado disponível"}. Somente agregados autorizados.</p>}
    <details><summary>Valores diários e referência anterior</summary><Scroll label="Tabela diária"><table><thead><tr><th scope="col">Série</th><th scope="col">Data</th><th scope="col">Total diário</th><th scope="col">Acumulado sem ajustes</th></tr></thead>
      <tbody>{[...current, ...reference].map(p => <tr key={p.sale_date}><th scope="row">{p.competency === daily.competency ? "Observado" : "Referência anterior"}</th>
        <td>{p.competency === daily.competency ? <button aria-pressed={String(p.day) === day} onClick={() => onFocus(undefined, undefined, String(p.day))}>{p.sale_date.split("-").reverse().join("/")}</button> : p.sale_date.split("-").reverse().join("/")}</td>
        <td>{money(p.total)}</td><td>{money(p.cumulative)}</td></tr>)}</tbody></table></Scroll></details>
  </Figure>;
});

export const PaymentMix = memo(function PaymentMix({ data }: { data: SalesDashboard }) {
  const mix = data.payment_mix;
  return <Figure title="Composição Stone × PIX" description="Base dos dois métodos, inclusive quando os indicadores principais estão em Stone. Não altera o total selecionado.">
    <div className="sales-mix-bar" aria-hidden="true"><span style={{ width: `${mix.stone_share_pct === null ? 0 : intensity(String(Number(mix.stone_share_pct) / 100)) * 100}%` }} /><span style={{ width: `${mix.pix_share_pct === null ? 0 : intensity(String(Number(mix.pix_share_pct) / 100)) * 100}%` }} /></div>
    <dl className="sales-definition"><div><dt>Stone</dt><dd>{money(mix.stone)} · {mix.stone_share_pct === null ? "Composição indisponível (base zero)" : percent(mix.stone_share_pct)}</dd></div>
      <div><dt>PIX</dt><dd>{money(mix.pix)} · {mix.pix_share_pct === null ? "Composição indisponível (base zero)" : percent(mix.pix_share_pct)}</dd></div></dl>
  </Figure>;
});
