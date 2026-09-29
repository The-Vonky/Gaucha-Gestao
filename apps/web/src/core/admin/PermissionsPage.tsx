import { useCallback, useState } from "react";
import { useResource } from "../../shared/useResource";
import { Badge, PageTitle, Pager } from "../../shared/ui";
import * as api from "./api";
import { domainLabel, ListState } from "./parts";
/** Read-only catalog: changes only through migrations. */
export function PermissionsPage() {
  const [page, setPage] = useState(0);
  const r = useResource(
    useCallback(() => api.list("permissions", page), [page]),
  );
  return (
    <>
      <PageTitle
        eyebrow="Administração"
        title="Permissões"
        description="Catálogo controlado pela plataforma. Alterações são realizadas por migrations."
      />
      <ListState
        loading={r.loading}
        error={r.error}
        empty={!!r.data && !r.data.rows.length}
        emptyText="Nenhuma permissão encontrada."
        onRetry={r.reload}
      />
      {r.data && r.data.rows.length > 0 && (
        <ul className="adm-list" aria-label="Permissões">
          {r.data.rows.map((p) => (
            <li key={p.key} className="adm-row">
              <div className="adm-main">
                <p className="adm-title">
                  <strong>{p.description}</strong>
                </p>
                <p className="adm-key">
                  <code>{p.key}</code>
                </p>
                <p className="adm-meta">
                  Recurso: {p.resource} · Ação: {p.action}
                </p>
              </div>
              <div className="adm-state">
                <Badge tone="neutral">{domainLabel(p.domain)}</Badge>
                {!p.active && (
                  <Badge tone="neutral" icon="close">
                    Inativa
                  </Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {r.data && <Pager page={page} count={r.data.count} onChange={setPage} />}
    </>
  );
}
