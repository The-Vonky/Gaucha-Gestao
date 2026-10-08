import { useCallback, useRef, useState, type FormEvent } from "react";
import { plural } from "../../shared/plural";
import { useResource } from "../../shared/useResource";
import { Badge, EmptyState, Modal, PageTitle, Pager } from "../../shared/ui";
import type { AuditLog, Json } from "../types";
import * as api from "./api";
import { Identifier, ListState, useLatest } from "./parts";
const empty: api.LogFilters = {
  from: "",
  to: "",
  actor: "",
  module: "",
  action: "",
};
/** Modules that write to the log. */
const MODULES: Record<string, string> = {
  core: "Plataforma",
  audit: "Auditoria",
  action_plans: "Planos de ação",
};
/** Events written by Core, Audit and Action Plans; unknown values are shown as stored. */
const ACTIONS: Record<string, string> = {
  insert: "Inclusão",
  update: "Alteração",
  delete: "Exclusão",
  activate: "Ativação",
  deactivate: "Desativação",
  grant: "Concessão",
  revoke: "Revogação",
  create: "Criação",
  finalize: "Finalização",
  reopen: "Reabertura",
  status: "Mudança de situação",
  verify: "Verificação de eficácia",
  re_verify: "Reverificação de eficácia",
  source_activate: "Origem reativada",
  source_deactivate: "Origem desativada",
  source_update: "Origem atualizada",
  evidence_add: "Evidência anexada",
  evidence_remove: "Evidência removida",
  cover_upload_begin: "Envio de capa iniciado",
  cover_ready: "Capa publicada",
  cover_cancel: "Envio de capa cancelado",
  cover_retire: "Capa retirada",
  cover_purge: "Capa expurgada",
};
const ENTITIES: Record<string, string> = {
  profiles: "Usuário",
  units: "Unidade",
  sectors: "Setor",
  unit_sectors: "Vínculo unidade/setor",
  permissions: "Permissão",
  roles: "Perfil de acesso",
  role_permissions: "Permissão do perfil",
  user_role_assignments: "Atribuição de acesso",
  unit_cover_assets: "Capa da unidade",
  inspection: "Auditoria",
  checklist_evidence: "Evidência do checklist",
  plan: "Plano de ação",
  evidence: "Evidência do plano",
};
const byLabel = (entries: Record<string, string>) =>
  Object.entries(entries).sort(([, a], [, b]) => a.localeCompare(b, "pt-BR"));
