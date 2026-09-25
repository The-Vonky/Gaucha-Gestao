import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type FormEvent,
} from "react";
import { message } from "./errors";
import { BrandMark } from "./brand";
import { Icon, type IconName } from "./icons";
const PendingContext = createContext<((value: boolean) => void) | null>(null);
type Tone = "info" | "success" | "warning" | "error";
const toneIcon: Record<Tone, IconName> = {
  info: "info",
  success: "success",
  warning: "warning",
  error: "error",
};
export function Notice({
  children,
  error = false,
  tone = error ? "error" : "info",
}: {
  children: ReactNode;
  error?: boolean;
  tone?: Tone;
}) {
  return (
    <div
      className={`notice ${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon name={toneIcon[tone]} />
      <div className="notice-body">{children}</div>
    </div>
  );
}
export function PageTitle({
  title,
  description,
  eyebrow,
  children,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}
export function IconButton({
  icon,
  label,
  className = "",
  ...props
}: {
  icon: IconName;
  label: string;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`icon-button ${className}`.trim()}
      {...props}
    >
      <Icon name={icon} />
    </button>
  );
}
export function EmptyState({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="empty-state">
      <span className="empty-halo">
        <BrandMark className="empty-mark" />
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
      {actions && <div className="actions">{actions}</div>}
    </section>
  );
}
/** Modal side sheet (native dialog: focus trap, Escape and inert page). */
export function Drawer({
  label,
  children,
  onClose,
}: {
  label: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click on the dialog element itself is a click on the backdrop.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {children}
    </dialog>
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
        <IconButton
          icon="close"
          label="Fechar"
          className="ghost"
          autoFocus
          disabled={locked}
          onClick={onClose}
        />
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
