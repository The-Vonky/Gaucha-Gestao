import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../../core/auth/AuthProvider";
import { EmptyState, Modal, Notice, PageTitle } from "../../shared/ui";
import { useResource } from "../../shared/useResource";
import { downloadAttachment, getFeedback, kinds, listFeedback, modules, type Filters, type Kind, type Module, type ReportSummary } from "./api";
import "./feedback.css";

const initialFilters: Filters = { kind: "", module: "", from: "", until: "" };
const pageSize = 20;
const localTime = (value: string) => new Date(value).toLocaleString("pt-BR");

export function FeedbackPage() {
  const auth = useAuth();
  if (!auth.can("feedback.report.read")) return <Notice error>Acesso não autorizado a relatos.</Notice>;
  return <Inbox key={auth.session?.user.id} />;
}

function Inbox() {
  const [draft, setDraft] = useState(initialFilters);
  const [query, setQuery] = useState({ filters: initialFilters, cursors: [] as ReportSummary[] });
  const [selected, setSelected] = useState<string | null>(null);
  const load = useCallback(() => listFeedback(query.filters, query.cursors.at(-1)), [query]);
  const resource = useResource(load);
  const rows = resource.data?.slice(0, pageSize);
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery({ filters: draft, cursors: [] });
  }
  return <>
    <PageTitle eyebrow="Administração" title="Relatos e sugestões" description="Consulte problemas e sugestões enviados pela equipe." />
    <form className="feedback-filters" onSubmit={filter}>
      <label>Tipo<select value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as Kind | "" })}>
        <option value="">Todos</option>
        {Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label>Módulo<select value={draft.module} onChange={event => setDraft({ ...draft, module: event.target.value as Module | "" })}>
        <option value="">Todos</option>
        {Object.entries(modules).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label>De<input type="date" value={draft.from} max={draft.until || undefined} onChange={event => setDraft({ ...draft, from: event.target.value })} /></label>
      <label>Até<input type="date" value={draft.until} min={draft.from || undefined} onChange={event => setDraft({ ...draft, until: event.target.value })} /></label>
      <button type="submit">Filtrar</button>
    </form>
    {resource.loading && <p role="status">Carregando relatos…</p>}
    {resource.error && <Notice error>Não foi possível consultar os relatos. <button onClick={resource.reload}>Tentar novamente</button></Notice>}
    {rows && !rows.length && <EmptyState title="Nenhum relato encontrado">Os relatos recebidos aparecem aqui conforme os filtros aplicados.</EmptyState>}
    {rows && rows.length > 0 && <ul className="feedback-list">{rows.map(row => <li key={row.id}>
      <div>
        <strong>{kinds[row.kind]} · {modules[row.module]}</strong>
        <p>{row.display_name} · <time dateTime={row.received_at}>{localTime(row.received_at)}</time></p>
        <p>{row.summary}</p>
      </div>
      <button type="button" aria-label={`Ler relato ${row.id}`} onClick={() => setSelected(row.id)}>Ler relato</button>
    </li>)}</ul>}
    {rows && <div className="actions feedback-actions" aria-label="Paginação de relatos">
      <button disabled={!query.cursors.length} onClick={() => setQuery({ ...query, cursors: query.cursors.slice(0, -1) })}>Anterior</button>
      <span>Página {query.cursors.length + 1}</span>
      <button disabled={(resource.data?.length ?? 0) <= pageSize} onClick={() => {
        const last = rows.at(-1);
        if (last) setQuery({ ...query, cursors: [...query.cursors, last] });
      }}>Próxima</button>
    </div>}
    {selected && <Detail key={selected} id={selected} onClose={() => setSelected(null)} />}
  </>;
}

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const load = useCallback(() => getFeedback(id), [id]);
  const resource = useResource(load);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const row = resource.data;
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function download(key: string) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setDownloading(true);
    setDownloadError(false);
    try {
      await downloadAttachment(key, controller.signal);
    } catch {
      if (!controller.signal.aborted) setDownloadError(true);
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setDownloading(false);
    }
  }
  return <Modal title="Detalhes do relato" onClose={onClose} wide>
    {resource.loading && <p role="status">Carregando relato…</p>}
    {resource.error && <Notice error>Não foi possível consultar este relato. <button onClick={resource.reload}>Tentar novamente</button></Notice>}
    {row && <div className="feedback-detail-text">
      <p><strong>{kinds[row.kind]} · {modules[row.module]}</strong></p>
      <p>{row.display_name} · <time dateTime={row.received_at}>{localTime(row.received_at)}</time></p>
      <p>Identificador {row.id}</p>
      <p>Origem {modules[row.origin]}{row.app_version && ` · Versão ${row.app_version}`}</p>
      <p>{row.description}</p>
      {row.attachment_key && <button disabled={downloading} onClick={() => { if (row.attachment_key) void download(row.attachment_key); }}>{downloading ? "Baixando…" : "Baixar anexo"}</button>}
      {downloadError && <Notice error>Não foi possível baixar o anexo.</Notice>}
    </div>}
  </Modal>;
}
