import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useAuth } from "../../core/auth/AuthProvider";
import { can } from "../../core/auth/permissions";
import { Modal, Notice } from "../../shared/ui";
import { RequestHistory } from "./RequestHistory";
import { RoomContact } from "./RoomContact";
import { RoomPhoto } from "./RoomPhoto";
import { RoomHeroBanner } from "./RoomHeroBanner";
import {
  dateTime,
  day,
  instant,
  roomMessage,
  rpc,
  time,
  type Booking,
  type Request,
  type Summary,
} from "./api";
import "./rooms.css";
const labels = {
  pending: "Aguardando aprovação",
  approved: "Aprovado",
  rejected: "Recusado",
  cancelled: "Cancelado",
};
type Editor = {
  date: string;
  start: string;
  end: string;
  bookedFor: string;
  text: string;
  booking?: Booking;
  direct: boolean;
};
const emptyEditor = (date: string, direct = false): Editor => ({
  date,
  start: "",
  end: "",
  bookedFor: "",
  text: "",
  direct,
});
export function RoomsPage() {
  const auth = useAuth();
  const allowed = (p: string) =>
    can(!!auth.profile?.active, auth.grants, `room_booking.${p}`);
  const read = allowed("schedule.read"),
    own = allowed("request.read_own"),
    create = allowed("request.create"),
    manageGranted = allowed("manage");
  // Remonta os dados da sala quando muda o principal, a sessão ou as capacidades.
  const access = JSON.stringify([
    auth.session?.user.id, auth.session?.user.last_sign_in_at, auth.profile?.id,
    read, own, create, manageGranted,
  ]);
  return (
    <RoomsAccess key={access} read={read} own={own} create={create}
      manageGranted={manageGranted} />
  );
}

type RoomAccess = { read: boolean; own: boolean; create: boolean };

function RoomsAccess({ manageGranted, ...access }: RoomAccess & { manageGranted: boolean }) {
  const [admin, setAdmin] = useState<boolean>();
  const [managerMode, setManagerMode] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [date, setDate] = useState(day);
  useEffect(() => {
    if (!manageGranted) return;
    let generation = 0;
    async function verify() {
      const current = ++generation;
      try {
        const result = await rpc<boolean>("admin_context");
        if (current !== generation) return;
        if (typeof result !== "boolean") throw new Error("Resposta de autorização inválida.");
        setAdmin(result);
        setError("");
        if (!result) setManagerMode(false);
      } catch (e) {
        if (current !== generation) return;
        setAdmin(undefined);
        setManagerMode(false);
        setError(roomMessage(e));
      }
    }
    const visible = () => {
      if (document.visibilityState === "visible") void verify();
    };
    void verify();
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(visible, 60000);
    return () => {
      generation++;
      document.removeEventListener("visibilitychange", visible);
      clearInterval(timer);
    };
  }, [manageGranted, attempt]);

  if (manageGranted && admin === undefined) {
    return (
      <div className="rooms-page">
        {error ? (
          <>
            <Notice error>Não foi possível verificar o modo de atuação. {error}</Notice>
            <button type="button" onClick={() => {
              setError("");
              setAttempt((current) => current + 1);
            }}>Tentar novamente</button>
          </>
        ) : <p role="status">Verificando acesso ao Agendamento…</p>}
      </div>
    );
  }
  const manage = manageGranted && (!admin || managerMode);
  return (
    <div className="rooms-page">
      {admin && (
        <div className="room-mode-switch" role="group" aria-label="Modo de atuação">
          <div className="room-mode-actions">
            <button type="button" className={!manage ? "primary" : ""}
              aria-pressed={!manage} disabled={busy || savingContact}
              onClick={() => setManagerMode(false)}>
              Room Booking Requester
            </button>
            <button type="button" className={manage ? "primary" : ""}
              aria-pressed={manage} disabled={busy || savingContact}
              onClick={() => setManagerMode(true)}>
              Room Booking Manager
            </button>
          </div>
        </div>
      )}
      <RoomsWorkspace key={`${admin}:${manage}`} {...access} manage={manage}
        date={date} setDate={setDate} busy={busy} setBusy={setBusy}
        onContactSaving={setSavingContact} />
    </div>
  );
}

