import { useCallback, useState, type FormEvent } from "react";
import { useResource } from "../../shared/useResource";
import { Modal, Notice, PageTitle, Pager, Table } from "../../shared/ui";
import type { AuditLog } from "../types";
import * as api from "./api";
const empty: api.LogFilters = {
  from: "",
  to: "",
  actor: "",
  module: "",
  action: "",
};
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
  return (
    <>
      <PageTitle
        title="Logs do sistema"
        description="Histórico das alterações administrativas. Somente leitura."
      />
      <form className="filters" onSubmit={filter}>
        <label>
          De
          <input type="date" name="from" />
        </label>
        <label>
          Até
          <input type="date" name="to" />
        </label>
        <label>
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
            {[
              "insert",
              "update",
              "delete",
              "activate",
              "deactivate",
              "grant",
              "revoke",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <button type="submit">Filtrar</button>
        <button
          type="reset"
          onClick={() => {
            setFilters(empty);
            setPage(0);
          }}
        >
          Limpar
        </button>
      </form>
      {r.loading && <Notice>Carregando…</Notice>}
      {r.error && (
        <Notice error>
          {r.error} <button onClick={r.reload}>Tentar novamente</button>
        </Notice>
      )}
      {r.data && (
        <>
          <Table
            headers={["Data", "Ator", "Módulo / ação", "Entidade", "Detalhes"]}
          >
            {r.data.rows.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.occurred_at).toLocaleString("pt-BR")}</td>
                <td>
                  <small className="identifier">
                    {log.actor_user_id ?? "Operação administrativa do banco"}
                  </small>
                </td>
                <td>
                  {log.module} / {log.action}
                </td>
                <td>{log.entity_type}</td>
                <td>
                  <button onClick={() => setSelected(log)}>Inspecionar</button>
                </td>
              </tr>
            ))}
          </Table>
          {!r.data.rows.length && <Notice>Nenhum evento encontrado.</Notice>}
          <Pager page={page} count={r.data.count} onChange={setPage} />
        </>
      )}
      {selected && (
        <Modal
          title="Detalhes do evento"
          onClose={() => setSelected(undefined)}
        >
          <p>Entidade: {selected.entity_id}</p>
          <h3>Antes</h3>
          <pre>{JSON.stringify(selected.before_data, null, 2)}</pre>
          <h3>Depois</h3>
          <pre>{JSON.stringify(selected.after_data, null, 2)}</pre>
        </Modal>
      )}
    </>
  );
}
