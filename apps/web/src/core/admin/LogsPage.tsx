import { useCallback, useState, type FormEvent } from "react";
import { useResource } from "../../shared/useResource";
import { Badge, Modal, PageTitle, Pager } from "../../shared/ui";
import type { AuditLog, Json } from "../types";
import * as api from "./api";
import { Identifier, ListState } from "./parts";
const empty: api.LogFilters = {
  from: "",
  to: "",
  actor: "",
  module: "",
  action: "",
};
const ACTIONS = [
  "insert",
  "update",
  "delete",
  "activate",
  "deactivate",
  "grant",
  "revoke",
];
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
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AuditLog>();
  const r = useResource(
    useCallback(() => api.logs(page, filters), [page, filters]),
  );
  function filter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setPage(0);
    setFilters({
      from: String(d.get("from")),
      to: String(d.get("to")),
      actor: String(d.get("actor")).trim(),
      module: String(d.get("module")).trim(),
      action: String(d.get("action")).trim(),
    });
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
        className="filters adm-filters"
        aria-label="Filtros dos logs"
        onSubmit={filter}
      >
        <label>
          De
          <input type="date" name="from" />
        </label>
        <label>
          Até
          <input type="date" name="to" />
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
          <input name="module" placeholder="core" maxLength={80} />
        </label>
        <label>
          Ação
          <select name="action">
            <option value="">Todas</option>
            {ACTIONS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <div className="adm-filter-actions">
          <button type="submit" className="primary">
            Filtrar
          </button>
          <button
            type="reset"
            onClick={() => {
              setFilters(empty);
              setPage(0);
            }}
          >
            Limpar
          </button>
        </div>
      </form>
      {active > 0 && (
        <p className="muted adm-intro" role="status">
          {active} filtro(s) aplicado(s).
        </p>
      )}
      <ListState
        loading={r.loading}
        error={r.error}
        empty={!!r.data && !r.data.rows.length}
        emptyText="Nenhum evento encontrado."
        onRetry={r.reload}
      />
      {r.data && r.data.rows.length > 0 && (
        <ul className="adm-list adm-logs" aria-label="Eventos">
          {r.data.rows.map((log) => (
            <li key={log.id} className="adm-row">
              <Timestamp value={log.occurred_at} />
              <div className="adm-main">
                <p className="adm-title">
                  <Badge tone="neutral">{log.module}</Badge>
                  <strong>{log.action}</strong>
                  <span className="adm-entity">{log.entity_type}</span>
                </p>
                {log.actor_user_id ? (
                  <Identifier label="Ator">{log.actor_user_id}</Identifier>
                ) : (
                  <p className="adm-meta">{DATABASE_ACTOR}</p>
                )}
              </div>
              <div className="adm-actions">
                <button
                  className="ghost"
                  aria-label={`Detalhes: ${log.module} / ${log.action} em ${log.entity_type}, ${new Date(log.occurred_at).toLocaleString("pt-BR")}`}
                  onClick={() => setSelected(log)}
                >
                  Detalhes
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {r.data && <Pager page={page} count={r.data.count} onChange={setPage} />}
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
                {selected.module} / {selected.action}
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
                {selected.entity_type} <code>{selected.entity_id}</code>
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
