import { useCallback, useState } from "react";
import type { Role } from "../types";
import { useAuth } from "../auth/AuthProvider";
import { useResource } from "../../shared/useResource";
import { Confirm, EmptyState, PageTitle, Pager } from "../../shared/ui";
import * as api from "./api";
import {
  ActiveBadge,
  Identifier,
  ListState,
  RoleKind,
  useLatest,
} from "./parts";
import { RoleEditor } from "./RoleEditor";
export function RolesPage() {
  const auth = useAuth();
  const [page, setPage] = useState(0);
  const r = useResource(useCallback(() => api.list("roles", page), [page]));
  const data = useLatest(r);
  const [edit, setEdit] = useState<Role | null | undefined>();
  const [toggle, setToggle] = useState<Role>();
  const manage = auth.can("admin.role.manage");
  return (
    <>
      <PageTitle
        eyebrow="Administração"
        title="Perfis de acesso"
        description="Conjuntos de permissões. O escopo é definido em cada atribuição ao usuário."
      >
        {manage && (
          <button className="primary" onClick={() => setEdit(null)}>
            Novo perfil
          </button>
        )}
      </PageTitle>
      <ListState
        loading={r.loading && !data}
        error={r.error}
        label="Carregando perfis…"
        onRetry={r.reload}
      />
      {data && !data.rows.length && (
        <EmptyState title="Nenhum perfil cadastrado">
          Os perfis de sistema são criados pela plataforma.
          {manage
            ? " Use “Novo perfil” para criar um perfil personalizado."
            : ""}
        </EmptyState>
      )}
      {data && data.rows.length > 0 && (
        <ul
          className="adm-list adm-table no-lead"
          aria-label="Perfis de acesso"
          aria-busy={r.loading}
        >
          {data.rows.map((row) => {
            // System roles are always read-only; the editor may still turn read-only
            // when the role holds permissions the current user lacks.
            const consult = row.system || !manage;
            return (
              <li
                key={row.id}
                className={`adm-row${row.active ? "" : " inactive"}`}
              >
                <div className="adm-main">
                  <p className="adm-title">
                    <strong>{row.name}</strong>
                    <RoleKind role={row} />
                  </p>
                  {row.description && (
                    <p className="adm-meta">{row.description}</p>
                  )}
                  <Identifier label="Chave">{row.key}</Identifier>
                </div>
                <div className="adm-state">
                  <ActiveBadge active={row.active} />
                </div>
                <div className="adm-actions">
                  <button
                    className={consult ? "small ghost" : "small"}
                    aria-label={`${consult ? "Consultar" : "Editar"} ${row.name}`}
                    onClick={() => setEdit(row)}
                  >
                    {consult ? "Consultar" : "Editar"}
                  </button>
                  {!consult && (
                    <button
                      className={`small ghost ${row.active ? "adm-danger" : "adm-activate"}`}
                      aria-label={`${row.active ? "Desativar" : "Ativar"} ${row.name}`}
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
          onChange={setPage}
        />
      )}
      {toggle && (
        <Confirm
          title={`${toggle.active ? "Desativar" : "Ativar"} perfil`}
          tone={toggle.active ? "danger" : "primary"}
          description={
            toggle.active
              ? `${toggle.name}: quem tem este perfil deixa de receber as permissões dele enquanto estiver inativo. As atribuições são mantidas e voltam a valer se o perfil for reativado.`
              : `${toggle.name}: as atribuições existentes deste perfil voltam a conceder as permissões dele.`
          }
          onClose={() => setToggle(undefined)}
          onConfirm={async () => {
            await api.setRoleActive(toggle, !toggle.active);
            r.reload();
            auth.refresh();
          }}
        />
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
