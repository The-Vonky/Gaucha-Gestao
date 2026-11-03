import { createContext, memo, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { chartScale, compactMoney, compactPercent, competency, dashboardMoney as money, intensity, monthStatus, percent, stackCoordinates, unitColor, visualMaximum, visualRatio } from "./dashboard";
import type { SalesDashboard } from "./types";

type Focus = (unit?: string, month?: string, day?: string) => void;
type Tip = { id: string; label: string; left: number; top: number };
const Tooltip = createContext<(tip?: Tip) => void>(() => {});
export function Figure({ title, children, description, badge }: { title: string; description?: ReactNode; badge?: string; children: ReactNode }) {
  const id = useId(), [tip, setTip] = useState<Tip>();
  return <figure className="sales-figure" aria-labelledby={id}>
    <figcaption id={id}><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{badge && <span className="sales-chart-badge">{badge}</span>}</figcaption>
    <Tooltip value={setTip}>{children}</Tooltip>
    {tip && <div id={tip.id} role="tooltip" className="sales-tooltip" style={{ left: tip.left, top: tip.top }}>{tip.label}</div>}
  </figure>;
}
export function Scroll({ label, children }: { label: string; children: ReactNode }) {
  return <div className="sales-chart-scroll" tabIndex={0} role="region" aria-label={label}>{children}</div>;
}
function Mark({ label, onFocus, children }: { label: string; onFocus: () => void; children: ReactNode }) {
  const tip = useContext(Tooltip), id = useId(), [visible, setVisible] = useState(false);
  const hide = () => { setVisible(false); tip(); };
  const show = (element: SVGGElement) => {
    const box = element.getBoundingClientRect();
    setVisible(true);
    tip({ id, label, left: Math.max(8, Math.min(window.innerWidth - 288, box.left)), top: Math.max(8, Math.min(window.innerHeight - 120, box.top + 24)) });
  };
  return <g className="sales-chart-mark" role="button" tabIndex={0} aria-label={label} aria-describedby={visible ? id : undefined}
    onMouseEnter={e => show(e.currentTarget)} onMouseLeave={hide} onFocus={e => show(e.currentTarget)} onBlur={hide}
    onClick={() => { hide(); onFocus(); }} onKeyDown={e => {
      if (e.key === "Escape") hide();
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); hide(); onFocus(); }
    }}><title>{label}</title>{children}</g>;
}
/** Altura fixa em CSS; largura acompanha o container e só cresce para rolagem interna. */
function Chart({ minimum = 680, label, children }: { minimum?: number; label: string; children: (width: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null), [available, setAvailable] = useState(720);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setAvailable(Math.floor(entry.contentRect.width)));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  const width = Math.max(minimum, available);
  return <div ref={ref} className="sales-chart-scroll" tabIndex={0} role="region" aria-label={label}>
    <svg className="sales-plot" viewBox={`0 0 ${width} 310`} width={width} height="310" style={{ width, minWidth: width }} role="group" aria-label={label}>{children(width)}</svg>
  </div>;
}
function Grid({ scale, width }: { scale: ReturnType<typeof chartScale>; width: number }) {
  return <g className="sales-grid" aria-hidden="true">{scale.ticks.map(value => <g key={value}>
    <line x1="92" x2={width - 36} y1={scale.y(value)} y2={scale.y(value)} />
    <text x="82" y={scale.y(value) + 4} textAnchor="end">{compactMoney(value)}</text>
  </g>)}</g>;
}
export function CompactPercent({ value }: { value: string | null | undefined }) {
  return <span title={`Percentual exato: ${percent(value)}`}><span aria-hidden="true">{compactPercent(value)}</span><span className="visually-hidden">Percentual exato: {percent(value)}</span></span>;
}
const zero = (v: string) => /^-?0\.00$/.test(v);
const path = (points: { x: number; y: number }[]) => points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");

