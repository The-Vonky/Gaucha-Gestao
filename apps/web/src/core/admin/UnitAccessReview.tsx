import { useCallback, useEffect, useId, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useResource } from "../../shared/useResource";
import { plural } from "../../shared/plural";
import {
  Badge,
  EmptyState,
  LoadingState,
  Metric,
  Notice,
  Pager,
} from "../../shared/ui";
import { ActiveBadge, Identifier, ListState, useLatest } from "./parts";
import * as api from "./unit-access-review-api";
import type {
  UnitAccessAssignment,
  UnitAccessSummary,
} from "./unit-access-review-api";
import "./unit-access-review.css";
const dateTime = (at: string) =>
  new Date(at).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
/** A figure the caller may not see is "Restrito", never 0. */
const figure = (value: number | null) => (value === null ? "Restrito" : value);
/**
 * Read-only review of who covers a unit (Unit Access Review v1). Self-contained: the
 * Administration coordinator mounts it; it never mutates and the RPCs/RLS stay authoritative.
 */
export function UnitAccessReview({ unitId }: { unitId: string }) {
  // A different unit starts from a clean state (filters, page).
  return <Review key={unitId} unitId={unitId} />;
}
function Review({ unitId }: { unitId: string }) {
  const headingId = useId();
  const [sector, setSector] = useState<string | null>(null);
  const summary = useResource(
    useCallback(
      // Wrapped so a denied (null) answer still replaces the previous summary.
      async () => ({ row: await api.unitAccessSummary(unitId, sector) }),
      [unitId, sector],
    ),
  );
  const latest = useLatest(summary);
  const data = latest?.row;
  return (
    <section
      className="unit-review"
      aria-labelledby={headingId}
      aria-busy={summary.loading}
    >
      {summary.loading && !latest && (
        <LoadingState label="Carregando acessos da unidade…" />
      )}
      {summary.error && (
        <Notice error>
          Não foi possível carregar os acessos da unidade. {summary.error}{" "}
          <button onClick={summary.reload}>Tentar novamente</button>
        </Notice>
      )}
      {latest && data === null && (
        <>
          <h2 id={headingId} className="visually-hidden">
            Acessos da unidade
          </h2>
          <Notice tone="warning">
            Unidade indisponível: ela não existe ou o seu acesso não permite
            consultá-la.
            {sector && (
              <>
                {" "}
                <button onClick={() => setSector(null)}>
                  Remover filtro de setor
                </button>
              </>
            )}
          </Notice>
        </>
      )}
      {data && (
        <>
          <UnitHeader headingId={headingId} summary={data} />
          <Counts summary={data} />
          {data.people_visibility === "available" ? (
            <Assignments unitId={unitId} sector={sector} onSector={setSector} />
          ) : (
            <Notice tone="warning">
              Você pode ver esta unidade, mas o seu acesso não permite listar
              pessoas nem contar atribuições. Os números aparecem como
              “Restrito” — isso não significa que não haja ninguém.
            </Notice>
          )}
        </>
      )}
    </section>
  );
}
function UnitHeader({
  headingId,
  summary,
}: {
  headingId: string;
  summary: UnitAccessSummary;
}) {
  return (
    <header className="unit-review-head">
      <div>
        <p className="eyebrow">Acessos da unidade</p>
        <h2 id={headingId}>
          <span className="adm-code">{summary.unit_code}</span>{" "}
          {summary.unit_name}
        </h2>
        <p className="adm-meta">
          Situação em {dateTime(summary.evaluated_at)}. Somente leitura.
        </p>
      </div>
      <ActiveBadge active={summary.unit_active} on="Ativa" off="Inativa" />
    </header>
  );
}
function Counts({ summary }: { summary: UnitAccessSummary }) {
  const restricted = summary.people_visibility === "restricted";
  return (
    <div
      className="unit-review-metrics"
      role="group"
      aria-label="Resumo dos acessos"
    >
      <Metric
        label="Pessoas com atribuição ativa"
        value={figure(summary.people_count)}
        hint={
          restricted
            ? "Sem permissão para listar pessoas"
            : "Atribuição ativa não é, por si só, acesso efetivo"
        }
      />
      <Metric
        label="Pessoas com acesso efetivo"
        value={figure(summary.effective_people_count)}
        hint={
          summary.effective_people_count === null
            ? "Composição dos perfis restrita: valor desconhecido"
            : "Usuário, perfil e permissões ativos"
        }
      />
      <Metric
        label="Atribuições globais"
        value={figure(summary.global_assignment_count)}
      />
      <Metric
        label="Atribuições da unidade"
        value={figure(summary.unit_assignment_count)}
      />
      <Metric
        label={
          summary.sector_id
            ? "Atribuições do setor filtrado"
            : "Atribuições de setores"
        }
        value={figure(summary.sector_assignment_count)}
      />
    </div>
  );
}
function Assignments({
  unitId,
  sector,
  onSector,
}: {
  unitId: string;
  sector: string | null;
  onSector: (sector: string | null) => void;
}) {
  const auth = useAuth();
  const [page, setPage] = useState(0);
  const [includeRevoked, setIncludeRevoked] = useState(false);
  // UI hint only: the sector catalog is readable under these global grants (unit_sectors_read).
  const sectorCatalog =
    auth.can("admin.sector.read") ||
    auth.can("admin.sector.manage") ||
    auth.can("admin.user.manage");
  const sectors = useResource(
    useCallback(
      () => (sectorCatalog ? api.unitSectors(unitId) : Promise.resolve(null)),
      [unitId, sectorCatalog],
    ),
  );
  const resource = useResource(
    useCallback(
      () => api.unitAccessAssignments(unitId, page, { sector, includeRevoked }),
      [unitId, page, sector, includeRevoked],
    ),
  );
  const data = useLatest(resource);
  // A page left past the end (assignments changed meanwhile) moves back to the last one.
  useEffect(() => {
    if (!data || page === 0 || data.rows.length) return;
    setPage(Math.max(0, Math.ceil(data.count / api.UNIT_ACCESS_PAGE_SIZE) - 1));
  }, [data, page]);
  const selectedSector = sectors.data?.find((s) => s.id === sector);
  const chooseSector = (value: string | null) => {
    onSector(value);
    setPage(0);
  };
  const groups = data ? byPerson(data.rows) : [];
  return (
    <>
      <form
        className="filters adm-filters unit-review-filters"
        aria-label="Filtros dos acessos da unidade"
        onSubmit={(e) => e.preventDefault()}
      >
        {sectorCatalog ? (
          <label>
            Setor
            <select
              value={sector ?? ""}
              disabled={!sectors.data?.length}
              onChange={(e) => chooseSector(e.target.value || null)}
            >
              <option value="">Todos os setores da unidade</option>
              {sectors.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                  {s.active ? "" : " (inativo)"}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="adm-meta unit-review-filter-note">
            Filtro por setor indisponível: seu acesso não inclui o catálogo de
            setores.
          </p>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={includeRevoked}
            onChange={(e) => {
              setIncludeRevoked(e.target.checked);
              setPage(0);
            }}
          />
          <span>Incluir revogadas (histórico)</span>
        </label>
        {data && (
          <p className="adm-total" role="status">
            <strong className="numeric">{data.people}</strong>{" "}
            {data.people === 1 ? "pessoa" : "pessoas"} ·{" "}
            {plural(data.count, "atribuição", "atribuições")}
            {includeRevoked ? "" : data.count === 1 ? " ativa" : " ativas"}
          </p>
        )}
      </form>
      {sectorCatalog && sectors.error && (
        <Notice error>
          Não foi possível carregar os setores da unidade. {sectors.error}{" "}
          <button onClick={sectors.reload}>Tentar novamente</button>
        </Notice>
      )}
      {sectorCatalog && sectors.data?.length === 0 && (
        <p className="adm-meta unit-review-filter-note">
          Nenhum setor vinculado a esta unidade.
        </p>
      )}
      <ListState
        loading={resource.loading && !data}
        error={resource.error}
        label="Carregando atribuições…"
        onRetry={resource.reload}
      />
      {data?.count === 0 && page === 0 && (
        <EmptyState
          title="Nenhuma atribuição encontrada"
          actions={
            sector && (
              <button type="button" onClick={() => chooseSector(null)}>
                Ver todos os setores
              </button>
            )
          }
        >
          {sector
            ? `Nenhuma atribuição ${includeRevoked ? "" : "ativa "}cobre ${selectedSector ? `o setor ${selectedSector.name}` : "o setor selecionado"} nesta unidade.`
            : includeRevoked
              ? "Nenhuma atribuição, ativa ou revogada, cobre esta unidade."
              : "Nenhuma atribuição ativa cobre esta unidade. Marque “Incluir revogadas” para ver o histórico."}
        </EmptyState>
      )}
      {groups.length > 0 && (
        <ul
          className="adm-list unit-review-people"
          aria-label="Pessoas com atribuições na unidade"
          aria-busy={resource.loading}
        >
          {groups.map(([userId, rows]) => (
            <Person key={userId} rows={rows} />
          ))}
        </ul>
      )}
      {data && (
        <Pager
          page={page}
          count={data.count}
          size={api.UNIT_ACCESS_PAGE_SIZE}
          onChange={setPage}
        />
      )}
    </>
  );
}
/** Assignments of the page grouped by person, keeping the server order. */
function byPerson(rows: UnitAccessAssignment[]) {
  const groups = new Map<string, UnitAccessAssignment[]>();
  for (const row of rows)
    groups.set(row.user_id, [...(groups.get(row.user_id) ?? []), row]);
  return [...groups];
}
function Person({ rows }: { rows: UnitAccessAssignment[] }) {
  const person = rows[0];
  const active = rows.filter((r) => r.assignment_active).length;
  return (
    <li
      className={`adm-row unit-review-person${person.user_active ? "" : " inactive"}`}
    >
      <div className="adm-main">
        <p className="adm-title">
          <strong>{person.user_display_name}</strong>
          {!person.user_active && (
            <Badge tone="neutral" icon="close">
              Usuário inativo
            </Badge>
          )}
          {active > 1 && (
            <Badge tone="info">Atribuições sobrepostas ({active})</Badge>
          )}
        </p>
        <ul
          className="unit-review-assignments"
          aria-label={`Atribuições de ${person.user_display_name}`}
        >
          {rows.map((row) => (
            <AssignmentItem key={row.assignment_id} row={row} />
          ))}
        </ul>
      </div>
    </li>
  );
}
function origin(row: UnitAccessAssignment) {
  if (row.scope_type === "global") return "Global · toda a empresa";
  const unit =
    row.unit_label_source === "current"
      ? `${row.unit_code} · ${row.unit_name}`
      : "Unidade restrita";
  if (row.scope_type === "unit") return `Unidade ${unit}`;
  const sector =
    row.sector_label_source === "current"
      ? `${row.sector_code} · ${row.sector_name}`
      : "setor restrito";
  return `Setor ${sector} (${unit})`;
}
/** Why an assignment grants nothing now; checked in the same order as the Core helper. */
function noEffectReason(row: UnitAccessAssignment) {
  if (!row.assignment_active) return "atribuição revogada";
  if (!row.user_active) return "usuário inativo";
  if (!row.role_active) return "perfil inativo";
  return "perfil sem permissões ativas";
}
function Effect({ row }: { row: UnitAccessAssignment }) {
  if (row.effective === true)
    return (
      <Badge tone="success" icon="check">
        Acesso efetivo
      </Badge>
    );
  if (row.effective === false)
    return <Badge tone="warning">Sem efeito · {noEffectReason(row)}</Badge>;
  return (
    <Badge tone="neutral">Efeito desconhecido · composição restrita</Badge>
  );
}
function AssignmentItem({ row }: { row: UnitAccessAssignment }) {
  const grantor =
    row.granted_by_name ?? (row.granted_by ? "usuário restrito" : null);
  const active = row.active_permission_keys ?? [];
  const inactive = row.inactive_permission_keys ?? [];
  return (
    <li
      className={`unit-review-assignment${row.assignment_active ? "" : " revoked"}`}
    >
      <p className="adm-title">
        <span className="unit-review-role">{row.role_name}</span>
        {!row.role_active && <Badge tone="neutral">Perfil inativo</Badge>}
        <Badge tone={row.scope_type === "global" ? "info" : "neutral"}>
          {origin(row)}
        </Badge>
      </p>
      <p className="unit-review-states">
        {row.assignment_active ? (
          <Badge tone="success">Ativa</Badge>
        ) : (
          <Badge tone="neutral" icon="close">
            Revogada
          </Badge>
        )}
        <Effect row={row} />
        {row.scope_type === "sector" && row.sector_active === false && (
          <Badge tone="neutral">Setor inativo</Badge>
        )}
        {row.scope_type !== "global" && row.unit_active === false && (
          <Badge tone="neutral">Unidade inativa</Badge>
        )}
      </p>
      <p className="adm-meta">
        Concedida em {dateTime(row.granted_at)}
        {grantor ? ` por ${grantor}` : ""}.
        {!row.assignment_active &&
          (row.revocation_evidence === "audit_event" && row.revoked_at
            ? ` Revogada em ${dateTime(row.revoked_at)}${row.revoked_by_name ? ` por ${row.revoked_by_name}` : row.revoked_by ? " por usuário restrito" : ""}.`
            : " Autor e data da revogação indisponíveis para o seu acesso.")}
      </p>
      <details className="unit-review-details">
        <summary>
          {row.composition_visibility === "available"
            ? `Permissões neste escopo (${active.length})`
            : "Permissões neste escopo (restritas)"}
        </summary>
        {row.composition_visibility === "available" ? (
          <>
            {active.length ? (
              <ul className="unit-review-keys" aria-label="Permissões ativas">
                {active.map((key) => (
                  <li key={key}>
                    <code>{key}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="adm-meta">Nenhuma permissão ativa.</p>
            )}
            {inactive.length > 0 && (
              <p className="adm-meta">
                Permissões inativas (não concedem acesso):{" "}
                {inactive.map((key, i) => (
                  <span key={key}>
                    {i > 0 && ", "}
                    <code>{key}</code>
                  </span>
                ))}
              </p>
            )}
            <p className="adm-meta">
              Válidas apenas no escopo desta atribuição; regras de cada módulo
              ainda se aplicam.
            </p>
          </>
        ) : (
          <p className="adm-meta">
            O seu acesso não permite ler a composição deste perfil.
          </p>
        )}
        <p className="unit-review-ids">
          <Identifier label="Perfil">{row.role_key}</Identifier>
          <Identifier label="Atribuição">{row.assignment_id}</Identifier>
        </p>
      </details>
    </li>
  );
}
