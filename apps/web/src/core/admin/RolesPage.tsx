import { useCallback, useState } from "react";
import type { Role } from "../types";
import { useAuth } from "../auth/AuthProvider";
import { useResource } from "../../shared/useResource";
import { Notice, PageTitle, Pager, Status, Table } from "../../shared/ui";
import * as api from "./api";
import { RoleEditor } from "./RoleEditor";
export function RolesPage() {
  const auth = useAuth();
  const [page, setPage] = useState(0);
  const r = useResource(useCallback(() => api.list("roles", page), [page]));
  const [edit, setEdit] = useState<Role | null | undefined>();
  const manage = auth.can("admin.role.manage");
  return (
    <>
      <PageTitle
        title="Perfis de acesso"
        description="Conjuntos de permissões. O escopo é definido em cada atribuição ao usuário."
      >
        {manage && (
          <button className="primary" onClick={() => setEdit(null)}>
            Novo perfil
          </button>
        )}
      </PageTitle>
      {r.loading && <Notice>Carregando…</Notice>}
      {r.error && (
        <Notice error>
          {r.error} <button onClick={r.reload}>Tentar novamente</button>
        </Notice>
      )}
      {r.data && (
        <>
          <Table headers={["Perfil", "Tipo", "Situação", "Ações"]}>
            {r.data.rows.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.name}
                  <small>{row.description}</small>
                </td>
                <td>{row.system ? "Sistema" : "Personalizado"}</td>
                <td>
                  <Status active={row.active} />
                </td>
                <td>
                  <button onClick={() => setEdit(row)}>
                    {row.system || !manage ? "Inspecionar" : "Editar"}
                  </button>
                </td>
              </tr>
            ))}
          </Table>
          {!r.data.rows.length && <Notice>Nenhum perfil encontrado.</Notice>}
          <Pager page={page} count={r.data.count} onChange={setPage} />
        </>
      )}
      {edit !== undefined && (
        <RoleEditor
          selected={edit}
          onClose={() => setEdit(undefined)}
          onSaved={() => {
            setEdit(undefined);
            r.reload();
            auth.refresh();
          }}
        />
      )}
    </>
  );
}