export const MonthlyEvolution = memo(function MonthlyEvolution({ data, onFocus }: { data: SalesDashboard; onFocus: Focus }) {
  const { months } = data, gradient = useId();
  const from = data.filters.from.slice(0, 7), to = data.filters.to.slice(0, 7);
  const index = (v: string) => Number(v.slice(0, 4)) * 12 + Number(v.slice(5, 7));
  const span = index(to) - index(from);
  const scale = chartScale([...months.map(m => m.total), data.summary.monthly_average ?? "0.00"]);
  const groups: typeof months[] = [];
  for (const month of months) {
    const last = groups.at(-1);
    if (last && index(month.competency) - index(last.at(-1)!.competency) === 1) last.push(month);
    else groups.push([month]);
  }
  return <Figure title="Evolução mensal" badge={`${months.length} competências`} description="Total mensal com ajustes. * Parcial; lacunas interrompem a linha. Selecione uma competência para focar.">
    <Chart label="Gráfico de evolução mensal" minimum={Math.max(560, (span + 1) * 72 + 120)}>{width => {
      const x = (v: string) => 130 + (span === 0 ? .5 : (index(v) - index(from)) / span) * (width - 200);
      return <>
        <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop className="sales-area-start" offset="0%" /><stop className="sales-area-end" offset="100%" /></linearGradient></defs>
        <Grid scale={scale} width={width} />
        {groups.map((group, i) => {
          const points = group.map(m => ({ x: x(m.competency), y: scale.y(m.total) }));
          return <g key={i}><path className="sales-area" d={`${path(points)} L${points.at(-1)!.x},${scale.y("0.00")} L${points[0].x},${scale.y("0.00")} Z`} fill={`url(#${gradient})`} />
            <path className="sales-line" d={path(points)} /></g>;
        })}
        {data.summary.monthly_average !== null && <g><line className="sales-average" x1="92" x2={width - 36} y1={scale.y(data.summary.monthly_average)} y2={scale.y(data.summary.monthly_average)} />
          <text className="sales-average-label" x={width - 36} y={Math.max(18, scale.y(data.summary.monthly_average) - 9)} textAnchor="end">média {compactMoney(data.summary.monthly_average)}</text></g>}
        {data.metadata.missing_months.map(m => <text key={m} x={x(m)} y="288" textAnchor="middle">{competency(m)} · lacuna</text>)}
        {months.map(m => <Mark key={m.competency} label={`Focar competência ${competency(m.competency)}: ${money(m.total)} · ${monthStatus(m)}`} onFocus={() => onFocus(undefined, m.competency)}>
          <circle cx={x(m.competency)} cy={scale.y(m.total)} r="5" className={m.partial === true ? "sales-point partial" : "sales-point"} />
          <text className="sales-value-label" x={x(m.competency)} y={Math.max(18, scale.y(m.total) - 15)} textAnchor="middle">{compactMoney(m.total)}</text>
          <text x={x(m.competency)} y="288" textAnchor="middle">{competency(m.competency)}{m.partial === true ? " * parcial" : ""}</text>
        </Mark>)}
      </>;
    }}</Chart>
    <p className="sales-chart-note">Média mensal: <strong>{money(data.summary.monthly_average)}</strong> · valores exatos no resumo mensal e ao focar os pontos.</p>
  </Figure>;
});

export const Ranking = memo(function Ranking({ data, onFocus }: { data: SalesDashboard; onFocus: Focus }) {
  const names = new Map(data.units.map(u => [u.id, `${u.code} · ${u.name}${u.active ? "" : " (inativa)"}`]));
  const max = visualMaximum(data.ranking.map(r => r.total));
  return <Figure title="Ranking de unidades" badge={`${data.ranking.length} unidades`} description="Contribuição no período. Ordem e desempate da API; selecione para focar.">
    {!data.ranking.length ? <p>Sem unidades com total positivo neste recorte.</p> : <ol className="sales-ranking">{data.ranking.map(r =>
      <li key={r.unit_id}><button className="sales-rank" data-unit={r.unit_id} onClick={() => onFocus(r.unit_id)} aria-label={`Focar unidade ${names.get(r.unit_id)}`}>
        <span className="sales-rank-name" title={names.get(r.unit_id)}><strong><i className="sales-swatch" style={{ background: unitColor(r.unit_id) }} />{r.position}. {names.get(r.unit_id)}</strong>{r.position === 1 && <small>Líder do recorte</small>}</span>
        <span className="sales-rank-track" aria-hidden="true"><span style={{ width: `${Math.max(0, visualRatio(r.total, max)) * 100}%`, background: unitColor(r.unit_id) }} /></span>
        <span className="numeric">{money(r.total)}<small><CompactPercent value={r.share_pct} /> de participação</small></span>
      </button></li>)}</ol>}
  </Figure>;
});

