import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../core/auth/AuthProvider";
import { useResource } from "../../shared/useResource";
import { Notice, PageTitle } from "../../shared/ui";
import * as api from "./api";
import { NewInspection } from "./NewInspection";
import { Delta, formatDate, Progress, Result, StatusBadge } from "./Result";
import { ReportingActions } from "./reporting/ReportingActions";
export function UnitHistory() {
  const { unitId = "" } = useParams();
  const auth = useAuth();
  const [creating, setCreating] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const r = useResource(
    useCallback(async () => {
      const [units, rows] = await Promise.all([
        api.units(),
        api.summaries({ p_unit: unitId }),
      ]);
      return { units, unit: units.find((u) => u.id === unitId), rows };
    }, [unitId]),
  );
  const unit = r.data?.unit;
  const finalized = r.data?.rows.filter((x) => x.status === "finalized") ?? [];
  return (
    <>
      <nav className="breadcrumb" aria-label="Trilha">
        <Link to="/audit">Auditorias</Link> /{" "}
        <span>{unit?.name ?? "Unidade"}</span>
      </nav>
      {r.loading && <Notice>Carregando histórico…</Notice>}
      {r.error && (
        <Notice error>
          {r.error} <button onClick={r.reload}>Tentar novamente</button>
        </Notice>
      )}
      {r.data && !unit && (
        <Notice error>
          Unidade não encontrada ou sem acesso de Auditoria.
        </Notice>
      )}
      {r.data && unit && (
        <>
          <PageTitle
            title={unit.name}
            description="Histórico de auditorias da unidade"
          >
            {unit.active &&
              auth.can("audit.inspection.create", { unit_id: unit.id }) && (
                <button className="primary" onClick={() => setCreating(true)}>
                  Nova auditoria
                </button>
              )}
          </PageTitle>
          {auth.can("audit.inspection.read", { unit_id: unit.id }) &&
            auth.can("audit.inspection.export", { unit_id: unit.id }) && <section className="audit-report-filters" aria-label="Relatório do histórico">
              <p>Filtre pela data de aplicação (limites inclusivos, até 5.000 registros). Sem datas, o relatório inclui todo o histórico.</p>
              <div className="actions">
                <label>De <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
                <label>Até <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
              </div>
              {from && to && from > to ? <Notice error>A data inicial deve ser anterior ou igual à final.</Notice> :
                <ReportingActions kind="unit_history" unitId={unit.id} from={from} to={to} />}
            </section>}
          {!r.data.rows.length && (
            <Notice>Nenhuma auditoria registrada para esta unidade.</Notice>
          )}
          <ul className="record-list">
            {r.data.rows.map((row) => {
              const previous =
                row.status === "finalized"
                  ? finalized[finalized.indexOf(row) + 1]
                  : undefined;
              return (
                <li key={row.id}>
                  <div>
                    <strong>{formatDate(row.applied_on)}</strong>{" "}
                    <StatusBadge status={row.status} />
                    <p>Responsável: {row.responsible_name}</p>
                    {row.status === "draft" && (
                      <Progress
                        answered={row.answered}
                        total={row.total_items}
                      />
                    )}
                    <p>
                      <Result summary={row} />{" "}
                      {previous && (
                        <Delta
                          current={row.final_score}
                          previous={previous.final_score}
                        />
                      )}
                    </p>
                  </div>
                  <Link
                    className="button-link"
                    to={`/audit/inspections/${row.id}`}
                  >
                    Abrir
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {creating && r.data && (
        <NewInspection
          units={r.data.units}
          unitId={unitId}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}
