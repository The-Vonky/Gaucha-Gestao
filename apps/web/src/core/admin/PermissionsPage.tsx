import { useCallback, useState } from "react";
import { useResource } from "../../shared/useResource";
import { Notice, PageTitle, Pager, Table } from "../../shared/ui";
import * as api from "./api";
export function PermissionsPage() {
  const [page, setPage] = useState(0);
  const r = useResource(
    useCallback(() => api.list("permissions", page), [page]),
  );
  return (
    <>
      <PageTitle
        title="Permissões"
        description="Catálogo controlado pela plataforma. Alterações são realizadas por migrations."
      />
      {r.loading && <Notice>Carregando…</Notice>}
      {r.error && (
        <Notice error>
          {r.error} <button onClick={r.reload}>Tentar novamente</button>
        </Notice>
      )}
      {r.data && (
        <>
          <Table headers={["Permissão", "Descrição", "Domínio"]}>
            {r.data.rows.map((p) => (
              <tr key={p.key}>
                <td>
                  <code>{p.key}</code>
                </td>
                <td>{p.description}</td>
                <td>{p.domain}</td>
              </tr>
            ))}
          </Table>
          {!r.data.rows.length && (
            <Notice>Nenhuma permissão encontrada.</Notice>
          )}
          <Pager page={page} count={r.data.count} onChange={setPage} />
        </>
      )}
    </>
  );
}
