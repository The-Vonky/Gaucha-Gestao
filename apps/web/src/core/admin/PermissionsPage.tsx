import { useCallback } from "react";
import { useResource } from "../../shared/useResource";
import { Badge, EmptyState, PageTitle } from "../../shared/ui";
import * as api from "./api";
import { byDomain, domainLabel, Identifier, ListState } from "./parts";
/** Read-only catalog (changes only through migrations), grouped by domain. */
export function PermissionsPage() {
  const r = useResource(useCallback(() => api.all("permissions"), []));
  return (
    <>
      <PageTitle
        eyebrow="Administração"
        title="Permissões"
        description="Catálogo de permissões. Sua composição é mantida pela equipe responsável pela plataforma."
      />
      <ListState
        loading={r.loading}
        error={r.error}
        label="Carregando permissões…"
        onRetry={r.reload}
      />
      {r.data && !r.data.length && (
        <EmptyState title="Catálogo vazio">
          Nenhuma permissão está disponível no seu acesso.
        </EmptyState>
      )}
      {r.data &&
        byDomain(r.data).map(([domain, rows]) => (
          <section
            key={domain}
            className="adm-domain"
            aria-labelledby={`perm-${domain}`}
          >
            <h2 id={`perm-${domain}`}>
              {domainLabel(domain)}
              <span className="adm-count numeric">{rows.length}</span>
            </h2>
            <ul className="adm-list" aria-label={domainLabel(domain)}>
              {rows.map((p) => (
                <li
                  key={p.key}
                  className={`adm-row${p.active ? "" : " inactive"}`}
                >
                  <div className="adm-main">
                    <p className="adm-title">
                      <strong>{p.description}</strong>
                    </p>
                    <Identifier label="Código">{p.key}</Identifier>
                  </div>
                  {!p.active && (
                    <div className="adm-state">
                      <Badge tone="neutral" icon="close">
                        Inativa
                      </Badge>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
    </>
  );
}
