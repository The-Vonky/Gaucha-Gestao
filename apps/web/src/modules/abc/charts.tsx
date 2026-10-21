import { useId, type ReactNode } from "react";
import type { ClassSplit, ErpClass } from "./types";
import { money, percent } from "./format";

/*
 * Small, dependency-free charts. Decimal strings become numbers ONLY to size marks; every
 * value shown as text is formatted from the exact string. Class colors (A/B/C) are validated
 * for color-vision deficiency and always appear next to their letter, never alone.
 */
const size = (v: string | null | undefined) => (v === null || v === undefined ? 0 : Math.max(0, Number(v)));

/** figure named by its caption (explicit aria-labelledby for assistive technologies). */
function Figure({ caption, children }: { caption: string; children: ReactNode }) {
  const id = useId();
  return (
    <figure className="abc-chart" aria-labelledby={id}>
      <figcaption id={id}>{caption}</figcaption>
      {children}
    </figure>
  );
}

export function ClassDot({ cls }: { cls: ErpClass | null }) {
  return cls ? <span className={`abc-dot class-${cls}`} aria-hidden="true" /> : null;
}

/** 100% bar of the financial share of each class, with a legend that carries all values. */
export function ClassShareBar({ classes, caption }: { classes: ClassSplit[]; caption: string }) {
  return (
    <Figure caption={caption}>
      <div className="abc-share-bar" aria-hidden="true">
        {classes.filter((c) => size(c.share) > 0).map((c) => (
          <span key={c.class} className={`class-${c.class}`} style={{ flexGrow: size(c.share) }}
            title={`Classe ${c.class}: ${percent(c.share)}`} />
        ))}
      </div>
      <ul className="abc-legend">
        {classes.map((c) => (
          <li key={c.class}>
            <ClassDot cls={c.class} />
            <strong>Classe {c.class}</strong>
            <span>{percent(c.share)} · {money(c.total)} · {c.count} {c.count === 1 ? "produto" : "produtos"}</span>
          </li>
        ))}
      </ul>
    </Figure>
  );
}

export type BarRow = { key: string; label: ReactNode; detail?: ReactNode; value: string; display: string; cls?: ErpClass | null };

/** Ranked horizontal bars (magnitude), one hue unless a class color identifies each row. */
export function BarList({ rows, caption }: { rows: BarRow[]; caption: string }) {
  const max = Math.max(...rows.map((r) => size(r.value)), 0);
  return (
    <Figure caption={caption}>
      <ol className="abc-bars">
        {rows.map((r) => (
          <li key={r.key}>
            <span className="abc-bar-label">
              {r.cls !== undefined && <ClassDot cls={r.cls} />}
              <span>{r.label}</span>
              {r.detail && <small>{r.detail}</small>}
            </span>
            <span className="abc-bar-track" aria-hidden="true">
              <span className={r.cls ? `class-${r.cls}` : ""} style={{ width: `${max ? (size(r.value) / max) * 100 : 0}%` }} />
            </span>
            <span className="abc-bar-value numeric">{r.display}</span>
          </li>
        ))}
      </ol>
    </Figure>
  );
}

/** Columns over time (one series). Values are direct-labeled; a table view sits below in each page. */
export function Columns({ points, caption }: { points: { key: string; label: string; value: string; display: string }[]; caption: string }) {
  const max = Math.max(...points.map((p) => size(p.value)), 0);
  const w = 64;
  const h = 160;
  return (
    <Figure caption={caption}>
      <div className="abc-columns-scroll" tabIndex={0} role="region" aria-label={caption}>
        <svg className="abc-columns" viewBox={`0 0 ${points.length * w} ${h + 44}`} role="img"
          style={{ width: "100%", minWidth: points.length * w, maxWidth: points.length * w * 1.6 }}
          aria-label={`${caption}: ${points.map((p) => `${p.label} ${p.display}`).join("; ")}`}>
          <line x1="0" x2={points.length * w} y1={h + 18} y2={h + 18} className="abc-axis" />
          {points.map((p, i) => {
            const bh = max ? Math.max(2, (size(p.value) / max) * h) : 2;
            return (
              <g key={p.key}>
                <title>{`${p.label}: ${p.display}`}</title>
                <rect x={i * w + 14} y={h + 18 - bh} width={w - 28} height={bh} rx="4" className="abc-column" />
                <text x={i * w + w / 2} y={h + 36} textAnchor="middle" className="abc-tick">{p.label}</text>
                <text x={i * w + w / 2} y={h + 12 - bh} textAnchor="middle" className="abc-value">{p.display}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </Figure>
  );
}

/** Signed contributions around a zero line: increase to the right, decrease to the left. */
export function Diverging({ rows, caption }: { rows: { key: string; label: string; value: string; display: string }[]; caption: string }) {
  const max = Math.max(...rows.map((r) => Math.abs(Number(r.value))), 0);
  return (
    <Figure caption={caption}>
      <ol className="abc-diverging">
        {rows.map((r) => {
          const v = Number(r.value);
          const width = max ? (Math.abs(v) / max) * 50 : 0;
          return (
            <li key={r.key}>
              <span className="abc-bar-label">{r.label}</span>
              <span className="abc-diverging-track" aria-hidden="true">
                <span className={v < 0 ? "down" : "up"} style={v < 0 ? { right: "50%", width: `${width}%` } : { left: "50%", width: `${width}%` }} />
              </span>
              <span className="abc-bar-value numeric">{r.display}</span>
            </li>
          );
        })}
      </ol>
      <p className="abc-legend-note">
        <span className="abc-swatch up" aria-hidden="true" /> aumenta o custo · <span className="abc-swatch down" aria-hidden="true" /> reduz o custo
      </p>
    </Figure>
  );
}

const KEYS = ["A", "B", "C", null] as const;
const name = (k: ErpClass | null) => (k ? `Classe ${k}` : "Sem classe");

/** ERP class (as printed) × calculated class: counts and totals per cell; the diagonal agrees. */
export function ClassMatrix({ cells }: { cells: { erp_class: ErpClass | null; calculated_class: ErpClass | null; count: number; total: string }[] }) {
  const at = (e: ErpClass | null, c: ErpClass | null) => cells.find((x) => x.erp_class === e && x.calculated_class === c);
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Classe do ERP por classe calculada">
      <table className="abc-matrix">
        <caption>Linhas: classe informada pelo ERP · Colunas: classe calculada (abc-70-90-inicio-v1)</caption>
        <thead>
          <tr><th scope="col">ERP \ Calculada</th>{KEYS.map((c) => <th key={String(c)} scope="col">{name(c)}</th>)}</tr>
        </thead>
        <tbody>
          {KEYS.map((e) => (
            <tr key={String(e)}>
              <th scope="row">{name(e)}</th>
              {KEYS.map((c) => {
                const x = at(e, c);
                return (
                  <td key={String(c)} className={`numeric${e && e === c ? " agree" : ""}`}>
                    {x ? <>{x.count}<br /><small>{money(x.total)}</small></> : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
