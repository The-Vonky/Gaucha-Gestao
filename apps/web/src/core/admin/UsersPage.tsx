import { useCallback, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import type { Profile } from "../types";
import { useResource } from "../../shared/useResource";
import {
  Confirm,
  Notice,
  PageTitle,
  Pager,
  Status,
  Table,
} from "../../shared/ui";
import * as api from "./api";
import { UserAssignments } from "./UserAssignments";
export function UsersPage() {
  const auth = useAuth();
  const [page, setPage] = useState(0);
  const r = useResource(useCallback(() => api.list("profiles", page), [page]));
  const [selected, setSelected] = useState<Profile>();
  const [toggle, setToggle] = useState<Profile>();
  return (
    <>
      <PageTitle
        title="Usuários"
        description="Identidades corporativas, situação e atribuições de acesso."
      />
      <p className="muted">
        Contas são criadas ou convidadas pela administração do Auth. Ativar uma
        conta não restaura suas atribuições revogadas.
      </p>
      {r.loading && <Notice>Carregando…</Notice>}
      {r.error && (
        <Notice error>
          {r.error} <button onClick={r.reload}>Tentar novamente</button>
        </Notice>
      )}
      {r.data && (
        <>
          <Table headers={["Usuário", "Situação", "Ações"]}>
            {r.data.rows.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.display_name}
                  <small className="identifier">{row.id}</small>
                </td>
                <td>
                  <Status active={row.active} />
                </td>
                <td>
                  <div className="row-actions">
                    <button onClick={() => setSelected(row)}>
                      Atribuições
                    </button>
                    {auth.can("admin.user.manage") &&
                      row.id !== auth.profile?.id && (
                        <button onClick={() => setToggle(row)}>
                          {row.active ? "Desativar" : "Ativar"}
                        </button>
                      )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          {!r.data.rows.length && <Notice>Nenhum usuário encontrado.</Notice>}
          <Pager page={page} count={r.data.count} onChange={setPage} />
        </>
      )}
      {selected && (
        <UserAssignments
          profile={selected}
          onClose={() => setSelected(undefined)}
        />
      )}
      {toggle && (
        <Confirm
          title={`${toggle.active ? "Desativar" : "Ativar"} usuário`}
          description={
            toggle.active
              ? `${toggle.display_name} perderá o acesso e suas atribuições serão revogadas. O histórico será preservado.`
              : `${toggle.display_name} será ativado sem restaurar atribuições. Conceda os acessos necessários explicitamente.`
          }
          onClose={() => setToggle(undefined)}
          onConfirm={async () => {
            await api.setProfileActive(
              toggle.id,
              toggle.version,
              !toggle.active,
            );
            r.reload();
          }}
        />
      )}
    </>
  );
}
