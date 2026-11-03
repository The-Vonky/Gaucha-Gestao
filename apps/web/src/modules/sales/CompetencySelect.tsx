import { useState } from "react";

export const competencyMonths = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export function competencyLabel(value: string | null) {
  if (!value) return "Indisponível";
  return `${competencyMonths[Number(value.slice(5, 7)) - 1]?.slice(0, 3)}/${value.slice(0, 4)}`;
}

/** Seleção civil, sem restringir anos/meses pela existência de movimento financeiro. */
export function CompetencySelect({ label, name, value, onChange, anchors }: {
  label: string; name: string; value: string; onChange: (value: string) => void; anchors: string[];
}) {
  const valid = /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) > 0;
  const year = valid ? Number(value.slice(0, 4)) : new Date().getFullYear();
  const [center, setCenter] = useState(year);
  const start = Math.max(1, center - 10), end = Math.min(9999, center + 10);
  const years = [...new Set([year, ...anchors.map(v => Number(v.slice(0, 4))).filter(v => Number.isInteger(v) && v >= 1 && v <= 9999),
    ...Array.from({ length: end - start + 1 }, (_, i) => start + i)])].sort((a, b) => a - b);
  const month = valid ? value.slice(5, 7) : "";
  return <fieldset className="sales-competency"><legend>{label}</legend>
    <input type="hidden" name={name} value={value} />
    <div className="sales-competency-controls">
      <select aria-label={`Mês da ${label.toLowerCase()}`} required value={month} onChange={e => onChange(`${String(year).padStart(4, "0")}-${e.target.value}`)}>
        {!valid && <option value="">Mês inválido</option>}
        {competencyMonths.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
      </select>
      <select aria-label={`Ano da ${label.toLowerCase()}`} required value={valid ? String(year) : ""} onChange={e => {
        if (e.target.value === "previous") setCenter(Math.max(11, center - 20));
        else if (e.target.value === "next") setCenter(Math.min(9989, center + 20));
        else { setCenter(Number(e.target.value)); onChange(`${e.target.value.padStart(4, "0")}-${month || "01"}`); }
      }}>
        {!valid && <option value="">Ano inválido</option>}
        {start > 1 && <option value="previous">← Anos anteriores</option>}
        {years.map(y => <option key={y} value={String(y)}>{String(y).padStart(4, "0")}</option>)}
        {end < 9999 && <option value="next">Anos posteriores →</option>}
      </select>
    </div>
  </fieldset>;
}
