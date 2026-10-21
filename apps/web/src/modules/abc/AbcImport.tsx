import { useCallback, useId, useRef, useState, type DragEvent } from "react";
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

function Steps({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["Selecionar", "Validar", "Publicar"];
  return (
    <ol className="abc-steps" aria-label="Etapas da importação">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "todo";
        return (
          <li key={label} data-state={state} aria-current={state === "current" ? "step" : undefined}>
            <span className="abc-step-n numeric">{state === "done" ? <Icon name="check" /> : n}</span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

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
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const hint = useId();
  const reasonId = useId();
  const unit = r.data?.unit;

  async function choose(selected: File | null | undefined) {
    setPreview(null);
    setReadError("");
    setPublishError("");
    setAccepted(false);
    setFile(selected ?? null);
    if (!selected || !unit) return;
    const name = selected.name.toLowerCase();
    if (!name.endsWith(".xlsx")) {
      setReadError(
        name.endsWith(".xls")
          ? "O formato .xls (Excel 97-2003) não é aceito. Exporte o relatório do ERP em .xlsx."
          : "Selecione o arquivo .xlsx exportado do ERP.",
      );
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
    } catch (e) {
      // File problems become blockers in the preview; reaching here is a browser or code failure.
      console.error("Curva ABC: falha técnica na leitura da planilha", e);
      setReadError(api.readFailureMessage(e));
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
  const step: 1 | 2 | 3 = !preview ? 1 : preview.blocked ? 2 : 3;

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

  const drag = (over: boolean) => (e: DragEvent) => {
    e.preventDefault();
    if (!reading && !publishing) setDragging(over);
  };
  const counts = new Map<string, number>();
  for (const row of preview?.rows ?? []) counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);

  return (
    <>
      <nav className="breadcrumb" aria-label="Você está em">
        <Link to="/abc">Curva ABC</Link>
        <Icon name="chevronRight" />
        <Link to={`/abc/imports?unidade=${unitId}`}>{unit?.name ?? "Unidade"}</Link>
        <Icon name="chevronRight" />
        <span aria-current="page">Importar relatório</span>
      </nav>
      <PageTitle
        eyebrow="Custos · Curva ABC"
        title="Importar relatório"
        description="Envie a planilha do ERP, confira as validações e publique o período com segurança."
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
          <Steps current={step} />
          <div className="abc-import-grid">
            <section className="abc-section abc-import-select">
              <h2>1. Selecione a planilha</h2>
              <p className="muted">
                Relatório “Curva ABC Geral (Realizado)” da unidade {unit.code}, exportado do ERP em .xlsx.
              </p>
              <div
                className="upload-zone"
                data-dragging={dragging || undefined}
                onDragOver={drag(true)}
                onDragLeave={drag(false)}
                onDrop={(e) => {
                  drag(false)(e);
                  void choose(e.dataTransfer.files[0]);
                }}
              >
                <input
                  ref={input}
                  className="file-input"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  aria-label={`Relatório “Curva ABC Geral (Realizado)” da unidade ${unit.code}`}
                  tabIndex={-1}
                  onChange={(e) => {
                    void choose(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <span className="upload-icon">
                  <Icon name="upload" />
                </span>
                <div className="upload-text">
                  <button
                    type="button"
                    disabled={reading || publishing}
                    aria-describedby={hint}
                    onClick={() => input.current?.click()}
                  >
                    {file ? "Trocar planilha" : "Selecionar planilha"}
                  </button>
                  <p className="upload-hint" id={hint}>
                    Até 10 MB, sem fórmulas ou macros. Também é possível arrastar o arquivo para cá.
                  </p>
                </div>
              </div>
              <div className="abc-file-box">
                <span className="muted">Arquivo selecionado</span>
                <strong>{file ? file.name : "Nenhum arquivo selecionado"}</strong>
              </div>
              {readError && <Notice error>{readError}</Notice>}
              {preview && !preview.blocked && (
                <div className="abc-publish">
                  {existing && (
                    <>
                      <label htmlFor={reasonId}>Motivo da substituição (obrigatório)</label>
                      <textarea id={reasonId} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
                    </>
                  )}
                  {needsAcceptance && (
                    <label className="check">
                      <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                      <span>
                        Li os avisos{existing ? " e a substituição da revisão vigente" : ""} e confirmo a publicação.
                      </span>
                    </label>
                  )}
                  {publishError && <Notice error>{publishError}</Notice>}
                </div>
              )}
              <button
                type="button"
                className="primary abc-wide"
                disabled={!canPublish || publishing}
                onClick={() => void publish()}
              >
                <Icon name="upload" />
                {publishing ? "Publicando…" : "Publicar relatório"}
              </button>
            </section>

            <section className="abc-section abc-import-preview" aria-live="polite">
              <h2>2. Confira os dados</h2>
              <p className="muted">Revise os totais e as validações antes de publicar.</p>
              {reading && <LoadingState label="Lendo o arquivo…" />}
              {!reading && !preview && (
                <div className="abc-placeholder">
                  <Icon name="file" />
                  <strong>A prévia aparecerá aqui</strong>
                  <span>Selecione a planilha ao lado. A leitura é feita no seu navegador e nada é gravado nesta etapa.</span>
                </div>
              )}
              {preview && (
                <>
                  <div className="abc-metrics">
                    <Metric label="Competência" value={m?.start ? competency(m.start) : "—"} />
                    <Metric label="Total geral" value={money(preview.declaredTotal)} />
                    <Metric label="Soma dos produtos" value={money(preview.calculatedTotal)} />
                    <Metric
                      label="Diferença"
                      value={preview.declaredTotal && preview.calculatedTotal ? money(sub(preview.declaredTotal, preview.calculatedTotal)) : "—"}
                    />
                  </div>
                  <dl className="abc-facts">
                    <dt>Filial no arquivo</dt>
                    <dd>{m?.branchCode ? `${m.branchCode} — ${m.branchName ?? ""}` : "—"}</dd>
                    <dt>Modalidade</dt>
                    <dd>{m?.costBasis ? BASIS_LABEL[m.costBasis] : "Não reconhecida"}</dd>
                    <dt>Linhas</dt>
                    <dd>{[...counts].map(([k, n]) => `${KIND_LABEL[k] ?? k}: ${n}`).join(" · ")}</dd>
                  </dl>
                  {preview.blocked ? (
                    <Notice error>
                      O arquivo tem bloqueios e não pode ser publicado. Exporte o relatório novamente do ERP;
                      não edite a planilha para esconder divergências.
                    </Notice>
                  ) : (
                    <Notice tone="success">Validação concluída. Revise os avisos, se houver, e publique.</Notice>
                  )}
                  {existing && (
                    <Notice tone="warning">
                      Já existe a revisão {existing.revision_number} publicada para esta competência e modalidade.
                      Publicar cria a revisão {existing.revision_number + 1}; a anterior continua no histórico.
                    </Notice>
                  )}
                  {preview.issues.length > 0 && (
                    <>
                      <h3>
                        {plural(blockers.length, "bloqueio", "bloqueios")} · {plural(warnings.length, "aviso", "avisos")}
                      </h3>
                      <Table headers={["Tipo", "Mensagem", "Linha", "Célula"]}>
                        {preview.issues.map((i, n) => (
                          <tr key={n}>
                            <td>
                              {i.severity === "BLOCKER"
                                ? <Badge tone="danger" icon="error">Bloqueio</Badge>
                                : <Badge tone="warning" icon="warning">Aviso</Badge>}
                            </td>
                            <td title={warningText(i)}>{i.message}</td>
                            <td className="numeric">{i.row ?? "—"}</td>
                            <td>{i.cell ?? "—"}</td>
                          </tr>
                        ))}
                      </Table>
                    </>
                  )}
                </>
              )}
            </section>
          </div>

          <section className="abc-section">
            <h2>Relatórios publicados</h2>
            {r.data && !r.data.series.length ? (
              <p className="muted">Nenhum relatório publicado para esta unidade ainda.</p>
            ) : (
              <Table headers={["Competência", "Modalidade", "Revisão", "Total geral", "Produtos", "Publicado em"]}>
                {r.data?.series.map((s) => (
                  <tr key={s.series_id}>
                    <td>
                      <Link to={`/abc/revisions/${s.revision_id}`}>{competency(s.competency)}</Link>
                    </td>
                    <td>{BASIS_LABEL[s.cost_basis]}</td>
                    <td className="numeric">{s.revision_number}</td>
                    <td className="numeric">{money(s.declared_total)}</td>
                    <td className="numeric">{s.line_count}</td>
                    <td>{new Date(s.published_at).toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </Table>
            )}
          </section>
        </>
      )}
    </>
  );
}
