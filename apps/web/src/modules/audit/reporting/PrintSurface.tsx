import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CLASSIFICATION_LABELS, formatScore, RESPONSE_LABELS } from "../scoring";
import type { AuditReport, Counts, ReportInspection } from "./types";
import "./print.css";

function date(value: string | null | undefined) {
  return value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
}
function instant(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "—";
}
function counts(c: Counts) {
  return `${c.answered}/${c.total} respondidos · AT ${c.at} · AP ${c.ap} · NAT ${c.nat} · NAP ${c.nap} · ${c.unanswered} sem resposta`;
}
function status(i: ReportInspection) {
  return i.status === "draft" ? "Rascunho · resultado parcial" : "Finalizada";
}
export function PrintSurface({ report, onClose }: { report: AuditReport; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const print = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const first = close.current, last = print.current;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);
  return createPortal(<div className="report-overlay" role="dialog" aria-modal="true" aria-label="Prévia de impressão">
    <div className="report-actions">
      <button ref={close} onClick={onClose}>Fechar relatório</button>
      <button ref={print} className="primary" onClick={() => window.print()}>Imprimir / Salvar como PDF</button>
    </div>
    <article className="report-page">
      <header className="report-head">
        <p>Gaúcha Gestão · Qualidade · Auditorias</p>
        <h1>{report.kind === "inspection" ? "Relatório de auditoria" : "Histórico de auditorias"}</h1>
        <p><strong>{report.unit.code} · {report.unit.name}</strong> · ID {report.unit.id}</p>
        <p>Gerado em {instant(report.generated_at)} (São Paulo) por {report.generated_by.name} · Versão do relatório {report.schema_version}</p>
      </header>
      {report.kind === "inspection" ? <>
        {report.inspection.status === "draft" && <p className="report-draft">RASCUNHO · RESULTADO PARCIAL</p>}
        <section className="report-context" aria-label="Dados da auditoria">
          <h2>Resumo</h2>
          <p>ID {report.inspection.id} · Template {report.inspection.template_version} · Versão {report.inspection.version}</p>
          <p>Aplicação: {date(report.inspection.applied_on)} · Visita anterior: {date(report.inspection.previous_visit_on)} · Responsável: {report.inspection.responsible_name} ({report.inspection.responsible_id})</p>
          <p>{status(report.inspection)} · {counts(report.inspection.counts)} · Progresso {report.inspection.progress_percent.toFixed(1)}%</p>
          <p>{report.inspection.status === "draft" ? "Conformidade parcial" : "Resultado final"}: {formatScore(report.inspection.score)} · {report.inspection.classification ? CLASSIFICATION_LABELS[report.inspection.classification] : "Sem classificação final"}</p>
          {report.inspection.finalized_at && <p>Finalizada em {instant(report.inspection.finalized_at)} por {report.inspection.finalized_by_name ?? "—"}</p>}
        </section>
        {report.sections.map((section) => <section key={section.key} className="report-section">
          <h2>{section.position}. {section.name}</h2>
          <p>{counts(section.counts)} · Conformidade {formatScore(section.score)} · Seção {section.complete ? "completa" : "em andamento"}</p>
          <ol>{section.items.map((item) => <li key={item.key}>
            <strong>{item.number}. {item.text}</strong>
            <p>Resposta: {item.response ? `${item.response} · ${RESPONSE_LABELS[item.response]}` : "Sem resposta"}</p>
            {item.observation && <p className="report-note">Observação: {item.observation}</p>}
          </li>)}</ol>
        </section>)}
      </> : <>
        <p>Aplicação desde: {date(report.filters.from)} · até: {date(report.filters.to)} (inclusive) · {report.record_count} registros</p>
        <p>Ordenação: {report.ordering}</p>
        {report.record_count === 0 && <p>Nenhuma auditoria no período selecionado.</p>}
        <table className="report-history"><thead><tr><th>Aplicação / ID</th><th>Responsável</th><th>Estado / progresso</th><th>Contagens</th><th>Conformidade / delta</th></tr></thead>
          <tbody>{report.records.map((i) => <tr key={i.id}>
            <td>{date(i.applied_on)}<small>{i.id}</small></td>
            <td>{i.responsible_name}</td><td>{status(i)}<small>{i.counts.answered}/{i.counts.total}</small></td>
            <td>{counts(i.counts)}</td><td>{formatScore(i.score)}<small>{i.classification ? CLASSIFICATION_LABELS[i.classification] : "Sem classificação final"}{i.delta_pp === null || i.delta_pp === undefined ? "" : ` · Δ ${i.delta_pp.toFixed(1)} p.p.`}</small></td>
          </tr>)}</tbody></table>
      </>}
    </article>
  </div>, document.body);
}
