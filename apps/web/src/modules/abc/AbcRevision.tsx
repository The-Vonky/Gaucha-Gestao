import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../shared/icons";
import { useResource } from "../../shared/useResource";
import { Badge, LoadingState, Metric, Notice, PageTitle, Pager, Table } from "../../shared/ui";
import * as api from "./api";
import { BASIS_LABEL, competency, formatDecimal, money, percent } from "./format";
import { sha256Hex } from "./import/contentHash";
import { buildPayload, parseReport } from "./import/parser";
import type { RevisionDetail } from "./types";

const PAGE = 100;

/** Re-parses the stored original in this browser and compares it with the publication. */
async function checkFile(d: RevisionDetail): Promise<boolean> {
  const bytes = await api.downloadOriginal(d.file.object_key);
  if ((await sha256Hex(bytes)) !== d.file.sha256) {
    await api.recordFileCheck(d.id, "0".repeat(64));
    return false;
  }
  // Far-future reference date: closure was already checked at publication.
  const preview = await parseReport(bytes, { expectedBranchCode: d.unit.code, today: "9999-12-31" });
  const hash = preview.blocked ? "0".repeat(64) : (await buildPayload(preview)).content_hash;
  return api.recordFileCheck(d.id, hash);
}

export function AbcRevision() {
  const { revisionId = "" } = useParams();
  const load = useCallback(() => api.revisionDetail(revisionId), [revisionId]);
  const r = useResource(load);
  const d = r.data;
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const [check, setCheck] = useState<"idle" | "running" | "ok" | "mismatch" | "error">("idle");
  const [downloadError, setDownloadError] = useState("");

  const lines = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (d?.lines ?? []).filter((l) => !t || l.code.toLowerCase().includes(t) || l.name.toLowerCase().includes(t));
  }, [d, term]);
  const byClass = useMemo(() => {
    const c = { A: 0, B: 0, C: 0 };
    for (const l of d?.lines ?? []) if (l.calculated_class) c[l.calculated_class]++;
    return c;
  }, [d]);

  async function runCheck() {
    if (!d) return;
    setCheck("running");
    try {
      setCheck((await checkFile(d)) ? "ok" : "mismatch");
    } catch (e) {
      console.error("Curva ABC: falha ao conferir o arquivo original", e);
      setCheck("error");
    }
  }
  async function download() {
    if (!d) return;
    setDownloadError("");
    try {
      const a = document.createElement("a");
      a.href = await api.downloadUrl(d.file.object_key, d.file.original_name);
      a.rel = "noopener";
      document.body.append(a);
      a.click();
      a.remove();
    } catch (e) {
      setDownloadError(api.abcMessage(e));
    }
  }

  return (
    <>
      <nav className="breadcrumb" aria-label="Você está em">
        <Link to="/abc">Curva ABC</Link>
        <Icon name="chevronRight" />
        {d ? <Link to={`/abc/imports?unidade=${d.unit.id}&modalidade=${d.series.cost_basis}`}>{d.unit.name}</Link> : <span>Unidade</span>}
        <Icon name="chevronRight" />
        <span aria-current="page">{d ? competency(d.series.competency) : "Revisão"}</span>
      </nav>
      {r.loading && <LoadingState label="Carregando relatório…" />}
      {r.error && <Notice error>{r.error}</Notice>}
      {d && (
        <>
          <PageTitle
            eyebrow={`Custos · Curva ABC · ${d.unit.name}`}
            title={`${competency(d.series.competency)} · revisão ${d.number}`}
            description={`${BASIS_LABEL[d.series.cost_basis]} (“${d.cost_basis_text}”). Publicado em ${new Date(d.published_at).toLocaleString("pt-BR")}${d.published_by ? ` por ${d.published_by}` : ""}.`}
          >
            <button type="button" onClick={() => void download()}>
              <Icon name="download" />
              Baixar original
            </button>
            <button type="button" disabled={check === "running"} onClick={() => void runCheck()}>
              <Icon name="check" />
              {check === "running" ? "Conferindo…" : "Conferir com o arquivo"}
            </button>
          </PageTitle>
          {!d.current && (
            <Notice tone="warning">Esta revisão foi substituída. Consulte a revisão vigente no histórico abaixo.</Notice>
          )}
          {downloadError && <Notice error>{downloadError}</Notice>}
          {check === "ok" && <Notice tone="success">O arquivo original reproduz exatamente esta publicação.</Notice>}
          {check === "mismatch" && (
            <Notice error>O arquivo original não reproduz esta publicação. A divergência foi registrada no log do sistema.</Notice>
          )}
          {check === "error" && <Notice error>Não foi possível conferir o arquivo. Tente novamente.</Notice>}
          <section className="abc-metrics" aria-label="Totais">
            <Metric label="Total geral (ERP)" value={money(d.declared_total)} />
            <Metric label="Soma dos produtos" value={money(d.calculated_total)} />
            <Metric label="Diferença" value={money(d.difference)} />
            <Metric label="Produtos" value={d.lines.length} hint={`A ${byClass.A} · B ${byClass.B} · C ${byClass.C}`} />
          </section>
          {d.reason && <Notice>Motivo desta revisão: {d.reason}</Notice>}
          {d.warnings.length > 0 && (
            <Notice tone="warning">Avisos aceitos na publicação: {d.warnings.join("; ")}</Notice>
          )}
          <section className="abc-section">
            <h2>Itens</h2>
            <p className="muted">
              Curva calculada pelo método <code>{d.abc_method}</code>: ordena por custo total e classifica pelo acumulado
              anterior ao item (A até 70%, B até 90%, C acima). A curva do ERP é exibida como veio no arquivo.
            </p>
            <label className="abc-search">
              Buscar por código ou produto
              <input type="search" value={term} onChange={(e) => { setTerm(e.target.value); setPage(0); }} />
            </label>
            <Table headers={["Código", "Produto", "UN", "Quantidade", "Custo unit.", "Custo total", "% do total", "Curva ERP", "Curva calculada"]}>
              {lines.slice(page * PAGE, (page + 1) * PAGE).map((l) => (
                <tr key={l.line_no}>
                  <td className="numeric">{l.code}</td>
                  <td>{l.name}</td>
                  <td>{l.unit}</td>
                  <td className="numeric">{formatDecimal(l.quantity, 3)}</td>
                  <td className="numeric">{formatDecimal(l.unit_cost, 4)}</td>
                  <td className="numeric">{money(l.total)}</td>
                  <td className="numeric">{percent(l.share)}</td>
                  <td>{l.erp_class ?? "—"}</td>
                  <td>
                    {l.calculated_class ? (
                      <Badge tone={l.calculated_class === l.erp_class ? "neutral" : "info"}>{l.calculated_class}</Badge>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </Table>
            <Pager page={page} count={lines.length} size={PAGE} onChange={setPage} />
          </section>
          <section className="abc-section">
            <h2>Histórico de revisões</h2>
            <Table headers={["Revisão", "Publicada em", "Total geral", "Motivo"]}>
              {d.history.map((h) => (
                <tr key={h.id}>
                  <td className="numeric">
                    {h.id === d.id ? <strong>{h.number}</strong> : <Link to={`/abc/revisions/${h.id}`}>{h.number}</Link>}
                  </td>
                  <td>{new Date(h.published_at).toLocaleString("pt-BR")}</td>
                  <td className="numeric">{money(h.declared_total)}</td>
                  <td>{h.reason ?? "Primeira publicação"}</td>
                </tr>
              ))}
            </Table>
            <p className="muted">
              Arquivo original: {d.file.original_name} · SHA-256 <code>{d.file.sha256}</code>
            </p>
          </section>
        </>
      )}
    </>
  );
}
