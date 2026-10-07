import { useLayoutEffect, useRef, useState } from "react";
import { formatDate } from "./Result";
import { CLASSIFICATION_LABELS, formatScore, type Classification } from "./scoring";
export type TrendPoint = {
  id: string;
  applied_on: string;
  score: number;
  classification: Classification;
};
/** Final result thresholds (scoring rule): bands start at 51% and 76%. */
const THRESHOLDS = [51, 76];
const PAD = { top: 12, right: 16, bottom: 28, left: 40 };
/**
 * Evolution of finalized scores (single series, oldest → newest). Inline SVG at the
 * container's real width (no text scaling), hairline reference lines at the band
 * thresholds, band-colored 8px points with a surface ring, a hover/focus tooltip and
 * an equivalent table for assistive tech. Points are evenly spaced by inspection.
 */
export function ScoreTrend({
  points,
  height = 220,
  label,
}: {
  points: TrendPoint[];
  height?: number;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Drawing width (viewBox); the element itself is always 100% of its container.
  const [width, setWidth] = useState(320);
  const [active, setActive] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    // Measure before paint so the first frame never exceeds the container.
    if (el.clientWidth) setWidth(Math.max(240, el.clientWidth));
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(240, Math.round(entry.contentRect.width))),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (points.length === 1 ? plotW / 2 : (plotW * i) / (points.length - 1));
  const y = (score: number) => PAD.top + plotH - (plotH * score) / 100;
  // Thin the date labels so they never collide (~72px per label).
  const every = Math.max(1, Math.ceil((points.length * 72) / Math.max(plotW, 1)));
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.score)}`).join(" ");
  const shown = active === null ? null : points[active];
  return (
    <figure className="score-trend" ref={box}>
      <svg
        width="100%"
        height={height}
        preserveAspectRatio="none"
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label={label}
        onPointerLeave={() => setActive(null)}
      >
        {[0, ...THRESHOLDS, 100].map((t) => (
          <g key={t} className={THRESHOLDS.includes(t) ? "trend-threshold" : "trend-grid"}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {t}%
            </text>
          </g>
        ))}
        {shown && (
          <line
            className="trend-crosshair"
            x1={x(active!)}
            x2={x(active!)}
            y1={PAD.top}
            y2={PAD.top + plotH}
          />
        )}
        {points.length > 1 && <path className="trend-line" d={path} />}
        {points.map((p, i) => (
          <g
            key={p.id}
            className={`trend-point ${p.classification}`}
            tabIndex={0}
            role="img"
            aria-label={`${formatDate(p.applied_on)}: ${formatScore(p.score)}, ${CLASSIFICATION_LABELS[p.classification]}`}
            onPointerEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          >
            {/* Hit area bigger than the mark. */}
            <circle className="trend-hit" cx={x(i)} cy={y(p.score)} r={12} />
            <circle className="trend-dot" cx={x(i)} cy={y(p.score)} r={4} />
          </g>
        ))}
        {points.map((p, i) =>
          i % every === 0 || i === points.length - 1 ? (
            <text
              key={p.id}
              className="trend-date"
              x={x(i)}
              y={height - 8}
              textAnchor={points.length === 1 ? "middle" : i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
            >
              {formatDate(p.applied_on)}
            </text>
          ) : null,
        )}
      </svg>
      {shown && (
        <div
          className="trend-tooltip"
          role="status"
          style={{
            left: Math.min(Math.max(x(active!), 80), width - 80),
            top: Math.max(y(shown.score) - 12, 0),
          }}
        >
          <strong className="numeric">{formatScore(shown.score)}</strong>
          <span>{CLASSIFICATION_LABELS[shown.classification]}</span>
          <span className="numeric">{formatDate(shown.applied_on)}</span>
        </div>
      )}
      {/* Tables ignore width/overflow clipping: hide the wrapper, not the table. */}
      <div className="visually-hidden">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">Data da auditoria</th>
              <th scope="col">Resultado</th>
              <th scope="col">Classificação</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.id}>
                <td>{formatDate(p.applied_on)}</td>
                <td>{formatScore(p.score)}</td>
                <td>{CLASSIFICATION_LABELS[p.classification]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
/** Finalized inspections with a score, oldest first, as trend points. */
export function trendPoints(
  rows: { id: string; status: string; applied_on: string; final_score: number | null; final_classification: Classification | null }[],
): TrendPoint[] {
  return rows
    .filter((r) => r.status === "finalized" && r.final_score !== null && r.final_classification)
    .map((r) => ({
      id: r.id,
      applied_on: r.applied_on,
      score: r.final_score!,
      classification: r.final_classification!,
    }))
    .reverse();
}
