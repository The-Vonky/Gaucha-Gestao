import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../core/auth/AuthProvider";
import { Confirm, EmptyState, LoadingState, Notice, PageTitle, Table } from "../../shared/ui";
import { deleteEntry, entryDetail, listEntries, listSalesUnits, salesMessage } from "./api";
import { EntryEditor } from "./EntryEditor";
import { civilDate, money, validDate } from "./format";
import type { PaymentMethod, SalesEntry, SalesUnit } from "./types";
import "./sales.css";

const PAGE_SIZE = 25;
export function SalesPage() {
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const from = params.get("from") ?? "", to = params.get("to") ?? "";
  const unit = params.get("unit") ?? "", method = params.get("method") ?? "";
  const rawPage = params.get("page") ?? "0";
  const page = /^\d{1,7}$/.test(rawPage) ? Number(rawPage) : 0;
  const active = !!auth.profile?.active;
  const has = (action: string) => active && auth.grants.some(g =>
    g.permission === `sales.entry.${action}` && (g.scope_type === "unit" || g.scope_type === "global"));
  const allowed = ["read", "create", "edit", "delete"].some(has);
  const read = has("read");
  const access = JSON.stringify([auth.session?.user.id, active, auth.grants]);
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([access, from, to, unit, method, page, revision]);
  const [result, setResult] = useState<{ key: string; access: string; units: SalesUnit[]; rows: SalesEntry[]; next: boolean; error: string }>();
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");
  const [editor, setEditor] = useState<{ entry?: SalesEntry }>();
  const [deleting, setDeleting] = useState<SalesEntry>();
  const [opening, setOpening] = useState(false);
  const [deleteConflict, setDeleteConflict] = useState(false);
  const [deleteUnavailable, setDeleteUnavailable] = useState(false);
  const generation = useRef(0);
  const actionGeneration = useRef(0);
  const actionPending = useRef(false);
  const current = result?.key === key ? result : undefined;
  // O catálogo não é recarregado por edição de filtros; uma atualização explícita ou
  // mutação reavalia atividade e capacidades. Toda RPC revalida acesso no banco.
  const catalog = useRef<{ key: string; promise: Promise<SalesUnit[]> } | undefined>(undefined);
  const catalogKey = JSON.stringify([access, revision]);
  useEffect(() => {
    setEditor(undefined); setDeleting(undefined); setSuccess(""); setActionError("");
    ++actionGeneration.current;
    return () => { ++actionGeneration.current; };
  }, [access]);
  useEffect(() => {
    const request = ++generation.current;
    if (!allowed) return;
    async function load() {
      try {
        if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)
          || (method && method !== "Stone" && method !== "PIX"))
          throw new Error("filters");
        if (catalog.current?.key !== catalogKey)
          catalog.current = { key: catalogKey, promise: listSalesUnits() };
        const [units, rows] = await Promise.all([
          catalog.current.promise,
          read ? listEntries({ from: from || undefined, to: to || undefined,
            unit_id: unit || undefined, payment_method: method as PaymentMethod || undefined,
            limit: PAGE_SIZE + 1, offset: page * PAGE_SIZE }) : Promise.resolve([]),
        ]);
        if (generation.current !== request) return;
        // Uma remoção concorrente pode esvaziar a última página; voltar preservando filtros.
        if (read && page > 0 && rows.length === 0) {
          setParams(previous => { const next = new URLSearchParams(previous); next.delete("page"); return next; }, { replace: true });
          return;
        }
        setResult({ key, access, units, rows: rows.slice(0, PAGE_SIZE), next: rows.length > PAGE_SIZE, error: "" });
      } catch (e) {
        if (generation.current !== request) return;
        catalog.current = undefined;
        setResult({ key, access, units: [], rows: [], next: false,
          error: e instanceof Error && e.message === "filters" ? "Confira as datas e a forma de pagamento dos filtros." : salesMessage(e) });
      }
    }
    void load();
    return () => { ++generation.current; };
  }, [key, access, allowed, read, from, to, unit, method, page, catalogKey, setParams]);
  const units = result?.access === access ? result.units : [];
  const canCreate = units.some(u => u.active && u.can_create && auth.can("sales.entry.create", { unit_id: u.id }));
  const rowAllowed = (e: SalesEntry, action: "edit" | "delete") =>
    !!units.find(u => u.id === e.unit_id)?.[`can_${action}`] && auth.can(`sales.entry.${action}`, { unit_id: e.unit_id });
  function refresh() { setRevision(r => r + 1); }
  function mutated(text: string) {
    setEditor(undefined); setDeleting(undefined); setActionError(""); setSuccess(text);
    setParams(previous => { const next = new URLSearchParams(previous); next.delete("page"); return next; }, { replace: true });
    refresh();
  }
  async function openEntry(e: SalesEntry, action: "edit" | "delete") {
    if (actionPending.current) return;
    actionPending.current = true;
    const request = ++actionGeneration.current;
    setOpening(true); setActionError(""); setSuccess("");
    try {
      const detail = await entryDetail(e.id);
      if (request !== actionGeneration.current) return;
      if (action === "edit") setEditor({ entry: detail });
      else { setDeleting(detail); setDeleteConflict(false); setDeleteUnavailable(false); }
    } catch (err) { if (request === actionGeneration.current) setActionError(salesMessage(err)); }
    finally { actionPending.current = false; setOpening(false); }
  }
  async function remove() {
    if (!deleting || actionPending.current || deleteConflict || deleteUnavailable) throw new Error();
    actionPending.current = true;
    try { await deleteEntry(deleting.id, deleting.version); mutated("Lançamento excluído."); }
    catch (e) {
      const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
      if (code === "40001") setDeleteConflict(true);
      if (code === "P0002") setDeleteUnavailable(true);
      setActionError(salesMessage(e));
      throw e;
    } finally { actionPending.current = false; }
  }
  if (!allowed) return <EmptyState title="Acesso não autorizado">Você não possui acesso operacional a Vendas / Maquininhas.</EmptyState>;
  return <section className="sales-page">
    <PageTitle eyebrow="Comercial" title="Vendas / Maquininhas" description="Lançamentos diários agregados por unidade, em Stone e PIX.">
      {canCreate && <button className="primary" onClick={() => { setSuccess(""); setActionError(""); setEditor({}); }}>Novo lançamento</button>}
    </PageTitle>
    {success && <Notice tone="success">{success}</Notice>}
    {actionError && <Notice error>{actionError}</Notice>}
    {read && result?.access === access ? <form className="sales-filters" key={JSON.stringify([from, to, unit, method, units.map(u => u.id)])} onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const next = new URLSearchParams();
      for (const name of ["from", "to", "unit", "method"]) { const value = String(data.get(name) ?? ""); if (value) next.set(name, value); }
      setParams(next); setActionError("");
    }}>
      <label>Data inicial<input type="date" name="from" min="0001-01-01" max="9999-12-31" defaultValue={from} /></label>
      <label>Data final<input type="date" name="to" min="0001-01-01" max="9999-12-31" defaultValue={to} /></label>
      <label>Unidade<select name="unit" defaultValue={unit}>
        <option value="">Todas as unidades autorizadas</option>
        {unit && !units.some(u => u.id === unit && u.can_read) && <option value={unit} disabled>Unidade indisponível — selecione outra</option>}
        {units.filter(u => u.can_read).map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}{u.active ? "" : " (inativa — histórico)"}</option>)}
      </select></label>
      <label>Forma de pagamento<select name="method" defaultValue={method}><option value="">Stone e PIX</option>{method && method !== "Stone" && method !== "PIX" && <option value={method} disabled>Forma indisponível — selecione outra</option>}<option>Stone</option><option>PIX</option></select></label>
      <div className="actions"><button className="primary" type="submit">Aplicar filtros</button><button type="button" onClick={refresh}>Atualizar consulta</button></div>
    </form> : !read && <Notice>Seu acesso não inclui consulta de lançamentos. As ações disponíveis seguem suas permissões.</Notice>}
    {!current ? <LoadingState label="Carregando Vendas…" /> : current.error ? <>
      <Notice error>{current.error}</Notice><button onClick={refresh}>Tentar novamente</button>
    </> : read ? <>
      {current.rows.length ? <Table headers={["Data", "Unidade", "Forma de pagamento", "Valor", "Ações"]}>
        {current.rows.map(e => <tr key={e.id}>
          <td>{civilDate(e.sale_date)}</td><td>{units.find(u => u.id === e.unit_id)?.name ?? "Unidade autorizada"}{units.find(u => u.id === e.unit_id)?.active === false && <span className="badge">Inativa</span>}</td>
          <td>{e.payment_method}</td><td className="sales-money">{money(e.amount)}</td>
          <td><div className="sales-row-actions">
            {rowAllowed(e, "edit") && <button disabled={opening} onClick={() => void openEntry(e, "edit")} aria-label={`Editar ${civilDate(e.sale_date)} ${e.payment_method}`}>Editar</button>}
            {rowAllowed(e, "delete") && <button disabled={opening} onClick={() => void openEntry(e, "delete")} aria-label={`Excluir ${civilDate(e.sale_date)} ${e.payment_method}`}>Excluir</button>}
            {!rowAllowed(e, "edit") && !rowAllowed(e, "delete") && <span className="muted">Somente leitura</span>}
          </div></td>
        </tr>)}
      </Table> : <EmptyState title="Nenhum lançamento encontrado">Ajuste os filtros ou cadastre um lançamento se tiver permissão.</EmptyState>}
      <nav className="pager" aria-label="Paginação dos lançamentos">
        <span>Página {page + 1} · até {PAGE_SIZE} lançamentos por página</span>
        <button disabled={page === 0} onClick={() => setParams(p => { const n = new URLSearchParams(p); n.set("page", String(page - 1)); return n; })}>Anterior</button>
        <button disabled={!current.next} onClick={() => setParams(p => { const n = new URLSearchParams(p); n.set("page", String(page + 1)); return n; })}>Próxima</button>
      </nav>
    </> : !canCreate && <Notice>Nenhuma unidade ativa disponível para cadastro. A consulta de lançamentos não está disponível para o seu acesso.</Notice>}
    {editor && <EntryEditor entry={editor.entry} units={units} onClose={() => setEditor(undefined)} onSaved={() => mutated(editor.entry ? "Lançamento atualizado." : "Lançamento cadastrado.")} />}
    {deleting && <Confirm title="Excluir lançamento?" description={`${civilDate(deleting.sale_date)} · ${units.find(u => u.id === deleting.unit_id)?.name ?? "Unidade autorizada"} · ${deleting.payment_method} · ${money(deleting.amount)}. O lançamento sairá da consulta; o histórico será preservado.`}
      onClose={() => setDeleting(undefined)} onConfirm={remove} confirmDisabled={deleteConflict || deleteUnavailable}>
      {deleteConflict && <Notice tone="warning">O lançamento mudou. Cancele esta confirmação, atualize a consulta e confira a nova versão antes de excluir.</Notice>}
      {deleteUnavailable && <Notice error>Lançamento indisponível. Cancele e atualize a consulta.</Notice>}
    </Confirm>}
  </section>;
}
