import { useCallback, useId, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { today } from "../../shared/dates";
import { Icon } from "../../shared/icons";
import { plural } from "../../shared/plural";
import { useResource } from "../../shared/useResource";
import { Badge, EmptyState, LoadingState, Metric, Notice, PageTitle, Table } from "../../shared/ui";
import * as api from "./api";
import { BASIS_LABEL, competency, money } from "./format";
import { sub } from "./import/decimal";
import { buildPayload, parseReport, warningText, type Preview } from "./import/parser";

const KIND_LABEL: Record<string, string> = {
  PRODUCT: "Produtos", GROUP: "Marcadores de curva", SUBTOTAL: "Subtotais", TOTAL: "Total geral",
  HEADER: "Cabeçalho", METADATA: "Metadados", EMPTY: "Vazias", UNKNOWN: "Não reconhecidas",
};

export function AbcImport() {
  const { unitId = "" } = useParams();
  const navigate = useNavigate();
  const load = useCallback(async () => {
    const [all, series] = await Promise.all([api.units(), api.unitSeries(unitId)]);
    return { unit: all.find((u) => u.unit_id === unitId) ?? null, series };
  }, [unitId]);
  const r = useResource(load);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
  const [reason, setReason] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const fileId = useId();
  const reasonId = useId();
  const unit = r.data?.unit;

  async function choose(selected: File | null) {
    setPreview(null);
    setReadError("");
    setPublishError("");
    setAccepted(false);
    setFile(selected);
    if (!selected || !unit) return;
    if (!selected.name.toLowerCase().endsWith(".xlsx")) {
      setReadError("Selecione o arquivo .xlsx exportado do ERP.");
      return;
    }
    if (selected.size > api.MAX_FILE_BYTES) {
      setReadError("O arquivo excede o limite de 10 MB.");
      return;
    }
    setReading(true);
    try {
      const bytes = new Uint8Array(await selected.arrayBuffer());
      setPreview(await parseReport(bytes, { expectedBranchCode: unit.code, today: today(), filename: selected.name }));
    } catch {
      setReadError("Não foi possível ler o arquivo. Verifique se é o relatório exportado do ERP.");
    } finally {
      setReading(false);
    }
  }

  const m = preview?.metadata;
  const existing = m?.start && m.costBasis
    ? r.data?.series.find((s) => s.competency === m.start && s.cost_basis === m.costBasis) ?? null
    : null;
  const blockers = preview?.issues.filter((i) => i.severity === "BLOCKER") ?? [];
  const warnings = preview?.issues.filter((i) => i.severity === "WARNING") ?? [];
  const needsAcceptance = warnings.length > 0 || existing !== null;
  const canPublish = !!preview && !preview.blocked && (!needsAcceptance || accepted) && (!existing || reason.trim() !== "");

  async function publish() {
    if (!preview || !file || !unit || !canPublish) return;
    setPublishing(true);
    setPublishError("");
    try {
      const payload = await buildPayload(preview);
      const id = await api.publish({
        unitId: unit.unit_id,
        file,
        payload,
        expectedVersion: existing?.version ?? 0,
        reason: existing ? reason.trim() : null,
        acceptWarnings: needsAcceptance && accepted,
      });
      navigate(`/abc/revisions/${id}`);
    } catch (e) {
      setPublishError(api.abcMessage(e));
      // A concurrent publication changes the series version: reload before retrying.
      if ((e as { code?: string } | null)?.code === "40001") r.reload();
    } finally {
      setPublishing(false);
    }
  }

  const counts = new Map<string, number>();
  for (const row of preview?.rows ?? []) counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);

  return (
    <>
      <nav className="breadcrumb" aria-label="Você está em">
        <Link to="/abc">Curva ABC</Link>
        <Icon name="chevronRight" />
        <Link to={`/abc/units/${unitId}`}>{unit?.name ?? "Unidade"}</Link>
        <Icon name="chevronRight" />
        <span aria-current="page">Importar relatório</span>
      </nav>
      <PageTitle
        eyebrow="Custos · Curva ABC"
        title="Importar relatório"
        description="A prévia é feita no seu navegador. Nada é gravado até você publicar; o banco confere tudo de novo antes de aceitar."
      />
      {r.loading && <LoadingState label="Carregando unidade…" />}
      {r.error && <Notice error>{r.error}</Notice>}
      {r.data && (!unit || !unit.can_publish) && (
        <EmptyState title="Importação indisponível">
          Você não tem permissão para publicar relatórios desta unidade.
        </EmptyState>
      )}
      {unit?.can_publish && (
        <>
          <section className="abc-section">
            <label htmlFor={fileId}>Relatório “Curva ABC Geral (Realizado)” da unidade {unit.code}</label>
            <input
              id={fileId}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={reading || publishing}
              onChange={(e) => void choose(e.target.files?.[0] ?? null)}
            />
            <p className="muted">Somente o arquivo .xlsx exportado do ERP, até 10 MB, sem fórmulas ou macros.</p>
          </section>
          {reading && <LoadingState label="Lendo o arquivo…" />}
          {readError && <Notice error>{readError}</Notice>}
          {preview && (
            <>
              <section className="abc-metrics" aria-label="Resumo da prévia">
                <Metric label="Competência" value={m?.start ? competency(m.start) : "—"} />
                <Metric label="Total geral" value={money(preview.declaredTotal)} />
                <Metric label="Soma dos produtos" value={money(preview.calculatedTotal)} />
                <Metric
                  label="Diferença"
                  value={preview.declaredTotal && preview.calculatedTotal ? money(sub(preview.declaredTotal, preview.calculatedTotal)) : "—"}
                />
              </section>
              <section className="abc-section">
                <h2>Leitura</h2>
                <dl className="abc-facts">
                  <dt>Filial no arquivo</dt>
                  <dd>{m?.branchCode ? `${m.branchCode} — ${m.branchName ?? ""}` : "—"}</dd>
                  <dt>Modalidade</dt>
                  <dd>{m?.costBasis ? BASIS_LABEL[m.costBasis] : "Não reconhecida"}</dd>
                  <dt>Linhas</dt>
                  <dd>{[...counts].map(([k, n]) => `${KIND_LABEL[k] ?? k}: ${n}`).join(" · ")}</dd>
                </dl>
                {existing && (
                  <Notice tone="warning">
                    Já existe a revisão {existing.revision_number} publicada para esta competência e modalidade.
                    Publicar cria a revisão {existing.revision_number + 1}; a anterior continua no histórico.
                  </Notice>
                )}
              </section>
              {preview.issues.length > 0 && (
                <section className="abc-section">
                  <h2>
                    {plural(blockers.length, "bloqueio", "bloqueios")} · {plural(warnings.length, "aviso", "avisos")}
                  </h2>
                  <Table headers={["Tipo", "Mensagem", "Linha", "Célula"]}>
                    {preview.issues.map((i, n) => (
                      <tr key={n}>
                        <td>
                          {i.severity === "BLOCKER"
                            ? <Badge tone="danger" icon="error">Bloqueio</Badge>
                            : <Badge tone="warning" icon="warning">Aviso</Badge>}
                        </td>
                        <td>{i.message}</td>
                        <td className="numeric">{i.row ?? "—"}</td>
                        <td>{i.cell ?? "—"}</td>
                      </tr>
                    ))}
                  </Table>
                </section>
              )}
              {preview.blocked ? (
                <Notice error>
                  O arquivo tem bloqueios e não pode ser publicado. Exporte o relatório novamente do ERP;
                  não edite a planilha para esconder divergências.
                </Notice>
              ) : (
                <section className="abc-section">
                  <h2>Publicar</h2>
                  {existing && (
                    <>
                      <label htmlFor={reasonId}>Motivo da substituição (obrigatório)</label>
                      <textarea
                        id={reasonId}
                        maxLength={1000}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </>
                  )}
                  {needsAcceptance && (
                    <label className="check">
                      <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                      <span>
                        Li os avisos{existing ? " e a substituição da revisão vigente" : ""} e confirmo a publicação.
                        {warnings.length > 0 && ` (${warnings.map(warningText).join("; ")})`}
                      </span>
                    </label>
                  )}
                  {publishError && <Notice error>{publishError}</Notice>}
                  <div className="actions">
                    <button type="button" className="primary" disabled={!canPublish || publishing} onClick={() => void publish()}>
                      {publishing ? "Publicando…" : "Publicar relatório"}
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
