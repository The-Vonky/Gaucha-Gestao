import { useCallback, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import type { DirectoryUser } from "../types";
import { Icon } from "../../shared/icons";
import { useResource } from "../../shared/useResource";
import {
  Badge,
  Confirm,
  EmptyState,
  Form,
  Modal,
  PageTitle,
  Pager,
} from "../../shared/ui";
import * as api from "./api";
import {
  ActiveBadge,
  ListState,
  ListToolbar,
  useLatest,
  useListFilters,
  usePageClamp,
} from "./parts";
import { UserAssignments } from "./UserAssignments";
/** "Último acesso 07/10/2026 14:32" from the Auth last sign-in. */
const lastAccess = (at: string | null) =>
  at
    ? `Último acesso ${new Date(at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`
    : "Nunca acessou";
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
  const [selected, setSelected] = useState<DirectoryUser>();
  const [toggle, setToggle] = useState<DirectoryUser>();
  const [renaming, setRenaming] = useState<DirectoryUser>();
  const manage = auth.can("admin.user.manage");
  return (
    <>
      <PageTitle
        eyebrow="Administração"
        title="Usuários"
        description="Identidades corporativas, situação e atribuições de acesso."
      />
      <p className="muted adm-intro">
        Contas são criadas ou convidadas pela equipe responsável pelos acessos.
        Ativar uma conta não restaura suas atribuições revogadas.
      </p>
      <ListToolbar
        label="Filtros dos usuários"
        placeholder="Nome ou e-mail"
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
            ? `Nenhum nome ou e-mail corresponde a “${search}”${inactive ? "" : " entre os usuários ativos"}.`
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
                  <p className="adm-meta">
                    {row.email && (
                      <span className="usr-email">{row.email}</span>
                    )}
                    <span>{lastAccess(row.last_sign_in_at)}</span>
                  </p>
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
                      className="small ghost"
                      aria-label={`Renomear ${row.display_name}`}
                      onClick={() => setRenaming(row)}
                    >
                      Renomear
                    </button>
                  )}
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
      {renaming && (
        <Modal title="Renomear usuário" onClose={() => setRenaming(undefined)}>
          <Form
            onCancel={() => setRenaming(undefined)}
            onSave={async (data) => {
              await api.renameProfile(
                renaming.id,
                renaming.version,
                String(data.get("display_name")).trim(),
              );
              setRenaming(undefined);
              r.reload();
            }}
          >
            {renaming.email && (
              <p className="muted adm-modal-meta">{renaming.email}</p>
            )}
            <label>
              Nome de exibição
              <input
                name="display_name"
                required
                maxLength={160}
                pattern=".*\S.*"
                title="Informe um nome."
                defaultValue={renaming.display_name}
              />
            </label>
            <p className="muted">
              O nome aparece na navegação, nas auditorias e nos planos de ação.
              O e-mail de acesso não muda.
            </p>
          </Form>
        </Modal>
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
