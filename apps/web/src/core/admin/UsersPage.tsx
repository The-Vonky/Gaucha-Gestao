import { useCallback, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import type { Profile } from "../types";
import { Icon } from "../../shared/icons";
import { useResource } from "../../shared/useResource";
import { Badge, Confirm, PageTitle, Pager } from "../../shared/ui";
import * as api from "./api";
import { ActiveBadge, Identifier, ListState } from "./parts";
import { UserAssignments } from "./UserAssignments";
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
export function UsersPage() {
  const auth = useAuth();
  const [page, setPage] = useState(0);
  const r = useResource(useCallback(() => api.list("profiles", page), [page]));
  const [selected, setSelected] = useState<Profile>();
  const [toggle, setToggle] = useState<Profile>();
  const manage = auth.can("admin.user.manage");
  return (
    <>
      <PageTitle
        eyebrow="Administração"
        title="Usuários"
        description="Identidades corporativas, situação e atribuições de acesso."
      />
      <p className="muted adm-intro">
        Contas são criadas ou convidadas pela administração do Auth. Ativar uma
        conta não restaura suas atribuições revogadas.
      </p>
      <ListState
        loading={r.loading}
        error={r.error}
        empty={!!r.data && !r.data.rows.length}
        emptyText="Nenhum usuário encontrado."
        onRetry={r.reload}
      />
      {r.data && r.data.rows.length > 0 && (
        <ul className="adm-list" aria-label="Usuários">
          {r.data.rows.map((row) => {
            // The current user never gets an activation toggle for their own account.
            const self = row.id === auth.profile?.id;
            return (
              <li key={row.id} className="adm-row">
                <span className="adm-avatar" aria-hidden="true">
                  {initials(row.display_name) || "?"}
                </span>
                <div className="adm-main">
                  <p className="adm-title">
                    <strong>{row.display_name}</strong>
                    {self && <Badge tone="info">Você</Badge>}
                  </p>
                  <Identifier label="ID">{row.id}</Identifier>
                </div>
                <div className="adm-state">
                  <ActiveBadge active={row.active} />
                </div>
                <div className="adm-actions">
                  <button
                    aria-label={`Atribuições de ${row.display_name}`}
                    onClick={() => setSelected(row)}
                  >
                    <Icon name="roles" />
                    Atribuições
                  </button>
                  {manage && !self && (
                    <button
                      className={row.active ? "ghost adm-danger" : "ghost"}
                      aria-label={`${row.active ? "Desativar" : "Ativar"} ${row.display_name}`}
                      onClick={() => setToggle(row)}
                    >
                      {row.active ? "Desativar" : "Ativar"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {r.data && <Pager page={page} count={r.data.count} onChange={setPage} />}
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
