import { CLASSIFICATION_LABELS, RESPONSE_LABELS } from "../scoring";
import type { AuditReport, Counts, HistoryReport, InspectionReport, ReportInspection } from "./types";

// Every text value, including a leading =, +, - or @, has an explicit string
// type. Formula, hyperlink, image and feature APIs are intentionally unused.
export type Cell = { value: string; type: StringConstructor; fontWeight?: "bold" } |
  { value: number; type: NumberConstructor } | null;
type Sheet = { sheet: string; data: Cell[][] };
const s = (value: unknown): Cell => value === null || value === undefined ? null : { value: String(value), type: String };
const n = (value: number | null | undefined): Cell => value === null || value === undefined ? null : { value: Number(value), type: Number };
const row = (...values: Cell[]) => values;
const header = (...values: string[]) => values.map((value) => ({ value, type: String, fontWeight: "bold" as const }));
const pair = (label: string, value: Cell) => row(s(label), value);
const countColumns = (c: Counts) => [n(c.total), n(c.answered), n(c.unanswered), n(c.at), n(c.ap), n(c.nat), n(c.nap), n(c.applicable)];
const classification = (r: ReportInspection) => r.classification ? CLASSIFICATION_LABELS[r.classification] : r.status === "draft" ? "Parcial · em andamento" : "—";
const timestamp = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo",
}).format(new Date(value)) : "—";

export function sheets(report: AuditReport): Sheet[] {
  return report.kind === "inspection" ? inspectionSheets(report) : historySheets(report);
}
function inspectionSheets(r: InspectionReport): Sheet[] {
  const i = r.inspection;
  const resumo = [
    pair("Relatório", s("Auditoria")), pair("Versão do relatório", n(r.schema_version)),
    pair("Gerado em (UTC)", s(r.generated_at)), pair("Fuso de exibição", s(r.display_timezone)),
    pair("Gerado por", s(r.generated_by.name)), pair("ID de quem gerou", s(r.generated_by.id)),
    pair("Unidade", s(r.unit.name)), pair("Código da unidade", s(r.unit.code)), pair("ID da unidade", s(r.unit.id)),
    pair("ID da auditoria", s(i.id)), pair("Versão do template", s(i.template_version)),
    pair("Aplicação", s(i.applied_on)), pair("Visita anterior", s(i.previous_visit_on)),
    pair("Responsável", s(i.responsible_name)), pair("ID do responsável", s(i.responsible_id)),
    pair("Estado", s(i.status === "draft" ? "Rascunho" : "Finalizada")),
    pair("Progresso (%)", n(i.progress_percent)),
    ...Object.entries({ "Critérios": i.counts.total, "Respondidos": i.counts.answered,
      "Sem resposta": i.counts.unanswered, AT: i.counts.at, AP: i.counts.ap,
      NAT: i.counts.nat, NAP: i.counts.nap, "Aplicáveis": i.counts.applicable }).map(([key, value]) => pair(key, n(value))),
    pair(i.status === "draft" ? "Conformidade parcial (%)" : "Resultado final (%)", n(i.score)),
    pair("Classificação", s(classification(i))),
    pair("Finalizada em (São Paulo)", s(timestamp(i.finalized_at))),
    pair("Finalizada por", s(i.finalized_by_name)), pair("ID de quem finalizou", s(i.finalized_by)),
    pair("Versão da auditoria", n(i.version)), pair("Criada em (UTC)", s(i.created_at)),
    pair("Atualizada em (UTC)", s(i.updated_at)),
  ];
  const checklist: Cell[][] = [header("Seção (ordem)", "Seção", "Chave", "Número", "Critério", "Resposta", "Observação", "Versão da resposta", "Resposta atualizada em (UTC)")];
  for (const section of r.sections) for (const item of section.items) checklist.push(row(
    n(section.position), s(section.name), s(item.key), n(item.number), s(item.text),
    s(item.response ? `${item.response} · ${RESPONSE_LABELS[item.response]}` : "Sem resposta"),
    s(item.observation), n(item.version), s(item.updated_at),
  ));
  const secoes: Cell[][] = [header("Ordem", "Seção", "Total", "Respondidos", "Sem resposta", "AT", "AP", "NAT", "NAP", "Aplicáveis", "Conformidade (%)", "Seção completa", "Classificação da seção")];
  for (const section of r.sections) secoes.push(row(n(section.position), s(section.name),
    ...countColumns(section.counts), n(section.score), s(section.complete ? "Sim" : "Não"),
    s(section.classification ? CLASSIFICATION_LABELS[section.classification] : "—")));
  return [{ sheet: "Resumo", data: resumo }, { sheet: "Checklist", data: checklist }, { sheet: "Secoes", data: secoes }];
}
function historySheets(r: HistoryReport): Sheet[] {
  const historico: Cell[][] = [header("ID da auditoria", "ID da unidade", "Template", "Aplicação", "Visita anterior", "Responsável", "ID do responsável", "Estado", "Progresso (%)", "Total", "Respondidos", "Sem resposta", "AT", "AP", "NAT", "NAP", "Aplicáveis", "Conformidade parcial (%)", "Resultado final (%)", "Classificação", "Delta final (p.p.)", "Finalizada em (UTC)", "Versão", "Criada em (UTC)")];
  for (const i of r.records) historico.push(row(s(i.id), s(r.unit.id), s(i.template_version),
    s(i.applied_on), s(i.previous_visit_on), s(i.responsible_name), s(i.responsible_id),
    s(i.status === "draft" ? "Rascunho" : "Finalizada"), n(i.progress_percent),
    ...countColumns(i.counts), i.status === "draft" ? n(i.score) : null,
    i.status === "finalized" ? n(i.score) : null, s(classification(i)), n(i.delta_pp),
    s(i.finalized_at), n(i.version), s(i.created_at)));
  const metadados: Cell[][] = [pair("Relatório", s("Histórico de auditorias")),
    pair("Versão do relatório", n(r.schema_version)), pair("Unidade", s(r.unit.name)),
    pair("Código da unidade", s(r.unit.code)), pair("ID da unidade", s(r.unit.id)),
    pair("Aplicação desde (inclusive)", s(r.filters.from)), pair("Aplicação até (inclusive)", s(r.filters.to)),
    pair("Registros", n(r.record_count)), pair("Ordenação", s(r.ordering)),
    pair("Gerado em (UTC)", s(r.generated_at)), pair("Fuso de exibição", s(r.display_timezone)),
    pair("Gerado por", s(r.generated_by.name)), pair("ID de quem gerou", s(r.generated_by.id))];
  return [{ sheet: "Historico", data: historico }, { sheet: "Metadados", data: metadados }];
}

export async function workbookBlob(report: AuditReport): Promise<Blob> {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  return writeExcelFile(sheets(report)).toBlob();
}
