import { useCallback, useEffect, useState } from "react";
import type { Profile } from "../types";
import { useResource } from "../../shared/useResource";
import { Badge, Metric, Modal, Notice, Pager } from "../../shared/ui";
import { ActiveBadge, Identifier, ListState, useLatest } from "./parts";
import {
  REVIEW_PAGE_SIZE,
  userAccessAssignments,
  userAccessSummary,
  type AccessAssignment,
} from "./user-access-review-api";
import "./user-access-review.css";
const RESTRICTED = "Informação restrita";
const SCOPE_LABELS: Record<AccessAssignment["scope_type"], string> = {
  global: "Global",
  unit: "Unidade",
  sector: "Setor na unidade",
};
const COVERAGE: Record<string, string> = {
  complete: "Completa",
  partial: "Parcial",
  restricted: "Restrita",
};
const when = (at: string) =>
  new Date(at).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
/** "Nome (CÓDIGO)", "Informação restrita" when the catalog row is unreadable, plus inactivity. */
function place(
  source: AccessAssignment["unit_label_source"],
  name: string | null,
  code: string | null,
  active: boolean | null,
  inactive: string,
) {
  if (source !== "current")
    return <em className="uar-restricted">{RESTRICTED}</em>;
  return (
    <>
      {name}
      {code && <span className="muted"> ({code})</span>}
      {active === false && <span className="muted"> · {inactive}</span>}
    </>
  );
}
/** Why an assignment does or does not currently grant its permissions (never a record-level proof). */
function Effect({ a }: { a: AccessAssignment }) {
  if (!a.assignment_active) return null;
  if (a.effective === null)
    return (
      <Badge tone="warning" icon="info">
        Efeito: {RESTRICTED.toLowerCase()}
      </Badge>
    );
  if (a.effective)
    return (
      <Badge tone="success" icon="check">
        Concede permissões
      </Badge>
    );
  const reason = !a.user_active
    ? "usuário inativo"
    : !a.role_active
      ? "perfil inativo"
      : "perfil sem permissões ativas";
  return <Badge tone="neutral">Sem efeito · {reason}</Badge>;
}
function Keys({ title, keys }: { title: string; keys: string[] }) {
  if (!keys.length) return null;
  return (
    <details className="uar-keys">
      <summary>
        {title} <span className="adm-count numeric">{keys.length}</span>
      </summary>
      <ul>
        {keys.map((k) => (
          <li key={k}>
            <code>{k}</code>
          </li>
        ))}
      </ul>
    </details>
  );
}
function AssignmentItem({ a }: { a: AccessAssignment }) {
  return (
    <li className="adm-row uar-item">
      <div className="adm-main">
        <p className="adm-title">
          <strong>{a.role_name}</strong>
          <Badge tone="info">{SCOPE_LABELS[a.scope_type]}</Badge>
          {!a.role_active && <Badge tone="neutral">Perfil inativo</Badge>}
        </p>
        <dl className="adm-scope">
          {a.scope_type === "global" ? (
            <div>
              <dt>Escopo</dt>
              <dd>Todas as unidades e setores</dd>
            </div>
          ) : (
            <div>
              <dt>Unidade</dt>
              <dd>
                {place(
                  a.unit_label_source,
                  a.unit_name,
                  a.unit_code,
                  a.unit_active,
                  "unidade inativa",
                )}
              </dd>
            </div>
          )}
          {a.scope_type === "sector" && (
            <div>
              <dt>Setor</dt>
              <dd>
                {place(
                  a.sector_label_source,
                  a.sector_name,
                  a.sector_code,
                  a.sector_active,
                  "setor inativo",
                )}
              </dd>
            </div>
          )}
          <div>
            <dt>Concessão</dt>
            <dd>
              {when(a.granted_at)} por{" "}
              {a.granted_by_name ??
                (a.granted_by ? (
                  <em className="uar-restricted">{RESTRICTED}</em>
                ) : (
                  "responsável não registrado"
                ))}
            </dd>
          </div>
          {!a.assignment_active && (
            <div>
              <dt>Revogação</dt>
              <dd>
                {a.revocation_evidence === "audit_event" && a.revoked_at ? (
                  <>
                    {when(a.revoked_at)} por{" "}
                    {a.revoked_by_name ?? (
                      <em className="uar-restricted">{RESTRICTED}</em>
                    )}
                  </>
                ) : (
                  <em className="uar-restricted">
                    Evidência de revogação indisponível para o seu acesso
                  </em>
                )}
              </dd>
            </div>
          )}
        </dl>
        {a.composition_visibility === "available" ? (
          <div className="uar-perms">
            {a.active_permission_keys?.length ? (
              <Keys
                title="Permissões ativas neste escopo"
                keys={a.active_permission_keys}
              />
            ) : (
              <p className="adm-meta">Nenhuma permissão ativa no perfil.</p>
            )}
            <Keys
              title="Permissões inativas"
              keys={a.inactive_permission_keys ?? []}
            />
          </div>
        ) : (
          <p className="adm-meta">
            Permissões: <em className="uar-restricted">{RESTRICTED}</em>
          </p>
        )}
        <p className="adm-meta">
          <Identifier label="Atribuição">{a.assignment_id}</Identifier>
        </p>
      </div>
      <div className="adm-state uar-state">
        <ActiveBadge active={a.assignment_active} on="Vigente" off="Revogada" />
        <Effect a={a} />
      </div>
    </li>
  );
}
/** Read-only access review of one user (core.user_access_summary / user_access_assignments). */
export function UserAccessReview({
  profile,
  onClose,
}: {
  profile: Profile;
  onClose: () => void;
}) {
  const [history, setHistory] = useState(false);
  const [page, setPage] = useState(0);
  const summary = useResource(
    useCallback(() => userAccessSummary(profile.id), [profile.id]),
  );
  const s = summary.data;
  const list = useResource(
    useCallback(
      () =>
        s
          ? userAccessAssignments(profile.id, history, page)
          : Promise.resolve(undefined),
      [s, profile.id, history, page],
    ),
  );
  const data = useLatest(list);
  // A page left past the end (assignments changed meanwhile) moves back to the last one.
  useEffect(() => {
    if (!data || page === 0 || data.rows.length) return;
    setPage(Math.max(0, Math.ceil(data.count / REVIEW_PAGE_SIZE) - 1));
  }, [data, page]);
  return (
    <Modal
      title={`Revisão de acesso · ${profile.display_name}`}
      onClose={onClose}
    >
      <ListState
        loading={summary.loading}
        error={summary.error}
        label="Carregando revisão de acesso…"
        onRetry={summary.reload}
      />
      {summary.data === null && (
        <Notice tone="warning">
          Revisão indisponível. Você não tem acesso à revisão deste usuário ou
          ele não está disponível para consulta.
        </Notice>
      )}
      {s && (
        <>
          <p className="adm-modal-meta">
            <ActiveBadge active={s.user_active} />
            <Identifier label="ID">{s.user_id}</Identifier>
          </p>
          <p className="muted uar-intro">
            Somente leitura. Uma atribuição vigente não comprova acesso a um
            registro de negócio: as regras de cada módulo continuam valendo e as
            permissões valem apenas no escopo da atribuição.
          </p>
          <div
            className="uar-metrics"
            aria-label="Resumo de acesso"
            role="group"
          >
            <Metric label="Vigentes" value={s.active_assignment_count} />
            <Metric label="Revogadas" value={s.revoked_assignment_count} />
            <Metric
              label="Concedem permissões"
              value={s.effective_assignment_count ?? RESTRICTED}
              tone={
                s.effective_assignment_count === null ? "warning" : undefined
              }
            />
            <Metric
              label="Composição visível"
              value={COVERAGE[s.composition_coverage] ?? RESTRICTED}
              tone={
                s.composition_coverage === "complete" ? undefined : "warning"
              }
            />
          </div>
          {!s.user_active && (
            <Notice tone="warning">
              Usuário inativo: nenhuma atribuição concede acesso.
            </Notice>
          )}
          {s.composition_coverage !== "complete" && (
            <Notice tone="warning">
              {RESTRICTED}: seu acesso não permite consultar a composição de{" "}
              {s.composition_coverage === "partial" ? "parte dos" : "todos os"}{" "}
              perfis vigentes. Isso não significa ausência de permissões.
            </Notice>
          )}
          <div className="uar-toolbar">
            <h3 className="adm-subhead">Atribuições</h3>
            <label className="check">
              <input
                type="checkbox"
                checked={history}
                onChange={(e) => {
                  setHistory(e.target.checked);
                  setPage(0);
                }}
              />
              <span>Incluir revogadas (histórico)</span>
            </label>
          </div>
          <ListState
            loading={list.loading && !data}
            error={list.error}
            label="Carregando atribuições…"
            onRetry={list.reload}
          />
          {data?.count === 0 && (
            <Notice>
              {history
                ? "Nenhuma atribuição registrada para este usuário."
                : "Sem atribuições vigentes. A conta não possui acesso operacional."}
            </Notice>
          )}
          {data && data.rows.length > 0 && (
            <ul
              className="adm-list compact uar-list"
              aria-label="Atribuições do usuário"
              aria-busy={list.loading}
            >
              {data.rows.map((a) => (
                <AssignmentItem key={a.assignment_id} a={a} />
              ))}
            </ul>
          )}
          {data && (
            <Pager
              page={page}
              count={data.count}
              size={REVIEW_PAGE_SIZE}
              onChange={setPage}
            />
          )}
          <p className="adm-meta uar-evaluated">
            Avaliado em {when(s.evaluated_at)}
          </p>
        </>
      )}
    </Modal>
  );
}