export const Stacked = memo(function Stacked({ data, onFocus }: { data: SalesDashboard; onFocus: Focus }) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [highlight, setHighlight] = useState("");
  const matrix = useMemo(() => new Map(data.unit_months.map(c => [`${c.unit_id}/${c.competency}`, c])), [data.unit_months]);
  const bars = data.months.map(m => {
    const cells = data.units.filter(u => !hidden.has(u.id)).flatMap(u => {
      const c = matrix.get(`${u.id}/${m.competency}`);
      return c ? [{ c, u }] : [];
    });
    const coordinates = stackCoordinates(cells.map(s => s.c.total));
    return cells.map((s, i) => ({ ...s, ...coordinates[i] }));
  });
  const scale = chartScale(bars.flatMap(bar => bar.flatMap(s => [s.start, s.end])));
  return <Figure title="Composição mensal por unidade" badge={`${data.months.length} competências`} description="A legenda oculta somente séries visuais. Passe ou foque uma unidade para destacá-la; selecione a barra para focar o recorte.">
    {!data.units.some(u => !hidden.has(u.id)) && <p role="status">Todas as séries estão ocultas. Ative uma série na legenda.</p>}
    <Chart label="Gráfico de barras empilhadas" minimum={Math.max(720, data.months.length * 96 + 130)}>{width => {
      const slot = (width - 130) / Math.max(1, bars.length), barWidth = Math.min(86, slot * .62);
      return <><Grid scale={scale} width={width} />
        <line className="sales-axis" x1="92" x2={width - 36} y1={scale.y("0.00")} y2={scale.y("0.00")} />
        {bars.map((bar, i) => <g key={data.months[i].competency}>{bar.filter(s => !zero(s.c.total)).map(s =>
          <Mark key={s.u.id} label={`Focar ${s.u.code} · ${s.u.name}, ${competency(s.c.competency)}: ${money(s.c.total)}`} onFocus={() => onFocus(s.u.id, s.c.competency)}>
            <rect data-unit={s.u.id} x={92 + slot * i + (slot - barWidth) / 2} y={Math.min(scale.y(s.start), scale.y(s.end))} width={barWidth} height={Math.max(1, Math.abs(scale.y(s.end) - scale.y(s.start)))} rx="2" fill={unitColor(s.u.id)} opacity={highlight && data.units.some(u => u.id === highlight) && highlight !== s.u.id ? .3 : 1} />
          </Mark>)}<text x={92 + slot * (i + .5)} y="288" textAnchor="middle">{competency(data.months[i].competency)}{data.months[i].partial === true ? " * parcial" : ""}</text></g>)}
      </>;
    }}</Chart>
    <div className="sales-legend" role="group" aria-label="Séries das barras empilhadas">{data.units.map(u =>
      <button key={u.id} data-unit={u.id} aria-pressed={!hidden.has(u.id)} onMouseEnter={() => setHighlight(u.id)} onMouseLeave={() => setHighlight("")} onFocus={() => setHighlight(u.id)} onBlur={() => setHighlight("")}
        onClick={() => setHidden(old => { const next = new Set(old); if (next.has(u.id)) next.delete(u.id); else next.add(u.id); return next; })}>
        <span className="sales-swatch" style={{ background: unitColor(u.id) }} aria-hidden="true" />{u.code} · {u.name} · {hidden.has(u.id) ? "oculta" : "visível"}
      </button>)}</div>
  </Figure>;
});

