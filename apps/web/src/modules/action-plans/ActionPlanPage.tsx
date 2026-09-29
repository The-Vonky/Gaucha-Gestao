import { useCallback, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../core/auth/AuthProvider";
import { formatDate, today } from "../../shared/dates";
import { Icon } from "../../shared/icons";
import { useResource } from "../../shared/useResource";
import { Confirm, Form, Modal, Notice, PageTitle } from "../../shared/ui";
import * as api from "./api";
import { EvidenceList, EvidenceUpload } from "./PlanEvidence";
import { listEvidence, removeEvidence } from "./evidence";
import {
  EFFECTIVENESS_LABELS,
  isOverdue,
  missingForExecution,
  STATUS_LABELS,
} from "./lifecycle";
import { originLabel, PlanBadges } from "./PlanBadges";
import { PlanFields, readPlanValues } from "./PlanFields";
import type { Effectiveness, Evidence, Plan, PlanStatus } from "./types";
const TRANSITIONS: Record<PlanStatus, { to: PlanStatus; label: string }[]> = {
  pending: [
    { to: "in_progress", label: "Iniciar execução" },
    { to: "completed", label: "Concluir" },
  ],
  in_progress: [
    { to: "pending", label: "Voltar para pendente" },
    { to: "completed", label: "Concluir" },
  ],
  completed: [{ to: "in_progress", label: "Retomar execução" }],
};
const isConflict = (e: unknown) =>
  (e as { code?: string } | null)?.code === "40001";
/** verify_plan found a different evidence set than the one the verifier confirmed. */
const evidenceSetChanged = (e: unknown) =>
  isConflict(e) &&
  /Evidence set changed/.test(String((e as { message?: unknown }).message));
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children || "—"}</dd>
    </div>
  );
}
export function ActionPlanPage() {
  const { planId = "" } = useParams();
  const auth = useAuth();
  const r = useResource(useCallback(() => api.plan(planId), [planId]));
  const evidence = useResource(
    useCallback(() => listEvidence(planId), [planId]),
  );
  const [removing, setRemoving] = useState<Evidence>();
  const [editing, setEditing] = useState(false);
  const [transition, setTransition] = useState<PlanStatus>();
  const [verifying, setVerifying] = useState(false);
  const [evidenceChanged, setEvidenceChanged] = useState(false);
  const [conflict, setConflict] = useState(false);
  /** Stale writes reload the latest server state instead of overwriting it. */
  async function mutate(run: () => Promise<void>) {
    setConflict(false);
    try {
      await run();
    } catch (e) {
      if (!isConflict(e) || evidenceSetChanged(e)) throw e;
      setConflict(true);
    }
    r.reload();
  }
  if (r.loading) return <Notice>Carregando plano de ação…</Notice>;
  if (r.error)
    return (
      <Notice error>
        {r.error} <button onClick={r.reload}>Tentar novamente</button>
      </Notice>
    );
  if (!r.data)
    return (
      <>
        <PageTitle
          title="Plano de ação indisponível"
          description="O plano não existe ou você não tem acesso a ele."
        />
        <Link to="/action-plans">Voltar para Planos de Ação</Link>
      </>
    );
  const s = r.data;
  const plan = s.plan;
  const scope = { unit_id: plan.unit_id, sector_id: plan.sector_id };
  const verified = !!plan.effectiveness;
  const canWrite = auth.can("action_plan.write", scope) && !verified;
  const canVerify =
    auth.can("action_plan.verify", scope) && plan.status === "completed";
  const missing = missingForExecution(plan);
  // Execution evidence follows write and freezes at verification; verification evidence
  // follows verify and only the open round (not yet recorded) can change.
  const canExecutionEvidence = canWrite;
  const canVerificationEvidence = auth.can("action_plan.verify", scope);
  const openRound = plan.verification_round + 1;
  const rows = evidence.data ?? [];
  const execution = rows.filter((e) => e.kind === "execution");
  const round = (n: number) =>
    rows.filter((e) => e.kind === "verification" && e.verification_round === n);
  // What verify_plan freezes: execution evidence and the open verification round.
  const boundTo = (list: Evidence[]) =>
    list
      .filter(
        (e) => e.kind === "execution" || e.verification_round === openRound,
      )
      .map((e) => e.id)
      .sort();
  const withEvidence = (render: () => ReactNode) =>
    evidence.loading ? (
      <p className="muted" role="status">
        Carregando evidências…
      </p>
    ) : evidence.error ? (
      <Notice error>
        Não foi possível carregar as evidências.{" "}
        <button onClick={evidence.reload}>Recarregar evidências</button>
      </Notice>
    ) : (
      render()
    );
  return (
    <>
      <nav className="breadcrumb" aria-label="Trilha">
        <Link to="/action-plans">Planos de Ação</Link> / <span>Plano</span>
      </nav>
      <PageTitle
        eyebrow={`Plano de ação · ${originLabel(plan)}`}
        title={plan.improvement_point}
        description={`${s.unit_name}${s.sector_name ? ` / ${s.sector_name}` : ""}`}
      >
        <div className="row-actions">
          {canWrite && (
            <button onClick={() => setEditing(true)}>
              Editar planejamento
            </button>
          )}
          {canWrite &&
            TRANSITIONS[plan.status].map((t) => (
              <button
                key={t.to}
                className={t.to === "completed" ? "primary" : undefined}
                disabled={t.to !== "pending" && missing.length > 0}
                onClick={() => setTransition(t.to)}
              >
                {t.label}
              </button>
            ))}
          {canVerify && (
            <button
              className="primary"
              onClick={() => {
                evidence.reload();
                setEvidenceChanged(false);
                setVerifying(true);
              }}
            >
              {verified ? "Reverificar eficácia" : "Verificar eficácia"}
            </button>
          )}
        </div>
      </PageTitle>
      <div className="ap-status-strip">
        <PlanBadges plan={plan} />
        <p className="ap-due">
          <Icon name="calendar" />
          Prazo:{" "}
          <strong className="numeric">{formatDate(plan.due_date)}</strong>
        </p>
      </div>
      {conflict && (
        <Notice error>
          Este plano foi alterado em outra sessão. Os dados atuais foram
          carregados; revise e tente novamente.
        </Notice>
      )}
      {isOverdue(plan) && (
        <Notice error>
          Prazo vencido em {formatDate(plan.due_date)} e o plano ainda não foi
          concluído.
        </Notice>
      )}
      {plan.source_reactivated_after_verification && (
        <Notice error>
          A condição de origem voltou a ser AP/NAT depois da verificação de
          eficácia. A verificação anterior foi preservada; avalie uma
          reverificação.
        </Notice>
      )}
      {canWrite && plan.status !== "completed" && missing.length > 0 && (
        <p className="muted">
          Para iniciar a execução ou concluir, preencha: {missing.join(", ")}.
        </p>
      )}
      {verified && auth.can("action_plan.write", scope) && (
        <p className="muted">
          Plano com eficácia verificada: planejamento e execução estão
          bloqueados.
        </p>
      )}
      <section className="ap-section ap-origin">
        <h2>Origem</h2>
        <dl className="ap-fields">
          <Field label="Unidade">{s.unit_name}</Field>
          {plan.sector_id && <Field label="Setor">{s.sector_name}</Field>}
          {plan.source_type === "checklist" && (
            <>
              <Field label="Auditoria">
                {formatDate(s.inspection_applied_on)}
                {auth.can("audit.inspection.read", {
                  unit_id: plan.unit_id,
                }) && (
                  <>
                    {" "}
                    <Link
                      to={`/audit/inspections/${plan.source_inspection_id}`}
                    >
                      Abrir auditoria
                    </Link>
                  </>
                )}
              </Field>
              <Field label="Critério">
                {s.item_number}. {plan.improvement_point}
              </Field>
              <Field label="Resposta de origem">
                {plan.source_active
                  ? `${plan.source_response} (ativa)`
                  : `Inativa — último registro ${plan.source_response}. O critério não está mais AP/NAT; o plano é mantido como histórico.`}
              </Field>
              <Field label="Observação da auditoria">
                {plan.source_observation}
              </Field>
            </>
          )}
        </dl>
      </section>
      <section className="ap-section" aria-labelledby="ap-execution">
        <Step n={1} id="ap-execution" title="Execução" />
        <dl className="ap-fields">
          <Field label="O que fazer">{plan.action}</Field>
          <Field label="Como fazer">{plan.how_to}</Field>
          <Field label="Responsável">{plan.responsible}</Field>
          <Field label="Prazo">
            {plan.due_date ? formatDate(plan.due_date) : ""}
          </Field>
          <Field label="Situação">{STATUS_LABELS[plan.status]}</Field>
          {plan.completed_at && (
            <Field label="Conclusão">
              {new Date(plan.completed_at).toLocaleString("pt-BR")} ·{" "}
              {s.completed_by_name}
            </Field>
          )}
        </dl>
        <div className="ap-sub">
          <h3>Evidências da execução</h3>
          {withEvidence(() => (
            <>
              <EvidenceList
                rows={execution}
                onRemove={canExecutionEvidence ? setRemoving : undefined}
              />
              {canExecutionEvidence && (
                <EvidenceUpload
                  planId={plan.id}
                  kind="execution"
                  onUploaded={evidence.reload}
                />
              )}
            </>
          ))}
        </div>
      </section>
      <section className="ap-section" aria-labelledby="ap-verification">
        <Step n={2} id="ap-verification" title="Verificação" />
        <PlannedVerification plan={plan} />
        <div className="ap-sub">
          <h3>Verificação realizada</h3>
          {!verified ? (
            <p className="muted">
              {plan.status === "completed"
                ? "Concluído, aguardando verificação de eficácia."
                : "A eficácia é verificada após a conclusão do plano."}
            </p>
          ) : (
            <dl className="ap-fields">
              <Field label="Resultado">
                {EFFECTIVENESS_LABELS[plan.effectiveness!]}
              </Field>
              <Field label="Data da verificação">
                {formatDate(plan.verified_on)}
              </Field>
              <Field label="Análise">{plan.verification_notes}</Field>
              <Field label="Verificado por">
                {s.verified_by_name} ·{" "}
                {new Date(plan.verified_at!).toLocaleString("pt-BR")}
              </Field>
            </dl>
          )}
        </div>
        <div className="ap-sub">
          <h3>Evidências da verificação</h3>
          {withEvidence(() => (
            <>
              <p className="ap-evidence-scope">
                {verified ? "Para a próxima verificação" : "Para a verificação"}
              </p>
              <EvidenceList
                rows={round(openRound)}
                onRemove={canVerificationEvidence ? setRemoving : undefined}
              />
              {canVerificationEvidence &&
                (plan.status === "completed" ? (
                  <EvidenceUpload
                    planId={plan.id}
                    kind="verification"
                    onUploaded={evidence.reload}
                  />
                ) : (
                  <p className="muted">
                    Evidências da verificação podem ser anexadas após a
                    conclusão do plano.
                  </p>
                ))}
            </>
          ))}
        </div>
      </section>
      <section className="ap-section" aria-labelledby="ap-history">
        <Step n={3} id="ap-history" title="Histórico" />
        {!plan.verification_round ? (
          <p className="muted">Nenhuma verificação de eficácia registrada.</p>
        ) : (
          withEvidence(() =>
            Array.from(
              { length: plan.verification_round },
              (_, i) => plan.verification_round - i,
            ).map((n) => (
              <div className="ap-sub" key={n}>
                <h3>
                  Verificação nº {n}
                  {n === plan.verification_round ? " (atual)" : ""}
                </h3>
                <EvidenceList
                  rows={round(n)}
                  empty="Nenhuma evidência anexada a esta verificação."
                />
              </div>
            )),
          )
        )}
      </section>
      {editing && (
        <Modal title="Editar planejamento" onClose={() => setEditing(false)}>
          <Form
            onCancel={() => setEditing(false)}
            onSave={async (data) => {
              await mutate(() => api.update(plan, readPlanValues(data, plan)));
              setEditing(false);
            }}
          >
            <PlanFields plan={plan} />
          </Form>
        </Modal>
      )}
      {transition && (
        <Confirm
          title={`Alterar para ${STATUS_LABELS[transition]}`}
          description={
            transition === "completed"
              ? "Concluir registra você como responsável pela conclusão. A eficácia será verificada separadamente."
              : `O plano passará de ${STATUS_LABELS[plan.status]} para ${STATUS_LABELS[transition]}.`
          }
          onClose={() => setTransition(undefined)}
          onConfirm={() => mutate(() => api.setStatus(plan, transition))}
        />
      )}
      {verifying && (
        <Modal title="Verificar eficácia" onClose={() => setVerifying(false)}>
          <PlannedVerification plan={plan} />
          <div className="ap-sub">
            <h3>Evidências desta verificação</h3>
            {withEvidence(() => (
              <>
                <h4>Execução</h4>
                <EvidenceList rows={execution} />
                <h4>Verificação</h4>
                <EvidenceList rows={round(openRound)} />
              </>
            ))}
          </div>
          <Form
            onCancel={() => setVerifying(false)}
            onSave={async (data) => {
              // The database binds the verification to the ids shown here and rejects it
              // if the set changed; the re-read only warns earlier.
              const shown = boundTo(rows);
              const changed = () => {
                setEvidenceChanged(true);
                evidence.reload();
              };
              const current = await listEvidence(plan.id);
              if (evidence.loading || boundTo(current).join() !== shown.join())
                return changed();
              try {
                await mutate(() =>
                  api.verify(
                    plan,
                    {
                      effectiveness: String(
                        data.get("effectiveness"),
                      ) as Effectiveness,
                      verified_on: String(data.get("verified_on")),
                      notes: String(data.get("notes")).trim(),
                    },
                    shown,
                  ),
                );
              } catch (e) {
                if (evidenceSetChanged(e)) return changed();
                throw e;
              }
              evidence.reload();
              setVerifying(false);
            }}
          >
            {evidenceChanged && (
              <Notice error>
                As evidências desta verificação mudaram enquanto o formulário
                estava aberto. Revise a lista atualizada e salve novamente.
              </Notice>
            )}
            <fieldset className="ap-result">
              <legend>Resultado (obrigatório)</legend>
              {(Object.keys(EFFECTIVENESS_LABELS) as Effectiveness[]).map(
                (k) => (
                  <label className="check" key={k}>
                    <input
                      type="radio"
                      name="effectiveness"
                      value={k}
                      required
                    />
                    <span>{EFFECTIVENESS_LABELS[k]}</span>
                  </label>
                ),
              )}
            </fieldset>
            <label>
              Data da verificação (obrigatório)
              <input
                type="date"
                name="verified_on"
                required
                max={today()}
                defaultValue={today()}
              />
            </label>
            <label>
              Análise (obrigatório)
              <textarea name="notes" required maxLength={2000} />
            </label>
          </Form>
        </Modal>
      )}
      {removing && (
        <Confirm
          title="Remover evidência"
          description={`"${removing.original_name}" deixará de ficar disponível neste plano. A remoção fica registrada no histórico.`}
          onClose={() => setRemoving(undefined)}
          onConfirm={async () => {
            await removeEvidence(removing.id);
            evidence.reload();
          }}
        />
      )}
    </>
  );
}
function Step({ n, id, title }: { n: number; id: string; title: string }) {
  return (
    <header className="ap-step">
      <span className="ap-step-n numeric" aria-hidden="true">
        {n}
      </span>
      <h2 id={id}>{title}</h2>
    </header>
  );
}
function PlannedVerification({ plan }: { plan: Plan }) {
  return (
    <div className="ap-sub">
      <h3>Verificação planejada</h3>
      <dl className="ap-fields">
        <Field label="Critério de eficácia">
          {plan.effectiveness_criterion}
        </Field>
        <Field label="Período de acompanhamento">
          {plan.monitoring_start
            ? `${formatDate(plan.monitoring_start)} a ${formatDate(plan.monitoring_end)}`
            : ""}
        </Field>
        <Field label="Evidência esperada">{plan.expected_evidence}</Field>
      </dl>
    </div>
  );
}
