import type { Cell, Sheet } from "write-excel-file/browser";
import { cents, ExportError, reconcile } from "./api";
import type { SalesExport } from "./types";

/** Tipagem String impede fórmula, hyperlink e interpretação dos prefixos = + - @. */
export function textCell(value: string): Cell {
  if (value.length > 32767) throw new ExportError("Texto excede o limite de uma célula Excel.");
  // XML 1.0 não admite estes controles. Torna a substituição visível; mantém Unicode/tab/newline.
  const safe = Array.from(value, c => {
    const n = c.codePointAt(0)!;
    return (n < 32 && ![9, 10, 13].includes(n)) || (n >= 0xd800 && n <= 0xdfff) || n === 0xfffe || n === 0xffff ? "□" : c;
  }).join("");
  return { type: String, value: safe };
}
/** Única conversão de dinheiro para Number: fronteira de célula, jamais para somar.
 * Excel tem 15 algarismos significativos. Rejeitar conversão que não faça roundtrip.
 * Texto decimal exato acompanha cada célula monetária, inclusive as numéricas.
 */
export function moneyCell(value: string): Cell {
  const integer = cents(value);
  if (integer.toString().length <= 15) {
    const numeric = Number(value);
    if (numeric.toFixed(2) === value && Number(numeric.toPrecision(15)).toFixed(2) === value)
      return { type: Number, value: numeric, format: '"R$" #,##0.00' };
  }
  return textCell(value);
}
const timestamp = (value: string) => new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo",
}).format(new Date(value));
const head = (...labels: string[]): Cell[] => labels.map(value => ({ type: String, value, fontWeight: "bold", backgroundColor: "#DFEAE5", wrap: true }));

export function exportSheets(report: SalesExport): Sheet<Blob>[] {
  reconcile(report);
  const units = new Map(report.units.map(u => [u.id, u]));
  const entries: Cell[][] = [head("Data", "Unidade", "Código da unidade", "Forma de pagamento", "Valor (R$)", "Valor exato (BRL)", "ID do lançamento", "ID da unidade", "Versão", "Atualizado em (America/Sao_Paulo)")];
  const adjustments: Cell[][] = [head("Competência", "Unidade", "Código da unidade", "Forma de pagamento", "Valor do ajuste (R$)", "Valor exato (BRL)", "Justificativa", "ID do ajuste", "ID da unidade")];
  for (const r of report.rows) {
    const u = units.get(r.unit_id);
    if (!u) throw new ExportError("Unidade incompatível com a exportação.");
    const common = [textCell(r.kind === "entry" ? r.date.split("-").reverse().join("/") : `${r.date.slice(5, 7)}/${r.date.slice(0, 4)}`),
      textCell(u.name), textCell(u.code), textCell(r.payment_method), moneyCell(r.amount), textCell(r.amount)];
    if (r.kind === "entry") entries.push([...common, textCell(r.id), textCell(r.unit_id),
      { type: Number, value: r.version! }, textCell(timestamp(r.updated_at!))]);
    else adjustments.push([...common, textCell(r.reason!), textCell(r.id), textCell(r.unit_id)]);
  }
  const pair = (name: string, value: string): Cell[] => [textCell(name), textCell(value)];
  const summary: Cell[][] = [head("Contexto", "Valor"),
    pair("Exportação", report.mode === "full" ? "Histórico completo autorizado" : "Período filtrado"),
    pair("Data inicial aplicada (inclusive)", report.filters.from ?? "Sem limite inicial"),
    pair("Data final aplicada (inclusive)", report.filters.to ?? "Sem limite final"),
    pair("Escopo financeiro", report.filters.method ?? "Stone + PIX"),
    pair("Gerado em (America/Sao_Paulo)", timestamp(report.checked_at)),
    pair("Fuso de apresentação", "America/Sao_Paulo"),
    pair("Quantidade de lançamentos ativos", String(report.entry_count)), pair("Quantidade de ajustes", String(report.adjustment_count)),
    [textCell("Total de lançamentos (R$)"), moneyCell(report.entry_total)], pair("Total de lançamentos exato (BRL)", report.entry_total),
    [textCell("Total de ajustes (R$)"), moneyCell(report.adjustment_total)], pair("Total de ajustes exato (BRL)", report.adjustment_total),
    [textCell("Total consolidado (R$)"), moneyCell(report.total)], pair("Total consolidado exato (BRL)", report.total),
    pair("Primeiro / último lançamento", `${report.entry_from ?? "Sem dados"} / ${report.entry_to ?? "Sem dados"}`),
    pair("Primeira / última competência de ajuste", `${report.adjustment_from?.slice(0, 7) ?? "Sem dados"} / ${report.adjustment_to?.slice(0, 7) ?? "Sem dados"}`),
    pair("Reconciliação independente em centavos", "0 centavos de diferença (linhas × totais SQL)"),
    pair("Consistência", "Conjunto conferido entre páginas e revalidado antes do download; mutações posteriores não atualizam este arquivo."),
    pair("Precisão Excel", "Até 15 algarismos e roundtrip em centavos: célula numérica. Demais valores: texto decimal. Colunas exatas são texto BRL; sem fórmulas."),
    pair("Ajustes mensais", "Somente competências inteiras cobertas pelas datas aplicadas e unidades com leitura gerencial. Sem rateio diário."),
    pair("Limites", "20.000 registros; 1.000 unidades; 8 MiB de dados; arquivo até 20 MiB. Sem totais parciais."),
    pair("Controle de texto", "Textos tipados como String; controles inválidos em XML substituídos por □."),
    ...report.units.map(u => pair(`Unidade ${u.code}`, `${u.name} · ${u.id} · ${u.active ? "ativa" : "inativa — histórico"} · ajustes ${u.adjustments_authorized ? "autorizados" : "não autorizados; não incluídos nos totais"}`)),
  ];
  const sheet = (name: string, data: Cell[][], widths: number[]): Sheet<Blob> => ({
    sheet: name, data, stickyRowsCount: 1, showGridLines: false, columns: widths.map(width => ({ width })),
  });
  return [sheet("Lançamentos", entries, [14, 32, 20, 22, 25, 25, 38, 38, 12, 32]),
    ...(report.adjustment_count ? [sheet("Ajustes mensais", adjustments, [16, 32, 20, 22, 25, 25, 56, 38, 38])] : []),
    sheet("Resumo", summary, [48, 110])];
}
export async function exportBlob(report: SalesExport): Promise<Blob> {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const blob = await writeExcelFile(exportSheets(report)).toBlob();
  if (blob.size > 20 * 1024 * 1024) throw new ExportError("Arquivo excede 20 MiB. Reduza o recorte e tente novamente.");
  return blob;
}
