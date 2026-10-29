import { useRef, useState } from "react";
import { Form, Modal, Notice } from "../../shared/ui";
import { createEntry, entryDetail, salesMessage, updateEntry } from "./api";
import { amountInput, civilDate, money, parseAmount, today, validDate } from "./format";
import type { EntryInput, SalesEntry, SalesUnit } from "./types";

export function EntryEditor({ entry, units, onClose, onSaved }: {
  entry?: SalesEntry;
  units: SalesUnit[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [base, setBase] = useState(entry);
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<SalesEntry>();
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ date: entry?.sale_date ?? today(), unit: entry?.unit_id ?? "",
    method: entry?.payment_method ?? "Stone", amount: entry ? amountInput(entry.amount) : "" });
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef(false);
  const options = units.filter(u => base
    ? u.can_edit && (u.active || u.id === base.unit_id)
    : u.can_create && u.active);

  async function reload() {
    if (!base || pending.current) return;
    pending.current = true;
    setLoading(true); setError("");
    try { setLatest(await entryDetail(base.id)); }
    catch (e) {
      setError(salesMessage(e));
      if (errorCode(e) === "P0002") setUnavailable(true);
    } finally { pending.current = false; setLoading(false); }
  }
  async function save(data: FormData) {
    if (pending.current || conflict || unavailable || uncertain) return;
    setError("");
    let input: EntryInput;
    try {
      const sale_date = String(data.get("date"));
      const unit_id = String(data.get("unit"));
      const method = String(data.get("method"));
      if (!validDate(sale_date)) throw new Error("Informe uma data válida.");
      if (!options.some(u => u.id === unit_id)) throw new Error("Selecione uma unidade autorizada para esta operação.");
      if (method !== "Stone" && method !== "PIX") throw new Error("Selecione Stone ou PIX.");
      input = { sale_date, unit_id, payment_method: method, amount: parseAmount(String(data.get("amount"))) };
    } catch (e) { setError((e as Error).message); return; }
    pending.current = true;
    try {
      if (base) await updateEntry(base.id, base.version, input);
      else await createEntry(input);
      onSaved();
    } catch (e) {
      if (errorCode(e) === "40001") { setConflict(true); setLatest(undefined); }
      if (errorCode(e) === "P0002") setUnavailable(true);
      if (!base && !errorCode(e)) setUncertain(true);
      setError(salesMessage(e));
    } finally { pending.current = false; }
  }
  return <Modal title={base ? "Editar lançamento" : "Novo lançamento"} onClose={onClose} busy={loading}>
    <p>Um total por dia, unidade e forma de pagamento.</p>
    {error && <Notice error>{error}</Notice>}
    {conflict && <Notice tone="warning">
      <p>Seus campos foram preservados. Consulte o lançamento atual e compare antes de salvar novamente.</p>
      {!latest && !unavailable && <button disabled={loading} onClick={() => void reload()}>Consultar versão atual</button>}
      {latest && <>
        <p>Versão atual {latest.version}: {civilDate(latest.sale_date)} · {units.find(u => u.id === latest.unit_id)?.name ?? "Unidade autorizada"} · {latest.payment_method} · {money(latest.amount)}.</p>
        <button onClick={() => { setBase(latest); setConflict(false); setLatest(undefined); }}>Usar versão atual e manter campos</button>
      </>}
    </Notice>}
    {unavailable && <Notice error>Lançamento indisponível. Feche a edição e atualize a consulta.</Notice>}
    {uncertain && <Notice tone="warning">Não foi possível confirmar o cadastro. Feche este formulário e confira o resultado com um leitor autorizado antes de repetir.</Notice>}
    <Form onSave={save} onCancel={onClose} saveDisabled={conflict || unavailable || uncertain}>
      <div className="sales-form-fields">
        <label>Data<input name="date" type="date" required min="0001-01-01" max="9999-12-31" value={draft.date} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} autoFocus /></label>
        <label>Unidade<select name="unit" required value={draft.unit} onChange={e => setDraft(d => ({ ...d, unit: e.target.value }))}>
          <option value="">Selecione a unidade</option>
          {draft.unit && !options.some(u => u.id === draft.unit) && <option value={draft.unit} disabled>Unidade indisponível para esta operação — selecione outra</option>}
          {options.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}{u.active ? "" : " (inativa — histórico)"}</option>)}
        </select></label>
        <label>Forma de pagamento<select name="method" value={draft.method} onChange={e => setDraft(d => ({ ...d, method: e.target.value as "Stone" | "PIX" }))}><option>Stone</option><option>PIX</option></select></label>
        <label>Valor (R$)<input name="amount" type="text" inputMode="decimal" required maxLength={24} placeholder="0,00" value={draft.amount} onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))} aria-describedby="sales-amount-hint" /></label>
      </div>
      <p id="sales-amount-hint" className="muted">Valor positivo em reais, com até duas casas decimais. Exemplo: 1.250,30.</p>
      {(conflict || unavailable) && <p role="status">Salvamento bloqueado até resolver a indisponibilidade ou o conflito.</p>}
    </Form>
  </Modal>;
}

export function errorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error ? String(error.code) : "";
}
