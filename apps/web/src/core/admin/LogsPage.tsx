import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { plural } from "../../shared/plural";
import {
  Badge,
  EmptyState,
  LoadingState,
  Modal,
  Notice,
  PageTitle,
  Pager,
} from "../../shared/ui";
import type { Json } from "../types";
import {
  AuditLogReviewError,
  auditLogReviewPage,
  EMPTY_FILTERS,
  FILTER_MAX,
  filterProblem,
  LOG_PAGE_SIZE,
  normalizeFilters,
  searchesByName,
  type AuditLogReviewEntry,
  type AuditLogReviewFilters,
  type AuditLogReviewPage,
  type LogReference,
} from "./audit-log-review-api";
import "./admin.css";
import "./audit-log-review.css";
/** Modules that write to the log. */
const MODULES: Record<string, string> = {
  core: "Plataforma",
  audit: "Auditoria",
  action_plans: "Planos de ação",
};
/** Events written by Core, Audit and Action Plans; unknown values are shown as stored. */
const ACTIONS: Record<string, string> = {
  insert: "Inclusão",
  update: "Alteração",
  delete: "Exclusão",
  activate: "Ativação",
  deactivate: "Desativação",
  grant: "Concessão",
  revoke: "Revogação",
  create: "Criação",
  finalize: "Finalização",
  reopen: "Reabertura",
  status: "Mudança de situação",
  verify: "Verificação de eficácia",
  re_verify: "Reverificação de eficácia",
  source_activate: "Origem reativada",
  source_deactivate: "Origem desativada",
  source_update: "Origem atualizada",
  evidence_add: "Evidência anexada",
  evidence_remove: "Evidência removida",
  cover_upload_begin: "Envio de capa iniciado",
  cover_ready: "Capa publicada",
  cover_cancel: "Envio de capa cancelado",
  cover_retire: "Capa retirada",
  cover_purge: "Capa expurgada",
};
const ENTITIES: Record<string, string> = {
  profiles: "Usuário",
  units: "Unidade",
  sectors: "Setor",
  unit_sectors: "Vínculo unidade/setor",
  permissions: "Permissão",
  roles: "Perfil de acesso",
  role_permissions: "Permissão do perfil",
  user_role_assignments: "Atribuição de acesso",
  unit_cover_assets: "Capa da unidade",
  inspection: "Auditoria",
  checklist_evidence: "Evidência do checklist",
  plan: "Plano de ação",
  evidence: "Evidência do plano",
};
const byLabel = (entries: Record<string, string>) =>
  Object.entries(entries).sort(([, a], [, b]) => a.localeCompare(b, "pt-BR"));
