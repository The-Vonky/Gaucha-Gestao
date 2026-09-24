import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { message } from "./errors";
const PendingContext = createContext<((value: boolean) => void) | null>(null);
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <p
      className={error ? "notice error" : "notice"}
      role={error ? "alert" : "status"}
    >
      {children}
    </p>
  );
}
export function PageTitle({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-title">
      <div>
        <p className="eyebrow">Gaúcha Gestão</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </header>
  );
}
export function Modal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [pending, setPending] = useState(false);
  const locked = busy || pending;
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        if (!locked) onClose();
      }}
    >
      <div className="dialog-head">
        <h2 id={id}>{title}</h2>
        <button
          type="button"
          aria-label="Fechar"
          autoFocus
          disabled={locked}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <PendingContext.Provider value={setPending}>
        {children}
      </PendingContext.Provider>
    </dialog>
  );
}
export function Confirm({
  title,
  description,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={title} onClose={onClose} busy={busy}>
      <p>{description}</p>
      {error && <Notice error>{error}</Notice>}
      <div className="actions">
        <button disabled={busy} onClick={onClose}>
          Cancelar
        </button>
        <button
          className="danger"
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy ? "Salvando…" : "Confirmar"}
        </button>
      </div>
    </Modal>
  );
}
export function Form({
  children,
  onSave,
  onCancel,
}: {
  children: ReactNode;
  onSave: (data: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const setPending = useContext(PendingContext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setPending?.(true);
    setError("");
    try {
      await onSave(data);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
      setPending?.(false);
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)}>
      <fieldset disabled={busy}>
        {children}
        {error && <Notice error>{error}</Notice>}
        <div className="actions">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button className="primary" type="submit">
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
export function Pager({
  page,
  count,
  onChange,
}: {
  page: number;
  count: number;
  onChange: (page: number) => void;
}) {
  return (
    <nav className="pager" aria-label="Paginação">
      <span>
        {count} registro(s) · Página {page + 1}
      </span>
      <button disabled={page === 0} onClick={() => onChange(page - 1)}>
        Anterior
      </button>
      <button
        disabled={(page + 1) * 25 >= count}
        onClick={() => onChange(page + 1)}
      >
        Próxima
      </button>
    </nav>
  );
}
export function Status({ active }: { active: boolean }) {
  return (
    <span className={`badge ${active ? "active" : ""}`}>
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}
export function Table({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Tabela de registros"
    >
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
