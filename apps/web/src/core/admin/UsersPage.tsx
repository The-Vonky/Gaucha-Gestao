import { useCallback, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import type { Profile } from "../types";
import { Icon } from "../../shared/icons";
import { useResource } from "../../shared/useResource";
import { Badge, Confirm, EmptyState, PageTitle, Pager } from "../../shared/ui";
import * as api from "./api";
import {
  ActiveBadge,
  Identifier,
  ListState,
  ListToolbar,
  useLatest,
  useListFilters,
  usePageClamp,
} from "./parts";
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
  const filters = useListFilters();
  const { page, search, inactive } = filters;
  const r = useResource(
    useCallback(
      () => api.users(page, { search, inactive }),
      [page, search, inactive],
    ),
  );
  const data = useLatest(r);
  usePageClamp(filters, data?.count);
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
      <ListToolbar
        label="Filtros dos usuários"
        placeholder="Nome do usuário"
        filters={filters}
        count={data?.count}
        noun={{
          one: "usuário",
          many: "usuários",
          activeOne: "ativo",
          activeMany: "ativos",
          inactiveToggle: "Exibir inativos",
        }}
      />
      <ListState
        loading={r.loading && !data}
        error={r.error}
        label="Carregando usuários…"
        onRetry={r.reload}
      />
      {data?.count === 0 && (
        <EmptyState
          title="Nenhum usuário encontrado"
          actions={
            search && (
              <button type="button" onClick={filters.clear}>
                Limpar busca
              </button>
            )
          }
        >
          {search
            ? `Nenhum nome corresponde a “${search}”${inactive ? "" : " entre os usuários ativos"}.`
            : inactive
              ? "Ainda não há usuários cadastrados."
              : "Não há usuários ativos. Marque “Exibir inativos” para ver os demais."}
        </EmptyState>
      )}
      {data && data.rows.length > 0 && (
        <ul
          className="adm-list adm-table"
          aria-label="Usuários"
          aria-busy={r.loading}
        >
          {data.rows.map((row) => {
            // The current user never gets an activation toggle for their own account.
            const self = row.id === auth.profile?.id;
            return (
              <li
                key={row.id}
                className={`adm-row${row.active ? "" : " inactive"}`}
              >
                <span className="usr-avatar adm-lead" aria-hidden="true">
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
                    className="small"
                    aria-label={`Atribuições de ${row.display_name}`}
                    onClick={() => setSelected(row)}
                  >
                    <Icon name="roles" />
                    Atribuições
                  </button>
                  {manage && !self && (
                    <button
                      className={`small ghost ${row.active ? "adm-danger" : "adm-activate"}`}
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
      {data && (
        <Pager
          page={page}
          count={data.count}
          size={api.PAGE_SIZE}
          onChange={filters.setPage}
        />
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
          tone={toggle.active ? "danger" : "primary"}
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