function RoomsWorkspace({
  read, own, create, manage, date, setDate, busy, setBusy, onContactSaving,
}: RoomAccess & {
  manage: boolean;
  date: string;
  setDate: (value: string) => void;
  busy: boolean;
  setBusy: (value: boolean) => void;
  onContactSaving: (value: boolean) => void;
}) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [queue, setQueue] = useState<Request[]>([]);
  const [summary, setSummary] = useState<Summary | null>();
  const [page, setPage] = useState(0),
    [queuePage, setQueuePage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [editor, setEditor] = useState<Editor>();
  const [actionsContainer, setActionsContainer] = useState<HTMLDivElement | null>(null);
  const [decision, setDecision] = useState<{
    request: Request;
    action: "approve" | "reject";
    text: string;
  }>();
  const requestKey = useRef(crypto.randomUUID());
  const generation = useRef(0);
  const [historyRevision, setHistoryRevision] = useState(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const [b, s, r, q] = await Promise.all([
        read ? rpc<Booking[]>("schedule", { p_from: date, p_to: date }) : [],
        read
          ? rpc<Summary>("summary").then((s) => ({
              ...s,
              receivedAt: performance.now(),
            }))
          : null,
        own && !manage
          ? rpc<Request[]>("requests", { p_offset: page * 50 })
          : [],
        manage
          ? rpc<Request[]>("requests", {
              p_queue: true,
              p_offset: queuePage * 50,
            })
          : [],
      ]);
      if (current !== generation.current) return;
      setBookings(b);
      setSummary(s);
      setRequests(r);
      setQueue(q);
      setHistoryRevision((r) => r + 1);
    } catch (e) {
      if (current !== generation.current) return;
      setError(roomMessage(e));
      setBookings([]);
      setRequests([]);
      setQueue([]);
      setSummary(null);
      setEditor(undefined);
      setDecision(undefined);
      setHistoryRevision((r) => r + 1);
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [date, read, own, manage, page, queuePage]);
  useEffect(() => {
    void refresh();
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(visible, 60000);
    return () => {
      generation.current++;
      document.removeEventListener("visibilitychange", visible);
      clearInterval(timer);
    };
  }, [refresh]);
  async function mutate(action: () => Promise<unknown>, notice: string) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await action();
      setSuccess(notice);
      await refresh();
    } catch (e) {
      setError(roomMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!editor || busy) return;
    const x = editor;
    if (x.end <= x.start) {
      setError("O término deve ser posterior ao início, no mesmo dia.");
      return;
    }
    await mutate(
      async () => {
        const common = {
          p_start: instant(x.date, x.start),
          p_end: instant(x.date, x.end),
          p_booked_for: x.bookedFor.trim(),
        };
        if (x.direct)
          await rpc("save_booking", {
            ...common,
            p_notes: x.text || null,
            p_id: x.booking?.id ?? null,
            p_version: x.booking?.version ?? null,
          });
        else
          await rpc("create_request", {
            ...common,
            p_purpose: x.text || null,
            p_key: requestKey.current,
          });
        requestKey.current = crypto.randomUUID();
        setEditor(undefined);
      },
      x.direct
        ? "Reserva salva na agenda."
        : "Pedido enviado. Aguarde aprovação: o horário ainda não está reservado.",
    );
  }
  function openEditor(direct: boolean, booking?: Booking) {
    requestKey.current = crypto.randomUUID();
    setSuccess("");
    setEditor(
      booking
        ? {
            date: day(new Date(booking.starts_at)),
            start: time(booking.starts_at),
            end: time(booking.ends_at),
            bookedFor: booking.booked_for,
            text: booking.secretary_notes ?? "",
            direct,
            booking,
          }
        : emptyEditor(date, direct),
    );
    setError("");
  }
  const now = summary?.server_now
    ? new Date(summary.server_now).getTime()
    : Date.now();
  const historical =
    !!editor?.booking && new Date(editor.booking.starts_at).getTime() <= now;
  return (
    <>
      {read && manage && (
        <div className="room-management-actions" role="group" aria-label="Ações da sala"
          ref={setActionsContainer} />
      )}
      <RoomHeroBanner
        summary={summary}
        loading={loading}
        manager={manage}
        onBoundary={refresh}
        photo={<RoomPhoto manager={manage} read={read} actionsContainer={actionsContainer} />}
        contact={read && <RoomContact manage={manage} onSaving={onContactSaving} actionsContainer={actionsContainer} />}
      />
      <div className="room-toolbar">
        <span>Horários de Brasília · America/Sao_Paulo</span>
        <button disabled={busy || loading} onClick={() => void refresh()}>
          Atualizar agenda
        </button>
      </div>
      {error && !editor && <Notice error>{error}</Notice>}
      {success && <Notice>{success}</Notice>}

      {read && (
        <section className="room-panel">
          <div className="room-section-head">
            <div>
              <p className="room-eyebrow">HORÁRIOS CONFIRMADOS</p>
              <h2>Agenda</h2>
            </div>
            <div className="room-agenda-actions">
              <label>
                Data
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </label>
              {!manage && create && (
                <button className="primary" disabled={busy} aria-haspopup="dialog"
                  onClick={() => openEditor(false)}>Solicitar horário</button>
              )}
            </div>
          </div>
          {loading ? (
            <p role="status">Consultando agenda…</p>
          ) : !bookings.length ? (
            <p className="room-empty">
              Nenhuma reserva confirmada nesta data.
            </p>
          ) : (
            <ul className="room-list">
              {bookings.map((b) => (
                <li key={b.id} className="room-booking">
                  <div className="room-time">
                    {time(b.starts_at)} — {time(b.ends_at)}
                    <small>Ocupado · confirmado</small>
                  </div>
                  <div>
                    <strong>{b.booked_for}</strong>
                    {b.secretary_notes && (
                      <p className="room-text">{b.secretary_notes}</p>
                    )}
                    {manage && (
                      <div className="actions">
                        <button
                          disabled={busy}
                          onClick={() => openEditor(true, b)}
                        >
                          Editar reserva
                        </button>
                        {new Date(b.starts_at).getTime() > now && (
                          <button
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Cancelar esta reserva? O horário será liberado e o histórico preservado.",
                                )
                              )
                                void mutate(
                                  () =>
                                    rpc("save_booking", {
                                      p_id: b.id,
                                      p_version: b.version,
                                      p_start: b.starts_at,
                                      p_end: b.ends_at,
                                      p_booked_for: b.booked_for,
                                      p_cancel: true,
                                    }),
                                  "Reserva cancelada.",
                                );
                            }}
                          >
                            Cancelar reserva
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {!read && !manage && create && (
        <section className="room-panel">
          <button className="primary" disabled={busy} aria-haspopup="dialog"
            onClick={() => openEditor(false)}>Solicitar horário</button>
        </section>
      )}
      {editor && (editor.direct ? manage : create) && (
        <Modal title={editor.booking ? "Editar reserva" : editor.direct ? "Reserva direta" : "Novo pedido"}
          onClose={() => setEditor(undefined)} busy={busy} closeOnBackdrop>
          {error && <Notice error>{error}</Notice>}
          {historical && (
            <Notice>
              Reunião iniciada: somente nome e observações podem ser corrigidos.
            </Notice>
          )}
          <form onSubmit={(e) => void submit(e)} className="room-form">
            <fieldset disabled={busy}>
              <div className="room-form-grid">
                <label>
                  Data da reunião
                  <input
                    type="date"
                    required
                    disabled={historical}
                    value={editor.date}
                    onChange={(e) =>
                      setEditor({ ...editor, date: e.target.value })
                    }
                  />
                </label>
                <label>
                  Início
                  <input
                    type="time"
                    step="60"
                    required
                    disabled={historical}
                    value={editor.start}
                    onChange={(e) =>
                      setEditor({ ...editor, start: e.target.value })
                    }
                  />
                </label>
                <label>
                  Término
                  <input
                    type="time"
                    step="60"
                    max="23:59"
                    required
                    disabled={historical}
                    value={editor.end}
                    onChange={(e) =>
                      setEditor({ ...editor, end: e.target.value })
                    }
                  />
                </label>
                <label className="room-wide">
                  Reservado para
                  <input
                    required
                    maxLength={160}
                    value={editor.bookedFor}
                    onChange={(e) =>
                      setEditor({ ...editor, bookedFor: e.target.value })
                    }
                  />
                </label>
                <label className="room-wide">
                  <span id="room-editor-text-label">
                    {editor.direct
                      ? "Observações públicas da secretaria"
                      : "Finalidade privada (somente você e a gestão)"}
                  </span>
                  <textarea
                    aria-labelledby="room-editor-text-label"
                    maxLength={2000}
                    value={editor.text}
                    onChange={(e) =>
                      setEditor({ ...editor, text: e.target.value })
                    }
                  />
                </label>
              </div>
              <div className="actions">
                <button className="primary" type="submit">
                  {busy
                    ? "Salvando…"
                    : editor.direct
                      ? "Salvar reserva"
                      : "Enviar pedido"}
                </button>
                <button type="button" onClick={() => setEditor(undefined)}>
                  Fechar formulário
                </button>
              </div>
            </fieldset>
          </form>
        </Modal>
      )}
      {own && !manage && (
        <section className="room-panel">
          <h2>Meus pedidos</h2>
          {!requests.length && <p>Nenhum pedido nesta página.</p>}
          <ul className="room-list">
            {requests.map((r) => (
              <li key={r.id}>
                <div className="room-row">
                  <div>
                    <strong>{r.booked_for}</strong>
                    <p>
                      {dateTime(r.starts_at)} — {time(r.ends_at)}
                    </p>
                  </div>
                  <span className="room-pill">
                    {r.booking_status === "cancelled"
                      ? "Reserva cancelada pela secretaria"
                      : labels[r.status]}
                  </span>
                </div>
                {r.purpose && (
                  <p className="room-text">Finalidade privada: {r.purpose}</p>
                )}
                {r.decision_reason && (
                  <p className="room-text">
                    Motivo da recusa: {r.decision_reason}
                  </p>
                )}
                {r.status === "pending" &&
                  new Date(r.starts_at).getTime() > now && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm("Cancelar seu pedido pendente?"))
                          void mutate(
                            () =>
                              rpc("decide_request", {
                                p_id: r.id,
                                p_version: r.version,
                                p_action: "cancel",
                              }),
                            "Pedido cancelado.",
                          );
                      }}
                    >
                      Cancelar meu pedido
                    </button>
                  )}
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            count={requests.length}
            disabled={busy || loading}
            change={setPage}
          />
        </section>
      )}
      {manage && (
        <section className="room-panel">
          <div className="room-section-head">
            <div>
              <p className="room-eyebrow">GESTÃO DA SECRETÁRIA</p>
              <h2>Solicitações pendentes</h2>
            </div>
            <button
              className="primary"
              disabled={busy}
              onClick={() => openEditor(true)}
            >
              Criar reserva direta
            </button>
          </div>
          {!queue.length && <p>Nenhuma solicitação nesta página.</p>}
          <ul className="room-list">
            {queue.map((r) => (
              <li key={r.id}>
                <strong>{r.booked_for}</strong>
                <p>
                  {dateTime(r.starts_at)} — {time(r.ends_at)}
                </p>
                <p className="room-text">
                  Finalidade privada: {r.purpose || "Não informada"}
                </p>
                {new Date(r.starts_at).getTime() <= now && (
                  <p>Pedido vencido: aguarda recusa manual.</p>
                )}
                <div className="actions">
                  <button
                    disabled={busy || new Date(r.starts_at).getTime() <= now}
                    onClick={() =>
                      setDecision({ request: r, action: "approve", text: "" })
                    }
                  >
                    Aprovar pedido
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      setDecision({ request: r, action: "reject", text: "" })
                    }
                  >
                    Recusar pedido
                  </button>
                </div>
                {decision?.request.id === r.id && (
                  <form
                    className="room-decision"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void mutate(
                        async () => {
                          await rpc("decide_request", {
                            p_id: r.id,
                            p_version: r.version,
                            p_action: decision.action,
                            p_reason:
                              decision.action === "reject"
                                ? decision.text
                                : null,
                            p_notes:
                              decision.action === "approve"
                                ? decision.text
                                : null,
                          });
                          setDecision(undefined);
                        },
                        decision.action === "approve"
                          ? "Pedido aprovado. Reserva confirmada."
                          : "Pedido recusado.",
                      );
                    }}
                  >
                    <label>
                      {decision.action === "approve"
                        ? "Observações públicas da secretaria"
                        : "Motivo da recusa (opcional)"}
                      <textarea
                        maxLength={2000}
                        value={decision.text}
                        onChange={(e) =>
                          setDecision({ ...decision, text: e.target.value })
                        }
                      />
                    </label>
                    <div className="actions">
                      <button type="submit" className="primary" disabled={busy}>
                        Confirmar{" "}
                        {decision.action === "approve" ? "aprovação" : "recusa"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setDecision(undefined)}
                      >
                        Voltar
                      </button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <Pagination
            page={queuePage}
            count={queue.length}
            disabled={busy || loading}
            change={setQueuePage}
          />
        </section>
      )}
      {manage && <RequestHistory revision={historyRevision} />}
    </>
  );
}
function Pagination({
  page,
  count,
  disabled,
  change,
}: {
  page: number;
  count: number;
  disabled: boolean;
  change: (value: number) => void;
}) {
  return (
    <div className="actions">
      <button
        disabled={disabled || page === 0}
        onClick={() => change(page - 1)}
      >
        Anterior
      </button>
      <span>Página {page + 1}</span>
      <button
        disabled={disabled || count < 50}
        onClick={() => change(page + 1)}
      >
        Próxima
      </button>
    </div>
  );
}
