import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../core/auth/AuthProvider";
import { useResource } from "../../shared/useResource";
import { Confirm, Notice, PageTitle } from "../../shared/ui";
import * as api from "./api";
import { ChecklistItem } from "./ChecklistItem";
import { formatDate, Progress, Result, StatusBadge } from "./Result";
import { CLASSIFICATION_LABELS, evaluate, formatScore, tally } from "./scoring";
import type { Answer } from "./types";
export function InspectionPage() {
  const { inspectionId = "" } = useParams();
  const auth = useAuth();
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
  // Saved rows apply only to the load they came from; a reload starts from server data.
  const [saved, setSaved] = useState<{
    from: typeof data;
    rows: Record<string, Answer>;
  }>();
  const [section, setSection] = useState("");
  const [action, setAction] = useState<"finalize" | "reopen">();
  const [stale, setStale] = useState(false);
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
    setStale(false);
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
  if (!data || !results)
    return (
      <>
        <PageTitle
          title="Auditoria indisponível"
          description="A auditoria não existe ou você não tem acesso a ela."
        />
        <Link to="/audit">Voltar para Auditorias</Link>
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
  return (
    <>
      <nav className="breadcrumb" aria-label="Trilha">
        <Link to="/audit">Auditorias</Link> /{" "}
        <Link to={`/audit/units/${summary.unit_id}`}>{summary.unit_name}</Link>{" "}
        / <span>{formatDate(summary.applied_on)}</span>
      </nav>
      <PageTitle
        title={`Auditoria · ${summary.unit_name}`}
        description={`Aplicação em ${formatDate(summary.applied_on)} · Responsável: ${summary.responsible_name}${summary.previous_visit_on ? ` · Visita anterior: ${formatDate(summary.previous_visit_on)}` : ""}`}
      >
        {draft && auth.can("audit.inspection.finalize", scope) && (
          <button
            className="primary"
            disabled={remaining > 0 || stale}
            onClick={() => setAction("finalize")}
          >
            Finalizar
          </button>
        )}
        {!draft && auth.can("audit.inspection.reopen", scope) && (
          <button onClick={() => setAction("reopen")}>Reabrir</button>
        )}
      </PageTitle>
      <section className="audit-summary" aria-label="Resumo da auditoria">
        <div>
          <span className="eyebrow">Situação</span>
          <StatusBadge status={summary.status} />
        </div>
        <div>
          <span className="eyebrow">Progresso</span>
          <Progress
            answered={overall.tally.answered}
            total={overall.tally.total}
          />
        </div>
        <div>
          <span className="eyebrow">Conformidade</span>
          {draft ? (
            <span className="audit-result">
              <strong>{formatScore(overall.score)}</strong>{" "}
              {overall.score === null
                ? "Sem dados de conformidade"
                : "Parcial · em andamento"}
            </span>
          ) : (
            <Result summary={summary} />
          )}
        </div>
      </section>
      {auth.can("action_plan.read", scope) && (
        <p>
          <Link to={`/action-plans?inspection=${summary.id}`}>
            Planos de ação desta auditoria
          </Link>
        </p>
      )}
      {stale && (
        <Notice error>
          Esta auditoria foi alterada em outra sessão.{" "}
          <button onClick={reload}>Atualizar</button>
        </Notice>
      )}
      {draft &&
        remaining > 0 &&
        auth.can("audit.inspection.finalize", scope) && (
          <p className="muted">
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
        <nav className="audit-sections" aria-label="Seções do checklist">
          <label className="audit-section-select">
            Seção
            <select
              value={current.key}
              onChange={(e) => setSection(e.target.value)}
            >
              {sections.map((s) => {
                const x = results.sections[s.key];
                return (
                  <option key={s.key} value={s.key}>
                    {s.position}. {s.name} ({x.tally.answered}/{x.tally.total})
                  </option>
                );
              })}
            </select>
          </label>
          <ol>
            {sections.map((s) => {
              const x = results.sections[s.key];
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    aria-current={s.key === current.key ? "true" : undefined}
                    onClick={() => setSection(s.key)}
                  >
                    <span>
                      {s.position}. {s.name}
                    </span>
                    <small>
                      {x.tally.answered}/{x.tally.total} ·{" "}
                      {formatScore(x.score)}
                    </small>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <section
          className="audit-checklist"
          aria-labelledby="audit-section-title"
        >
          <header className="audit-section-head">
            <h2 id="audit-section-title">
              {current.position}. {current.name}
            </h2>
            <p>
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
                    onChange={onChange}
                    onConflict={() => void refreshSummary()}
                  />
                ) : null,
              )}
          </ol>
          <div className="actions">
            <button
              type="button"
              disabled={index <= 0}
              onClick={() => setSection(sections[index - 1].key)}
            >
              Seção anterior
            </button>
            <button
              type="button"
              disabled={index >= sections.length - 1}
              onClick={() => setSection(sections[index + 1].key)}
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
              ? "O resultado será calculado pelo servidor e a auditoria ficará somente leitura."
              : "A auditoria voltará a ficar editável. As respostas serão preservadas e o resultado final será removido até nova finalização."
          }
          onClose={() => setAction(undefined)}
          onConfirm={async () => {
            await (action === "finalize" ? api.finalize : api.reopen)(
              summary.id,
              summary.version,
            );
            reload();
          }}
        />
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