const moduleLabel = (module: string) => MODULES[module] ?? module;
const actionLabel = (action: string) => ACTIONS[action] ?? action;
const entityLabel = (entity: string) => ENTITIES[entity] ?? entity;
const DATABASE_ACTOR = "Operação administrativa do banco";
const UNAVAILABLE_NAME = "Nome indisponível";
const dateTime = (value: string) => new Date(value).toLocaleString("pt-BR");
function Timestamp({ value }: { value: string }) {
  const d = new Date(value);
  return (
    <time className="adm-time numeric" dateTime={value}>
      <span>{d.toLocaleDateString("pt-BR")}</span>
      <span>{d.toLocaleTimeString("pt-BR")}</span>
    </time>
  );
}
/** JSON is rendered as text (React escapes it) inside its own scrollable region. */
function JsonBlock({ label, value }: { label: string; value: Json }) {
  return (
    <section className="adm-json">
      <h3 className="adm-subhead">{label}</h3>
      {value === null ? (
        <p className="adm-meta">Sem conteúdo registrado.</p>
      ) : (
        <pre tabIndex={0} role="region" aria-label={label}>
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </section>
  );
}
/** Who acted, in operator language. Never a guessed name: unreadable stays unavailable. */
function Actor({ actor }: { actor: LogReference }) {
  if (actor.kind === "none") return <>{DATABASE_ACTOR}</>;
  if (actor.kind === "unavailable")
    return <span className="log-unavailable">{UNAVAILABLE_NAME}</span>;
  return (
    <>
      <span className="log-name">{actor.name}</span>
      {actor.active === false && <Badge tone="neutral">Inativo</Badge>}
    </>
  );
}
/** Unit or sector label: code · name, inactive state, or unavailable for this access. */
function Place({ value, noun }: { value: LogReference; noun: string }) {
  if (value.kind === "none") return null;
  if (value.kind === "unavailable")
    return <span className="log-unavailable">{noun} indisponível</span>;
  return (
    <>
      <span>
        {value.code && <span className="log-code">{value.code}</span>}
        {value.name}
      </span>
      {value.active === false && <Badge tone="neutral">Inativa</Badge>}
    </>
  );
}
function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}
/** Event detail: plain summary first, identifiers and raw JSON in a collapsed technical section. */
function EventDetail({
  entry,
  onClose,
  onFilter,
}: {
  entry: AuditLogReviewEntry;
  onClose: () => void;
  onFilter: (filters: Partial<AuditLogReviewFilters>) => void;
}) {
  const { actor, unit, sector } = entry;
  return (
    <Modal title="Detalhes do evento" onClose={onClose}>
      <dl className="adm-facts">
        <Fact term="Quando">
          <span className="numeric">{dateTime(entry.occurredAt)}</span>
        </Fact>
        <Fact term="Quem">
          <span className="log-inline">
            <Actor actor={actor} />
          </span>
        </Fact>
        <Fact term="O que">
          {actionLabel(entry.action)} · {moduleLabel(entry.module)}
        </Fact>
        <Fact term="Registro">{entityLabel(entry.entityType)}</Fact>
        <Fact term="Unidade">
          {unit.kind === "none" ? (
            "Sem unidade vinculada"
          ) : (
            <span className="log-inline">
              <Place value={unit} noun="Unidade" />
            </span>
          )}
        </Fact>
        <Fact term="Setor">
          {sector.kind === "none" ? (
            "Sem setor vinculado"
          ) : (
            <span className="log-inline">
              <Place value={sector} noun="Setor" />
            </span>
          )}
        </Fact>
      </dl>
      {(actor.kind === "unavailable" ||
        unit.kind === "unavailable" ||
        sector.kind === "unavailable") && (
        <p className="adm-meta log-hint">
          “Indisponível” indica um nome que não pode ser exibido para o seu
          acesso ou que não existe mais.
        </p>
      )}
      <div className="actions log-detail-actions">
        {actor.kind !== "none" && (
          <button
            type="button"
            onClick={() => onFilter({ actor: actor.id })}
          >
            Ver eventos desta pessoa
          </button>
        )}
        {entry.entityId && (
          <button
            type="button"
            onClick={() =>
              onFilter({
                entityType: entry.entityType,
                entityId: entry.entityId,
              })
            }
          >
            Ver eventos deste registro
          </button>
        )}
      </div>
      <details className="log-tech">
        <summary>Detalhes técnicos</summary>
        <dl className="adm-facts">
          <Fact term="Evento">
            <code>{entry.id}</code>
          </Fact>
          <Fact term="Módulo / ação">
            <code>
              {entry.module}.{entry.action}
            </code>
          </Fact>
          <Fact term="Registro">
            <code>{entry.entityType}</code> <code>{entry.entityId}</code>
          </Fact>
          {actor.kind !== "none" && (
            <Fact term="Pessoa">
              <code>{actor.id}</code>
            </Fact>
          )}
          {unit.kind !== "none" && (
            <Fact term="Unidade">
              <code>{unit.id}</code>
            </Fact>
          )}
          {sector.kind !== "none" && (
            <Fact term="Setor">
              <code>{sector.id}</code>
            </Fact>
          )}
          {entry.correlationId && (
            <Fact term="Correlação">
              <code>{entry.correlationId}</code>
            </Fact>
          )}
          <Fact term="Data (UTC)">
            <code>{entry.occurredAt}</code>
          </Fact>
        </dl>
        <JsonBlock label="Antes" value={entry.before} />
        <JsonBlock label="Depois" value={entry.after} />
        <JsonBlock label="Metadados" value={entry.metadata} />
      </details>
    </Modal>
  );
}
/** What is being read: applied filters, page and the instant that pins the result. */
type Query = { filters: AuditLogReviewFilters; page: number; asOf: string };
const fresh = (filters: AuditLogReviewFilters): Query => ({
  filters,
  page: 0,
  asOf: new Date().toISOString(),
});
export function LogsPage() {
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [query, setQuery] = useState(() => fresh(EMPTY_FILTERS));
  const [problem, setProblem] = useState("");
  const [result, setResult] = useState<{
    data?: AuditLogReviewPage;
    error?: AuditLogReviewError;
    loading: boolean;
  }>({ loading: true });
  const [selected, setSelected] = useState<AuditLogReviewEntry>();
  useEffect(() => {
    let current = true;
    setResult((r) => ({ data: r.data, loading: true }));
    auditLogReviewPage(query.page, query.filters, query.asOf)
      .then((data) => {
        if (current) setResult({ data, loading: false });
      })
      .catch((e: unknown) => {
        if (current)
          setResult({
            loading: false,
            error:
              e instanceof AuditLogReviewError
                ? e
                : new AuditLogReviewError("failed", ""),
          });
      });
    return () => {
      current = false;
    };
  }, [query]);
  const { data, error, loading } = result;
  // A page left past the end goes back to the first page instead of showing nothing.
  useEffect(() => {
    if (data && !data.rows.length && query.page > 0)
      setQuery((q) => ({ ...q, page: 0 }));
  }, [data, query.page]);
  function apply(next: AuditLogReviewFilters) {
    const filters = normalizeFilters(next);
    const issue = filterProblem(filters);
    setProblem(issue);
    if (issue) return;
    setDraft(filters);
    setQuery(fresh(filters));
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    apply(draft);
  }
  function reset() {
    setProblem("");
    setDraft(EMPTY_FILTERS);
    setQuery(fresh(EMPTY_FILTERS));
  }
  const field =
    (key: keyof AuditLogReviewFilters) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft((d) => ({ ...d, [key]: e.target.value }));
  const active = Object.values(query.filters).filter(Boolean).length;
  const byName = searchesByName(query.filters);
  const dateProblem = problem.includes("data");
  return (
    <>
      <PageTitle
        eyebrow="Administração"
        title="Logs do sistema"
        description="Quem fez o quê, quando e onde. Você vê apenas os eventos dentro do seu escopo de acesso. Somente leitura."
      />
      <form
        className="filters adm-filters log-filters"
        aria-label="Filtros dos logs"
        noValidate
        onSubmit={submit}
      >
        <label>
          De
          <input
            type="date"
            name="from"
            value={draft.from}
            max={draft.to || undefined}
            aria-invalid={dateProblem || undefined}
            onChange={field("from")}
          />
        </label>
        <div className="log-field">
          <label>
            Até
            <input
              type="date"
              name="to"
              value={draft.to}
              min={draft.from || undefined}
              aria-invalid={dateProblem || undefined}
              aria-describedby="log-to-hint"
              onChange={field("to")}
            />
          </label>
          <span id="log-to-hint" className="log-field-hint">
            Inclui o dia inteiro.
          </span>
        </div>
        <div className="log-field adm-filter-wide">
          <label>
            Quem
            <input
              type="search"
              name="actor"
              value={draft.actor}
              maxLength={FILTER_MAX}
              placeholder="Nome ou identificador da pessoa"
              aria-describedby="log-actor-hint"
              onChange={field("actor")}
            />
          </label>
          <span id="log-actor-hint" className="log-field-hint">
            Encontra apenas pessoas que você pode consultar.
          </span>
        </div>
        <label>
          Módulo
          <select name="module" value={draft.module} onChange={field("module")}>
            <option value="">Todos</option>
            {Object.entries(MODULES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ação
          <select name="action" value={draft.action} onChange={field("action")}>
            <option value="">Todas</option>
            {byLabel(ACTIONS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo de registro
          <select
            name="entityType"
            value={draft.entityType}
            onChange={field("entityType")}
          >
            <option value="">Todos</option>
            {byLabel(ENTITIES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
            {draft.entityType && !ENTITIES[draft.entityType] && (
              <option value={draft.entityType}>{draft.entityType}</option>
            )}
          </select>
        </label>
        <label className="adm-filter-wide">
          Identificador do registro
          <input
            name="entityId"
            value={draft.entityId}
            maxLength={FILTER_MAX}
            placeholder="Código técnico exato"
            onChange={field("entityId")}
          />
        </label>
        <div className="adm-filter-actions">
          <button type="submit" className="primary">
            Filtrar
          </button>
          <button type="button" onClick={reset}>
            Limpar filtros
          </button>
        </div>
        {problem && (
          <div className="log-problem">
            <Notice error>{problem}</Notice>
          </div>
        )}
      </form>
      {data && !error && (
        <div className="log-status">
          <p className="muted adm-log-status" role="status">
          <span className="numeric">
            {plural(data.count, "evento", "eventos")}
          </span>
          {active > 0 && (
            <span>
              {plural(active, "filtro aplicado", "filtros aplicados")}
            </span>
          )}
          <span>Mais recentes primeiro</span>
          <span>
            Consulta de{" "}
            <time className="numeric" dateTime={query.asOf}>
              {dateTime(query.asOf)}
            </time>
          </span>
          </p>
          <button
            type="button"
            className="small ghost"
            onClick={() => setQuery(fresh(query.filters))}
          >
            Atualizar
          </button>
        </div>
      )}
      {byName && !error && (
        <Notice>
          A busca por nome considera somente pessoas que você pode consultar.
          Eventos de pessoas fora do seu acesso não aparecem nesta busca.
        </Notice>
      )}
      {loading && !data && !error && <LoadingState label="Carregando eventos…" />}
      {error?.kind === "denied" && (
        <EmptyState
          title="Acesso aos logs indisponível"
          actions={
            <button type="button" onClick={() => setQuery(fresh(query.filters))}>
              Tentar novamente
            </button>
          }
        >
          {error.message}
        </EmptyState>
      )}
      {error && error.kind !== "denied" && (
        <Notice error>
          {error.message}{" "}
          {error.kind === "invalid" ? (
            <button type="button" onClick={reset}>
              Limpar filtros
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setQuery((q) => ({ ...q }))}
            >
              Tentar novamente
            </button>
          )}
        </Notice>
      )}
      {data && !error && !data.rows.length && query.page === 0 && (
        <EmptyState
          title="Nenhum evento encontrado"
          actions={
            active > 0 && (
              <button type="button" onClick={reset}>
                Limpar filtros
              </button>
            )
          }
        >
          {active > 0
            ? "Nenhum evento dentro do seu acesso corresponde aos filtros aplicados."
            : "Ainda não há eventos registrados dentro do seu acesso."}
        </EmptyState>
      )}
      {data && !error && data.rows.length > 0 && (
        <ul
          className="adm-list adm-logs"
          aria-label="Eventos"
          aria-busy={loading}
        >
          {data.rows.map((entry) => (
            <li key={entry.id} className="adm-row log-row">
              <Timestamp value={entry.occurredAt} />
              <div className="adm-main">
                <p className="adm-title">
                  <strong>{actionLabel(entry.action)}</strong>
                  <span className="adm-entity">
                    {entityLabel(entry.entityType)}
                  </span>
                  <Badge tone="neutral">{moduleLabel(entry.module)}</Badge>
                </p>
                <p className="adm-meta log-inline">
                  <span>Por</span> <Actor actor={entry.actor} />
                </p>
                {(entry.unit.kind !== "none" ||
                  entry.sector.kind !== "none") && (
                  <p className="adm-meta log-inline">
                    <Place value={entry.unit} noun="Unidade" />
                    {entry.unit.kind !== "none" &&
                      entry.sector.kind !== "none" && (
                        <span aria-hidden="true">·</span>
                      )}
                    <Place value={entry.sector} noun="Setor" />
                  </p>
                )}
              </div>
              <div className="adm-actions">
                <button
                  type="button"
                  className="small ghost"
                  aria-label={`Detalhes: ${actionLabel(entry.action)} em ${entityLabel(entry.entityType)}, ${dateTime(entry.occurredAt)}`}
                  onClick={() => setSelected(entry)}
                >
                  Detalhes
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && !error && (
        <Pager
          page={query.page}
          count={data.count}
          size={LOG_PAGE_SIZE}
          onChange={(page) => setQuery((q) => ({ ...q, page }))}
        />
      )}
      {selected && (
        <EventDetail
          entry={selected}
          onClose={() => setSelected(undefined)}
          onFilter={(next) => {
            setSelected(undefined);
            apply({ ...EMPTY_FILTERS, ...next });
          }}
        />
      )}
    </>
  );
}