const moduleLabel = (module: string) => MODULES[module] ?? module;
const actionLabel = (action: string) => ACTIONS[action] ?? action;
const entityLabel = (entity: string) => ENTITIES[entity] ?? entity;
const DATABASE_ACTOR = "Operação administrativa do banco";
function Timestamp({ value }: { value: string }) {
  const d = new Date(value);
  return (
    <time className="adm-time numeric" dateTime={value}>
      <span>{d.toLocaleDateString("pt-BR")}</span>
      <span>{d.toLocaleTimeString("pt-BR")}</span>
    </time>
  );
}
/** JSON is rendered as text (React escapes it) inside its own scrollable region. */
function JsonBlock({ label, value }: { label: string; value: Json }) {
  return (
    <section className="adm-json">
      <h3 className="adm-subhead">{label}</h3>
      <pre tabIndex={0} role="region" aria-label={label}>
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}
export function LogsPage() {
  const [filters, setFilters] = useState(empty);
  const [range, setRange] = useState({ from: "", to: "" });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AuditLog>();
  const form = useRef<HTMLFormElement>(null);
  const r = useResource(
    useCallback(() => api.logs(page, filters), [page, filters]),
  );
  const data = useLatest(r);
  function filter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setPage(0);
    setFilters({
      from: range.from,
      to: range.to,
      actor: String(d.get("actor")).trim(),
      module: String(d.get("module")).trim(),
      action: String(d.get("action")).trim(),
    });
  }
  function clear() {
    form.current?.reset();
    setRange({ from: "", to: "" });
    setFilters(empty);
    setPage(0);
  }
  const active = Object.values(filters).filter(Boolean).length;
  return (
    <>
      <PageTitle
        eyebrow="Administração"
        title="Logs do sistema"
        description="Histórico das alterações administrativas. Somente leitura."
      />
      <form
        ref={form}
        className="filters adm-filters"
        aria-label="Filtros dos logs"
        onSubmit={filter}
      >
        <label>
          De
          <input
            type="date"
            name="from"
            value={range.from}
            max={range.to || undefined}
            onChange={(e) => setRange((x) => ({ ...x, from: e.target.value }))}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            name="to"
            value={range.to}
            min={range.from || undefined}
            onChange={(e) => setRange((x) => ({ ...x, to: e.target.value }))}
          />
        </label>
        <label className="adm-filter-wide">
          Ator (UUID)
          <input
            name="actor"
            placeholder="Identificador do usuário"
            pattern="[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}"
          />
        </label>
        <label>
          Módulo
          <select name="module">
            <option value="">Todos</option>
            {Object.entries(MODULES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ação
          <select name="action">
            <option value="">Todas</option>
            {byLabel(ACTIONS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="adm-filter-actions">
          <button type="submit" className="primary">
            Filtrar
          </button>
          <button type="button" onClick={clear}>
            Limpar
          </button>
        </div>
      </form>
      {data && (
        <p className="muted adm-intro adm-log-status" role="status">
          <span className="numeric">
            {plural(data.count, "evento", "eventos")}
          </span>
          {active > 0 && (
            <span>
              {plural(active, "filtro aplicado", "filtros aplicados")}
            </span>
          )}
        </p>
      )}
      <ListState
        loading={r.loading && !data}
        error={r.error}
        label="Carregando eventos…"
        onRetry={r.reload}
      />
      {data && !data.rows.length && (
        <EmptyState
          title="Nenhum evento encontrado"
          actions={
            active > 0 && (
              <button type="button" onClick={clear}>
                Limpar filtros
              </button>
            )
          }
        >
          {active > 0
            ? "Nenhum evento corresponde aos filtros aplicados."
            : "Ainda não há alterações administrativas registradas no seu acesso."}
        </EmptyState>
      )}
      {data && data.rows.length > 0 && (
        <ul
          className="adm-list adm-logs"
          aria-label="Eventos"
          aria-busy={r.loading}
        >
          {data.rows.map((log) => (
            <li key={log.id} className="adm-row">
              <Timestamp value={log.occurred_at} />
              <div className="adm-main">
                <p className="adm-title">
                  <Badge tone="neutral">{moduleLabel(log.module)}</Badge>
                  <strong>{actionLabel(log.action)}</strong>
                  <span className="adm-entity">
                    {entityLabel(log.entity_type)}
                  </span>
                </p>
                {log.actor_user_id ? (
                  <Identifier label="Ator">{log.actor_user_id}</Identifier>
                ) : (
                  <p className="adm-meta">{DATABASE_ACTOR}</p>
                )}
              </div>
              <div className="adm-actions">
                <button
                  className="small ghost"
                  aria-label={`Detalhes: ${moduleLabel(log.module)} / ${actionLabel(log.action)} em ${entityLabel(log.entity_type)}, ${new Date(log.occurred_at).toLocaleString("pt-BR")}`}
                  onClick={() => setSelected(log)}
                >
                  Detalhes
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && (
        <Pager
          page={page}
          count={data.count}
          size={api.PAGE_SIZE}
          onChange={setPage}
        />
      )}
      {selected && (
        <Modal
          title="Detalhes do evento"
          onClose={() => setSelected(undefined)}
        >
          <dl className="adm-facts">
            <div>
              <dt>Data</dt>
              <dd className="numeric">
                {new Date(selected.occurred_at).toLocaleString("pt-BR")}
              </dd>
            </div>
            <div>
              <dt>Módulo / ação</dt>
              <dd>
                {moduleLabel(selected.module)} / {actionLabel(selected.action)}{" "}
                <code>
                  {selected.module}.{selected.action}
                </code>
              </dd>
            </div>
            <div>
              <dt>Ator</dt>
              <dd>
                {selected.actor_user_id ? (
                  <code>{selected.actor_user_id}</code>
                ) : (
                  DATABASE_ACTOR
                )}
              </dd>
            </div>
            <div>
              <dt>Entidade</dt>
              <dd>
                {entityLabel(selected.entity_type)}{" "}
                <code>{selected.entity_type}</code>{" "}
                <code>{selected.entity_id}</code>
              </dd>
            </div>
            {selected.unit_id && (
              <div>
                <dt>Unidade</dt>
                <dd>
                  <code>{selected.unit_id}</code>
                </dd>
              </div>
            )}
            {selected.sector_id && (
              <div>
                <dt>Setor</dt>
                <dd>
                  <code>{selected.sector_id}</code>
                </dd>
              </div>
            )}
            {selected.correlation_id && (
              <div>
                <dt>Correlação</dt>
                <dd>
                  <code>{selected.correlation_id}</code>
                </dd>
              </div>
            )}
          </dl>
          <JsonBlock label="Antes" value={selected.before_data} />
          <JsonBlock label="Depois" value={selected.after_data} />
        </Modal>
      )}
    </>
  );
}
