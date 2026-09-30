import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../core/auth/AuthProvider";
import { useResource } from "../../shared/useResource";
import { Icon } from "../../shared/icons";
import {
  Confirm,
  Metric,
  Notice,
  PageTitle,
  type BadgeTone,
} from "../../shared/ui";
import * as api from "./api";
import { ChecklistItem } from "./ChecklistItem";
import { useChecklistEvidence } from "./useChecklistEvidence";
import * as evidenceApi from "./evidence";
import { formatDate, Progress, StatusBadge } from "./Result";
import {
  CLASSIFICATION_LABELS,
  evaluate,
  formatScore,
  tally,
  type Classification,
} from "./scoring";
import { SectionNav } from "./SectionNav";
import type { Answer, ChecklistEvidence } from "./types";
import { ReportingActions } from "./reporting/ReportingActions";
/** Band colors exist only for a finalized result. */
const BAND_TONE: Record<Classification, BadgeTone> = {
  adequate: "success",
  partial: "warning",
  inadequate: "danger",
};
export function InspectionPage() {
  const { inspectionId = "" } = useParams();
  const auth = useAuth();
  const evidence = useChecklistEvidence(inspectionId);
  const [review,setReview]=useState<{inspectionId:string;version:number;rows:ChecklistEvidence[]}>();
  const reviewGeneration=useRef(0);
  const [finalPending,setFinalPending]=useState(0);
  const [preparing,setPreparing]=useState(false);
  const [evidenceError,setEvidenceError]=useState("");
  const [evidenceConflict,setEvidenceConflict]=useState(false);
  const r = useResource(
    useCallback(async () => {
      const summary = await api.inspection(inspectionId);
      if (!summary) return null;
      const [catalog, rows] = await Promise.all([
        api.checklist(summary.template_version),
        api.answers(inspectionId),
      ]);
      return { summary, ...catalog, rows };
    }, [inspectionId]),
  );
  const data = r.data;
  const [lifecycleTransition, setLifecycleTransition] = useState<{
    inspectionId: string;
    version: number;
  }>();
  useEffect(() => {
    if (lifecycleTransition && !r.loading &&
        data?.summary.id === lifecycleTransition.inspectionId &&
        data.summary.version > lifecycleTransition.version) {
      setLifecycleTransition(undefined);
    }
  }, [data, r.loading, lifecycleTransition]);
  // Saved rows apply only to the load they came from; a reload starts from server data.
  const [saved, setSaved] = useState<{
    from: typeof data;
    rows: Record<string, Answer>;
  }>();
  const [section, setSection] = useState("");
  const [action, setAction] = useState<"finalize" | "reopen">();
  const [stale, setStale] = useState(false);
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const onPending = useCallback((key: string, value: boolean) => {
    setPending((previous) => {
      const next = new Set(previous);
      if (value) next.add(key); else next.delete(key);
      return next;
    });
  }, []);
  useEffect(() => {
    reviewGeneration.current++;
    setLifecycleTransition(undefined);
    setPending(new Set());setAction(undefined);setReview(undefined);
    setFinalPending(0);setPreparing(false);setEvidenceError("");setEvidenceConflict(false);setStale(false);
    return () => { reviewGeneration.current++; };
  }, [inspectionId]);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    // Moving between sections puts keyboard/screen-reader focus on the new section.
    if (!moved.current) return;
    moved.current = false;
    heading.current?.focus();
  }, [section]);
  const loaded = useMemo(
    () => Object.fromEntries((data?.rows ?? []).map((a) => [a.item_key, a])),
    [data],
  );
  const answers = saved && saved.from === data ? saved.rows : loaded;
  const onChange = useCallback(
    (row: Answer) =>
      setSaved((s) => ({
        from: data,
        rows: {
          ...(s && s.from === data ? s.rows : loaded),
          [row.item_key]: row,
        },
      })),
    [data, loaded],
  );
  const reload = () => {
    reviewGeneration.current++;
    setReview(undefined);setAction(undefined);setPreparing(false);
    setStale(false);
    setEvidenceConflict(false);
    setEvidenceError("");
    evidence.reload();
    setPending(new Set());
    r.reload();
  };
  const results = useMemo(() => {
    if (!data) return null;
    const of = (keys: string[]) =>
      evaluate(tally(keys.map((k) => answers[k]?.response ?? null)));
    return {
      overall: of(data.items.map((i) => i.key)),
      sections: Object.fromEntries(
        data.sections.map((s) => [
          s.key,
          of(
            data.items.filter((i) => i.section_key === s.key).map((i) => i.key),
          ),
        ]),
      ),
    };
  }, [data, answers]);
  if (r.loading && !data) return <Notice>Carregando auditoria…</Notice>;
  if (r.error)
    return (
      <Notice error>
        {r.error} <button onClick={reload}>Tentar novamente</button>
      </Notice>
    );
  // Keep the previous summary out of the UI from acceptance through the fresh load.
  // A failed/manual reload preserves this guard; navigation clears it.
  if (lifecycleTransition?.inspectionId === inspectionId)
    return <Notice>Atualizando estado da auditoria…
      {!r.loading && <button onClick={reload}>Tentar novamente</button>}
    </Notice>;
  if (!data || !results)
    return (
      <>
        <PageTitle
          title="Auditoria indisponível"
          description="A auditoria não existe ou você não tem acesso a ela."
        />
        <Link className="quality-return" to="/audit">Voltar para Auditorias</Link>
      </>
    );
  const { summary, sections, items } = data;
  const scope = { unit_id: summary.unit_id };
  const draft = summary.status === "draft";
  const editable = draft && auth.can("audit.inspection.edit", scope);
  const overall = results.overall;
  const remaining = overall.tally.total - overall.tally.answered;
  const current = sections.find((s) => s.key === section) ?? sections[0];
  const index = sections.indexOf(current);
  const sectionResult = results.sections[current.key];
  const select = (key: string) => {
    moved.current = true;
    setSection(key);
  };
  const band = summary.final_classification;
  return (
    <>
      <nav className="breadcrumb" aria-label="Trilha">
        <Link to="/audit">Auditorias</Link> /{" "}
        <Link to={`/audit/units/${summary.unit_id}`}>{summary.unit_name}</Link>{" "}
        / <span>{formatDate(summary.applied_on)}</span>
      </nav>
      <header className="audit-hero">
        <div className="audit-hero-main">
          <p className="eyebrow">Auditoria · Checklist geral</p>
          <h1>{summary.unit_name}</h1>
          <ul className="audit-meta">
            <li>
              <StatusBadge status={summary.status} />
            </li>
            <li>
              <Icon name="calendar" />
              <span>
                Aplicação em{" "}
                <span className="numeric">
                  {formatDate(summary.applied_on)}
                </span>
              </span>
            </li>
            <li>
              <Icon name="user" />
              <span>Responsável: {summary.responsible_name}</span>
            </li>
            {summary.previous_visit_on && (
              <li>
                <Icon name="clock" />
                <span>
                  Visita anterior:{" "}
                  <span className="numeric">
                    {formatDate(summary.previous_visit_on)}
                  </span>
                </span>
              </li>
            )}
          </ul>
        </div>
        <section className="audit-hero-kpis" aria-label="Resumo da auditoria">
          <div className="metric audit-progress-kpi">
            <span className="metric-label">Progresso</span>
            <Progress
              answered={overall.tally.answered}
              total={overall.tally.total}
            />
          </div>
          {draft ? (
            <Metric
              label="Conformidade parcial"
              tone="info"
              value={formatScore(overall.score)}
              hint={
                overall.score === null
                  ? "Sem dados de conformidade"
                  : "Parcial · em andamento"
              }
            />
          ) : summary.final_score === null || !band ? (
            <Metric
              label="Resultado final"
              value="—"
              hint="Sem critérios aplicáveis"
            />
          ) : (
            <Metric
              label="Resultado final"
              tone={BAND_TONE[band]}
              value={formatScore(summary.final_score)}
              hint={CLASSIFICATION_LABELS[band]}
            />
          )}
        </section>
        <div className="audit-hero-actions">
          <ReportingActions kind="inspection" inspectionId={summary.id} unitId={summary.unit_id} blocked={pending.size > 0 || stale || r.loading} />
          {draft && auth.can("audit.inspection.finalize", scope) && (
            <button
              className="primary"
              disabled={remaining > 0 || stale || evidenceConflict || preparing || r.loading || summary.id!==inspectionId || pending.size>0}
              onClick={async () => {
                const generation=reviewGeneration.current;
                const id=summary.id,version=summary.version;
                setPreparing(true);setEvidenceError("");setReview(undefined);
                try {
                  // Review all criteria and bind this snapshot to its parent and lifecycle.
                  const [rows,count]=await Promise.all([evidenceApi.listEvidence(id),evidenceApi.pendingCount(id)]);
                  if(reviewGeneration.current!==generation)return;
                  setReview({inspectionId:id,version,rows});setFinalPending(count);setAction("finalize");
                } catch {
                  if(reviewGeneration.current===generation)setEvidenceError("Não foi possível revisar as evidências. Tente novamente antes de finalizar.");
                } finally { if(reviewGeneration.current===generation)setPreparing(false); }
              }}
            >
              Finalizar
            </button>
          )}
          {!draft && auth.can("audit.inspection.reopen", scope) && (
            <button onClick={() => setAction("reopen")}>Reabrir</button>
          )}
          {auth.can("action_plan.read", scope) && (
            <Link
              className="audit-plans-link"
              to={`/action-plans?inspection=${summary.id}`}
            >
              Planos de ação desta auditoria
            </Link>
          )}
        </div>
      </header>
      {evidenceError && <Notice error>{evidenceError}</Notice>}
      {evidenceConflict && <Notice error>O conjunto de evidências foi alterado. <button onClick={reload}>Recarregar evidências e revisar</button></Notice>}
      {Object.keys(evidence.uploads).length>0 && <Notice tone="warning">Há envios de evidência pendentes. Eles não entram no conjunto disponível e não poderão ser confirmados após a finalização.</Notice>}
      {stale && (
        <Notice error>
          Esta auditoria foi alterada em outra sessão.{" "}
          <button onClick={reload}>Atualizar</button>
        </Notice>
      )}
      {draft &&
        remaining > 0 &&
        auth.can("audit.inspection.finalize", scope) && (
          <p className="muted audit-hint">
            Responda todos os critérios para finalizar ({remaining} restantes).
          </p>
        )}
      {!draft && (
        <Notice>
          Auditoria finalizada em{" "}
          {new Date(summary.finalized_at!).toLocaleString("pt-BR")}. Somente
          leitura.
        </Notice>
      )}
      {draft && !editable && (
        <Notice>Você pode consultar esta auditoria, mas não editá-la.</Notice>
      )}
      <div className="audit-layout">
        <SectionNav
          sections={sections.map((s) => ({
            key: s.key,
            position: s.position,
            name: s.name,
            answered: results.sections[s.key].tally.answered,
            total: results.sections[s.key].tally.total,
          }))}
          current={current.key}
          answered={overall.tally.answered}
          total={overall.tally.total}
          onSelect={select}
        />
        <section
          className="audit-checklist"
          aria-labelledby="audit-section-title"
        >
          <header className="audit-section-head">
            <h2 id="audit-section-title" ref={heading} tabIndex={-1}>
              {current.position}. {current.name}
            </h2>
            <p className="numeric">
              {sectionResult.tally.answered}/{sectionResult.tally.total}{" "}
              respondidos · {formatScore(sectionResult.score)}{" "}
              {sectionResult.classification
                ? `· ${CLASSIFICATION_LABELS[sectionResult.classification]}`
                : sectionResult.complete
                  ? "· Sem critérios aplicáveis"
                  : sectionResult.score !== null
                    ? "· Parcial"
                    : ""}
            </p>
          </header>
          <ol className="audit-items">
            {items
              .filter((i) => i.section_key === current.key)
              .map((item) =>
                answers[item.key] ? (
                  <ChecklistItem
                    key={item.key}
                    item={item}
                    row={answers[item.key]}
                    editable={editable && !stale}
                    evidenceEditable={editable && !stale && !action}
                    evidence={evidence}
                    onChange={onChange}
                    onPending={onPending}
                    onConflict={() => void refreshSummary()}
                  />
                ) : null,
              )}
          </ol>
          <div className="actions audit-pager">
            <button
              type="button"
              disabled={index <= 0}
              onClick={() => select(sections[index - 1].key)}
            >
              Seção anterior
            </button>
            <button
              type="button"
              disabled={index >= sections.length - 1}
              onClick={() => select(sections[index + 1].key)}
            >
              Próxima seção
            </button>
          </div>
        </section>
      </div>
      {action && (
        <Confirm
          title={
            action === "finalize" ? "Finalizar auditoria" : "Reabrir auditoria"
          }
          description={
            action === "finalize"
              ? `O resultado será calculado pelo servidor e a auditoria ficará somente leitura. Esta finalização considera ${review?.rows.length??0} evidência(s) disponível(is) em toda a auditoria. ${finalPending>0||Object.keys(evidence.uploads).length>0?"Há envios pendentes; eles não entrarão no conjunto e não poderão ser confirmados após finalizar.":""}`
              : "A auditoria voltará a ficar editável. As respostas serão preservadas e o resultado final será removido até nova finalização."
          }
          onClose={() => setAction(undefined)}
          onConfirm={async () => {
            const generation = reviewGeneration.current;
            try {
              if(action==="finalize") {
                if(!review||review.inspectionId!==inspectionId||review.inspectionId!==summary.id||review.version!==summary.version)
                  throw new Error("Recarregue a auditoria e revise as evidências antes de finalizar.");
                await api.finalize(review.inspectionId,review.version,review.rows.map(e=>e.id));
              }
              else await api.reopen(summary.id,summary.version);
              if (reviewGeneration.current !== generation) return;
              setLifecycleTransition({
                inspectionId: summary.id,
                version: summary.version,
              });
              reload();
            } catch(error) {
              if(action==="finalize" && (error as {code?:string})?.code==="40001"){
                setEvidenceConflict(true);setStale(true);setAction(undefined);
              }
              throw error;
            }
          }}
        >
          {action==="finalize" && review && <div className="audit-evidence-review">
            <h3>Evidências incluídas nesta finalização</h3>
            {review.rows.length===0?<p>Nenhuma evidência disponível.</p>:<ul aria-label="Conjunto completo de evidências">
              {review.rows.map(e=><li key={e.id}>
                <strong>{e.original_name}</strong>
                <span>Critério {items.find(i=>i.key===e.item_key)?.number??e.item_key} · {evidenceApi.typeLabel(e.content_type)} · {evidenceApi.formatSize(e.size_bytes)}</span>
                <span>{e.uploaded_by_name} · {new Date(e.uploaded_at).toLocaleString("pt-BR")}</span>
              </li>)}
            </ul>}
          </div>}
        </Confirm>
      )}
    </>
  );
  async function refreshSummary() {
    // A conflict may also mean the lifecycle changed; block edits until the user reloads.
    try {
      const latest = await api.inspection(inspectionId);
      if (
        !latest ||
        latest.version !== summary.version ||
        latest.status !== summary.status
      )
        setStale(true);
    } catch {
      setStale(true);
    }
  }
}
