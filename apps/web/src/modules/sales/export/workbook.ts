import type { Cell, Sheet } from "write-excel-file/browser";
import { cents, ExportError, reconcile } from "./api";
import type { SalesExport } from "./types";

/** Tipagem String impede fórmula, hyperlink e interpretação dos prefixos = + - @. */
export function textCell(value: string): Cell {
  if (value.length > 32767) throw new ExportError("Texto excede o limite de uma célula Excel.");
  // XML 1.0 não admite estes controles. Torna a substituição visível; mantém Unicode/tab/newline.
  const safe = Array.from(value, c => {
    const n = c.codePointAt(0)!;
    // O writer também remove U+FFFD; marcá-lo evita desaparecimento silencioso.
    return (n < 32 && ![9, 10, 13].includes(n)) || (n >= 0xd800 && n <= 0xdfff)
      || [0xfffd, 0xfffe, 0xffff].includes(n) ? "□" : c;
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
const head = (...labels: string[]): Cell[] => labels.map(value => ({ type: String, value, fontWeight: "bold", backgroundColor: "#185C45", textColor: "#FFFFFF", height: 30, alignVertical: "center", wrap: true }));

export function exportSheets(report: SalesExport): Sheet<Blob>[] {
  reconcile(report);
  const units = new Map(report.units.map(u => [u.id, u]));
  const entries: Cell[][] = [
    [{ ...textCell("Gaúcha Alimentação — Lançamentos de Vendas"), columnSpan: 8, fontSize: 20, fontWeight: "bold", textColor: "#185C45", height: 42, alignVertical: "center" }],
    [{ ...textCell("Dados exportados diretamente do sistema. Valores em reais."), columnSpan: 8, textColor: "#52665D", height: 26 }],
    [{ ...textCell(`${report.mode === "full" ? "Histórico completo autorizado" : "Período filtrado"} · ${report.entry_count} lançamentos · Gerado em ${timestamp(report.checked_at)} (São Paulo)`), columnSpan: 8, backgroundColor: "#E8F1EC", height: 28 }],
    head("Data", "Unidade", "Código da unidade", "Forma de pagamento", "Valor (R$)", "Valor exato (BRL)", "Lançado por", "Última atualização (America/Sao_Paulo)"),
  ];
  const adjustments: Cell[][] = [head("Competência", "Unidade", "Código da unidade", "Forma de pagamento", "Valor do ajuste (R$)", "Valor exato (BRL)", "Justificativa", "ID do ajuste", "ID da unidade")];
  for (const r of report.rows) {
    const u = units.get(r.unit_id);
    if (!u) throw new ExportError("Unidade incompatível com a exportação.");
    const common = [textCell(r.kind === "entry" ? r.date.split("-").reverse().join("/") : `${r.date.slice(5, 7)}/${r.date.slice(0, 4)}`),
      textCell(u.name), textCell(u.code), textCell(r.payment_method), moneyCell(r.amount), textCell(r.amount)];
    if (r.kind === "entry") entries.push([...common, textCell(r.created_by_name?.trim() ? r.created_by_name : "Não identificado"), textCell(timestamp(r.updated_at!))]
      .map((cell, index) => ({ ...cell, backgroundColor: entries.length % 2 ? "#F1F6F3" : "#FFFFFF",
        bottomBorderColor: "#DCE5DF", bottomBorderStyle: "hair", height: 32,
        alignVertical: "center", wrap: index === 1 || index === 6, ...(index === 4 ? { align: "right" as const } : {}) })));
    else adjustments.push([...common, textCell(r.reason!), textCell(r.id), textCell(r.unit_id)]);
  }
  entries.push([textCell("Total exportado"), null, null, null, moneyCell(report.entry_total), textCell(report.entry_total), null, null]
    .map(cell => ({ ...cell, fontWeight: "bold", backgroundColor: "#DCEDE3", textColor: "#185C45", height: 32,
      topBorderColor: "#185C45", topBorderStyle: "thin", alignVertical: "center" })));
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
    pair("Controle de texto", "Textos tipados como String; controles XML inválidos e U+FFFD não suportado pelo writer substituídos por □."),
    ...report.units.map(u => pair(`Unidade ${u.code}`, `${u.name} · ${u.id} · ${u.active ? "ativa" : "inativa — histórico"} · ajustes ${u.adjustments_authorized ? "autorizados" : "não autorizados; não incluídos nos totais"}`)),
  ];
  const sheet = (name: string, data: Cell[][], widths: number[], stickyRowsCount = 1): Sheet<Blob> => ({
    sheet: name, data, stickyRowsCount, showGridLines: false, columns: widths.map(width => ({ width })),
  });
  return [sheet("Lançamentos", entries, [14, 36, 20, 22, 25, 25, 30, 34], 4),
    ...(report.adjustment_count ? [sheet("Ajustes mensais", adjustments, [16, 32, 20, 22, 25, 25, 56, 38, 38])] : []),
    sheet("Resumo", summary, [48, 110])];
}
export async function exportBlob(report: SalesExport): Promise<Blob> {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const blob = await writeExcelFile(exportSheets(report)).toBlob();
  if (blob.size > 20 * 1024 * 1024) throw new ExportError("Arquivo excede 20 MiB. Reduza o recorte e tente novamente.");
  return blob;
}
