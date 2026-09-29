import { useCallback, useState } from "react";
import type { Role } from "../types";
import { useAuth } from "../auth/AuthProvider";
import { useResource } from "../../shared/useResource";
import { PageTitle, Pager } from "../../shared/ui";
import * as api from "./api";
import { ActiveBadge, Identifier, ListState, RoleKind } from "./parts";
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
        loading={r.loading}
        error={r.error}
        empty={!!r.data && !r.data.rows.length}
        emptyText="Nenhum perfil encontrado."
        onRetry={r.reload}
      />
      {r.data && r.data.rows.length > 0 && (
        <ul className="adm-list" aria-label="Perfis de acesso">
          {r.data.rows.map((row) => {
            // System roles are always read-only; the editor may still turn read-only
            // when the role holds permissions the current user lacks.
            const consult = row.system || !manage;
            return (
              <li key={row.id} className="adm-row">
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
                    className={consult ? "ghost" : undefined}
                    aria-label={`${consult ? "Consultar" : "Editar"} ${row.name}`}
                    onClick={() => setEdit(row)}
                  >
                    {consult ? "Consultar" : "Editar"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {r.data && <Pager page={page} count={r.data.count} onChange={setPage} />}
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