export const Heatmap = memo(function Heatmap({ data, onFocus }: { data: SalesDashboard; onFocus: Focus }) {
  const matrix = useMemo(() => new Map(data.unit_months.map(c => [`${c.unit_id}/${c.competency}`, c])), [data.unit_months]);
  return <Figure title="Heatmap · unidade × competência" description="A intensidade vem do contrato analítico. Cada célula informa seu valor e pode ser selecionada por Enter ou Espaço.">
    <Scroll label="Heatmap de vendas"><table><thead><tr><th scope="col">Unidade</th>{data.months.map(m => <th key={m.competency} scope="col">{competency(m.competency)}{m.partial === true ? " · parcial" : ""}</th>)}</tr></thead>
      <tbody>{data.units.map(u => <tr key={u.id}><th scope="row"><span className="sales-swatch" style={{ background: unitColor(u.id) }} aria-hidden="true" /> {u.code} · {u.name}{!u.active && " (inativa)"}</th>{data.months.map(m => {
        const c = matrix.get(`${u.id}/${m.competency}`)!;
        return <td key={m.competency}><button className="sales-heat-cell" data-intensity={c.intensity}
          style={{ backgroundColor: `color-mix(in srgb, var(--brand-green-600) ${8 + intensity(c.intensity) * 30}%, var(--color-surface))` }}
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
  const scale = chartScale([...current, ...reference].map(p => p.cumulative).concat(estimate ?? "0.00"));
  const maxDay = Math.max(month?.days_in_month ?? 31, ...reference.map(p => p.day));
  const observed = current.at(-1);
  const selected = current.find(p => String(p.day) === day);
  return <Figure title="Acumulado diário e projeção" description={<>Competência {competency(daily.competency)} · referência {competency(daily.reference_month)}{daily.cutoff_day !== null && ` · corte até dia ${daily.cutoff_day}`}. Ajustes mensais não são distribuídos entre dias.</>}>
    <div className="sales-daily-metrics"><p>Acumulado observado: <strong>{observed ? money(observed.cumulative) : "Indisponível"}</strong></p><p>Projeção linear — estimativa: <strong>{money(estimate)}</strong></p></div>
    {!current.length && <p>Sem detalhamento diário observado nesta competência.</p>}
    <Chart label="Gráfico de acumulado diário" minimum={760}>{width => {
      const x = (d: number) => 110 + (d - 1) / (maxDay - 1) * (width - 160), y = scale.y;
      return <><Grid scale={scale} width={width} />
        <path className="sales-reference" d={path(reference.map(p => ({ x: x(p.day), y: y(p.cumulative) })))} />
        <path className="sales-line" d={path(current.map(p => ({ x: x(p.day), y: y(p.cumulative) })))} />
        {current.map(p => <Mark key={p.day} label={`Focar dia ${p.day}: ${money(p.total)} no dia · ${money(p.cumulative)} acumulado`} onFocus={() => onFocus(undefined, undefined, String(p.day))}>
          <circle className="sales-point" cx={x(p.day)} cy={y(p.cumulative)} r={p === observed ? 5 : 3} />
        </Mark>)}
        {observed && <text className="sales-value-label" x={x(observed.day)} y={Math.max(18, y(observed.cumulative) - 14)} textAnchor="middle">{compactMoney(observed.cumulative)}</text>}
        {estimate !== null && observed && month && <><path className="sales-projection" d={`M${x(observed.day)},${y(observed.cumulative)} L${x(month.days_in_month)},${y(estimate)}`} />
          <text className="sales-value-label" x={x(month.days_in_month)} y={Math.max(18, y(estimate) - 14)} textAnchor="end">Estimativa {compactMoney(estimate)}</text></>}
        {daily.cutoff_day !== null && <><line className="sales-cutoff" x1={x(daily.cutoff_day)} x2={x(daily.cutoff_day)} y1="32" y2="258" /><text x={x(daily.cutoff_day)} y="302" textAnchor="middle">Corte {daily.cutoff_day}</text></>}
        {[1, 5, 10, 15, 20, 25, maxDay].map(d => <text key={d} x={x(d)} y="280" textAnchor="middle">{d}</text>)}
      </>;
    }}</Chart>
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
    <dl className="sales-definition sales-payment-definition"><div><dt>Stone</dt><dd>{money(mix.stone)} · {mix.stone_share_pct === null ? "Composição indisponível (base zero)" : <CompactPercent value={mix.stone_share_pct} />}</dd></div>
      <div><dt>PIX</dt><dd>{money(mix.pix)} · {mix.pix_share_pct === null ? "Composição indisponível (base zero)" : <CompactPercent value={mix.pix_share_pct} />}</dd></div></dl>
  </Figure>;
});
