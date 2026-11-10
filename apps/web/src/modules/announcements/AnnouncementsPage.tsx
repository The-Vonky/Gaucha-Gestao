import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../../core/auth/AuthProvider";
import { announcementTones, type AnnouncementType } from "../../shared/announcements/config";
import { announcementCategories, InstitutionalAnnouncementBar } from "../../shared/announcements/InstitutionalAnnouncementBar";
import { PageTitle, Notice, Modal, Confirm, EmptyState } from "../../shared/ui";
import { useResource } from "../../shared/useResource";
import { listNotices, saveNotice, noticeError, noticeStatuses, toneLabels, previewAnnouncement, type NoticeInput, type NoticeRecord, type NoticeState } from "./api";
import "./announcements-admin.css";
const empty: NoticeInput = { title: "", message: "", category: "information", tone: "info", starts_at: null, ends_at: null, state: "draft", show_feedback: true };
function localDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}T${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}:${String(date.getSeconds()).padStart(2,"0")}.${String(date.getMilliseconds()).padStart(3,"0")}`;
}
const dateText = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "Sem limite";
/** Capacidade global Core, nunca nome do papel. O SQL revalida todas as operações. */
export function AnnouncementsPage() {
  const auth = useAuth();
  if (!auth.can("announcements.notice.manage")) return <Notice error>Acesso não autorizado a comunicados.</Notice>;
  return <Manager key={`${auth.session?.user.id}:${JSON.stringify(auth.grants)}`} />;
}
function Manager() {
  const [offset, setOffset] = useState(0);
  const load = useCallback(() => listNotices(offset), [offset]);
  const resource = useResource(load);
  const [editing, setEditing] = useState<NoticeRecord | "new" | null>(null);
  const [success, setSuccess] = useState("");
  return <>
    <PageTitle eyebrow="Administração" title="Comunicados" description="Prepare, agende e publique mensagens para todas as pessoas ativas na plataforma.">
      <button className="primary" disabled={resource.loading || !!resource.error || !resource.data} onClick={() => { setSuccess(""); setEditing("new"); }}>Novo comunicado</button>
    </PageTitle>
    <Notice>Os comunicados publicados alcançam todos os perfis ativos. Use apenas conteúdo adequado a esse público. Datas e horários seguem o fuso do seu dispositivo.</Notice>
    {success && <Notice tone="success">{success}</Notice>}
    {resource.error && <Notice error>{noticeError(null)} <button onClick={resource.reload}>Tentar novamente</button></Notice>}
    {resource.loading && <p role="status">Carregando comunicados…</p>}
    {resource.data && <>
      {!resource.data.items.length ? <EmptyState title="Nenhum comunicado">Crie um rascunho para preparar a próxima comunicação institucional.</EmptyState> :
        <div className="announcement-records">{resource.data.items.map(row => <article key={row.id} className="announcement-record" data-active={row.status === "active"}>
          <div><h2>{row.title}</h2><p>{announcementCategories[row.category]} · <strong>{row.status === "active" ? "ATIVO" : noticeStatuses[row.status]}</strong></p>
            <p>Início: {dateText(row.starts_at)} · Término: {dateText(row.ends_at)}</p></div>
          <div className="actions"><button aria-label={`Editar ${row.title}`} disabled={row.state === "archived"} onClick={() => { setSuccess(""); setEditing(row); }}>Editar</button></div>
        </article>)}</div>}
      <div className="actions" aria-label="Paginação de comunicados"><button disabled={!offset} onClick={() => setOffset(n => Math.max(0,n-20))}>Anterior</button>
        <span>{resource.data.total} comunicados · Página {offset / 20 + 1}</span><button disabled={offset + 20 >= resource.data.total} onClick={() => setOffset(n=>n+20)}>Próxima</button>
        <button onClick={resource.reload}>Atualizar consulta</button></div>
    </>}
    {editing && <Editor key={editing === "new" ? "new" : `${editing.id}:${editing.version}`} previous={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => {
      setEditing(null); setSuccess("Comunicado salvo no servidor."); resource.reload(); window.dispatchEvent(new Event("announcements:refresh"));
    }} />}
  </>;
}
function Editor({ previous, onClose, onSaved }: { previous: NoticeRecord | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<NoticeInput>(previous ? { ...previous, starts_at: localDate(previous.starts_at), ends_at: localDate(previous.ends_at) } : { ...empty });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const formElement = useRef<HTMLFormElement>(null);
  const [conflict, setConflict] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const update = <K extends keyof NoticeInput>(key: K, value: NoticeInput[K]) => setForm(f=>({...f,[key]:value}));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || conflict) return;
    const state = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value as NoticeState | undefined;
    await persist(state || form.state);
  }
  async function persist(state: NoticeState) {
    if (busy || conflict) return;
    setError("");
    const starts_at = form.starts_at ? new Date(form.starts_at).toISOString() : null;
    const ends_at = form.ends_at ? new Date(form.ends_at).toISOString() : null;
    if (starts_at && ends_at && Date.parse(ends_at) <= Date.parse(starts_at)) { setError("O término deve ser posterior ao início."); return; }
    setBusy(true); const controller = new AbortController(); pending.current = controller;
    try {
      await saveNotice({ ...form, starts_at, ends_at, state }, previous, controller.signal);
      if (!controller.signal.aborted) onSaved();
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(noticeError(failure));
        setConflict(!!failure && typeof failure === "object" && "code" in failure && failure.code === "40001");
      }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <Modal title={previous ? "Editar comunicado" : "Novo comunicado"} onClose={onClose} busy={busy} wide>
    <form ref={formElement} onSubmit={event=>void submit(event)} className="announcement-editor">
      {error && <Notice error>{error}</Notice>}
      {conflict && <p>Copie as alterações que deseja preservar, feche este formulário e atualize a consulta para abrir a versão atual.</p>}
      <fieldset disabled={busy}><legend>Conteúdo e apresentação</legend>
        <label>Assunto<input required maxLength={120} value={form.title} onChange={e=>update("title",e.target.value)} /></label>
        <label>Mensagem completa<textarea required maxLength={1600} rows={5} value={form.message} onChange={e=>update("message",e.target.value)} /></label>
        <label>Categoria<select value={form.category} onChange={e=>update("category", e.target.value as AnnouncementType)}>
          {Object.entries(announcementCategories).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select></label>
        <fieldset className="announcement-presets"><legend>Cor</legend>
          {announcementTones.map(tone=><label key={tone} className="announcement-preset"><input type="radio" name="tone" checked={form.tone===tone} onChange={()=>update("tone",tone)} />
            <span className={`announcement-swatch announcement-swatch-${tone}`} aria-hidden="true" />{toneLabels[tone]}</label>)}
        </fieldset>
        <div className="announcement-fields"><label>Início da exibição<input type="datetime-local" step="any" min="0001-01-01T00:00" max="9999-12-31T23:59:59.999" value={form.starts_at ?? ""} onChange={e=>update("starts_at",e.target.value || null)} /></label>
          <label>Término da exibição<input type="datetime-local" step="any" min="0001-01-01T00:00" max="9999-12-31T23:59:59.999" value={form.ends_at ?? ""} onChange={e=>update("ends_at",e.target.value || null)} /></label></div>
        <label className="announcement-checkbox"><input type="checkbox" checked={form.show_feedback} onChange={e=>update("show_feedback",e.target.checked)} />Exibir botão Relatar no comunicado</label>
        <div className="actions"><button type="button" aria-pressed={previewMode==="desktop"} onClick={()=>setPreviewMode("desktop")}>Prévia desktop</button><button type="button" aria-pressed={previewMode==="mobile"} onClick={()=>setPreviewMode("mobile")}>Prévia mobile</button>
          <button type="button" onClick={()=>setPreview(true)}>Ler prévia completa</button></div>
        <div className={`announcement-preview announcement-preview-${previewMode}`} inert aria-hidden="true"><InstitutionalAnnouncementBar announcement={previewAnnouncement(form)} /></div>
        <p className="muted">Prévia ilustrativa; publicação depende da confirmação do servidor. Campos sem data não limitam o período.</p>
      </fieldset>
      <div className="actions">
        <button type="submit" className="primary" value={previous?.state ?? "draft"} disabled={busy || conflict}>{busy ? "Salvando…" : previous ? "Salvar alterações" : "Salvar rascunho"}</button>
        {previous?.state !== "published" && <button type="submit" value="published" disabled={busy || conflict}>Publicar comunicado</button>}
        {previous?.state === "published" && <button type="submit" value="inactive" disabled={busy || conflict}>Desativar comunicado</button>}
        {previous && <button type="button" disabled={busy || conflict} onClick={()=>{ if (formElement.current?.reportValidity()) setArchiving(true); }}>Arquivar comunicado</button>}
        <button type="button" disabled={busy} onClick={onClose}>Cancelar</button>
      </div>
    </form>
    {archiving && <Confirm title="Arquivar comunicado" description="O comunicado sairá de exibição e ficará imutável. Seu conteúdo e histórico serão preservados." onClose={()=>setArchiving(false)} onConfirm={async()=>{ setArchiving(false); await persist("archived"); }} />}
    {preview && <Modal title={form.title || "Prévia do comunicado"} onClose={()=>setPreview(false)}>
      <p>Categoria: {announcementCategories[form.category]}</p><p className="announcement-message">{form.message || "Mensagem do comunicado"}</p>
      <p>Início: {dateText(form.starts_at)} · Término: {dateText(form.ends_at)}</p>
    </Modal>}
  </Modal>;
}
