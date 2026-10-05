import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../core/auth/AuthProvider";
import { hasAnyScope } from "../../core/auth/permissions";
import { useResource } from "../../shared/useResource";
import { Notice, PageTitle, Status } from "../../shared/ui";
import * as api from "./api";
import { NewInspection } from "./NewInspection";
import { Delta, formatDate, Progress, Result, StatusBadge } from "./Result";
import type { InspectionSummary } from "./types";
export function AuditOverview() {
  const auth = useAuth();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const r = useResource(
    useCallback(async () => {
      const [units, rows] = await Promise.all([
        api.units(),
        api.summaries({ p_overview: true }),
      ]);
      return { units, rows };
    }, []),
  );
  const canCreate = hasAnyScope(
    !!auth.profile?.active,
    auth.grants,
    "audit.inspection.create",
  );
  const byUnit = useMemo(() => {
    const map = new Map<string, InspectionSummary[]>();
    for (const row of r.data?.rows ?? [])
      map.set(row.unit_id, [...(map.get(row.unit_id) ?? []), row]);
    return map;
  }, [r.data]);
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const units = (r.data?.units ?? []).filter(
    (u) =>
      (u.active || byUnit.has(u.id)) &&
      `${u.code} ${u.name}`.toLocaleLowerCase("pt-BR").includes(term),
  );
  const drafts = (r.data?.rows ?? []).filter((x) => x.status === "draft");
  return (
    <>
      <PageTitle
        title="Auditorias"
        description="Qualidade · Inspeções do checklist geral por unidade"
      >
        {canCreate && (
          <button className="primary" onClick={() => setCreating(true)}>
            Nova auditoria
          </button>
        )}
      </PageTitle>
      {r.loading && <Notice>Carregando auditorias…</Notice>}
      {r.error && (
        <Notice error>
          {r.error} <button onClick={r.reload}>Tentar novamente</button>
        </Notice>
      )}
      {r.data && !r.data.units.length && (
        <Notice>
          Nenhuma unidade disponível para Auditoria no seu acesso. Solicite uma
          atribuição por unidade à administração.
        </Notice>
      )}
      {r.data && r.data.units.length > 0 && (
        <>
          <section className="audit-block">
            <h2>Em andamento ({drafts.length})</h2>
            {!drafts.length ? (
              <p className="muted">Nenhuma auditoria em andamento.</p>
            ) : (
              <ul className="record-list">
                {drafts.map((d) => (
                  <li key={d.id}>
                    <div>
                      <strong>{d.unit_name}</strong>
                      <p>
                        {formatDate(d.applied_on)} · {d.responsible_name}
                      </p>
                      <Progress answered={d.answered} total={d.total_items} />
                    </div>
                    <Link
                      className="button-link"
                      to={`/audit/inspections/${d.id}/checklist`}
                    >
                      Continuar
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="audit-block">
            <div className="audit-block-head">
              <h2>Unidades</h2>
              <label className="audit-search">
                Buscar unidade
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            {!units.length && <Notice>Nenhuma unidade encontrada.</Notice>}
            <div className="audit-units">
              {units.map((u) => {
                const rows = byUnit.get(u.id) ?? [];
                const latest = rows[0];
                const finalized = rows.filter((x) => x.status === "finalized");
                return (
                  <article className="audit-unit" key={u.id}>
                    <header>
                      <h3>
                        <Link to={`/audit/units/${u.id}`}>{u.name}</Link>
                      </h3>
                      {!u.active && <Status active={false} />}
                    </header>
                    {!latest ? (
                      <p className="muted">Nenhuma auditoria registrada.</p>
                    ) : (
                      <>
                        <p>
                          Última aplicação: {formatDate(latest.applied_on)}{" "}
                          <StatusBadge status={latest.status} />
                        </p>
                        {latest.status === "draft" && (
                          <Progress
                            answered={latest.answered}
                            total={latest.total_items}
                          />
                        )}
                        {finalized[0] && (
                          <p>
                            Última finalizada: <Result summary={finalized[0]} />{" "}
                            <Delta
                              current={finalized[0].final_score}
                              previous={finalized[1]?.final_score ?? null}
                            />
                          </p>
                        )}
                      </>
                    )}
                    <Link to={`/audit/units/${u.id}`}>Ver histórico</Link>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
      {creating && r.data && (
        <NewInspection
          units={r.data.units}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}
