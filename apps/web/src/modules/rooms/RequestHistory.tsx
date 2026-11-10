import { useEffect, useState } from "react";
import { Notice } from "../../shared/ui";
import { dateTime, time, rpc, roomMessage, type Request } from "./api";

type HistoryEntry = {
  id: string;
  booked_for: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
};

type RequestEntry = HistoryEntry & {
  status: Request["status"];
  requester_name: string;
  decided_at: string | null;
  decided_by_name: string | null;
  decision_reason: string | null;
  booking_status: "confirmed" | "cancelled" | null;
  booking_cancelled_at: string | null;
};

type DirectEntry = HistoryEntry & {
  status: "confirmed" | "cancelled";
  created_by_name: string;
  updated_at: string;
  cancelled_at: string | null;
  cancelled_by_name: string | null;
  cancel_reason: string | null;
  secretary_notes: string | null;
};

type Cursor = { start: string; id: string };
type HistoryPage = { items: (RequestEntry | DirectEntry)[]; has_more: boolean };

const requestStatuses = {
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Recusada",
  cancelled: "Cancelada",
};
const directStatuses = { confirmed: "Confirmada", cancelled: "Cancelada" };
const tabs = [
  { id: "requests", label: "Solicitações" },
  { id: "direct", label: "Reservas diretas" },
] as const;
type Tab = (typeof tabs)[number]["id"];

export function RequestHistory({ revision }: { revision: number }) {
  const [tab, setTab] = useState<Tab>("requests");
  return (
    <section
      className="room-panel room-history"
      aria-labelledby="room-history-title"
    >
      <h2 id="room-history-title">Histórico do agendamento</h2>
      <p className="muted">
        Consulte reuniões e cancelamentos. As datas e os horários seguem o fuso
        de Brasília.
      </p>
      <div
        role="tablist"
        aria-label="Tipo de histórico"
        className="room-history-tabs"
      >
        {tabs.map(({ id, label }, index) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`room-history-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`room-history-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => {
              const alternate = tabs[1 - index].id;
              const target = {
                ArrowLeft: alternate,
                ArrowRight: alternate,
                Home: tabs[0].id,
                End: tabs[1].id,
              }[event.key];
              if (!target) return;
              event.preventDefault();
              setTab(target);
              document.getElementById(`room-history-tab-${target}`)?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tabs.map(({ id }) => (
        <div
          key={id}
          id={`room-history-panel-${id}`}
          role="tabpanel"
          aria-labelledby={`room-history-tab-${id}`}
          hidden={tab !== id}
        >
          {tab === id && (
            <HistoryResults revision={revision} direct={id === "direct"} />
          )}
        </div>
      ))}
    </section>
  );
}

function HistoryResults({
  revision,
  direct,
}: {
  revision: number;
  direct: boolean;
}) {
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cursors, setCursors] = useState<Cursor[]>([]);
  const [data, setData] = useState<HistoryPage>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const cursor = cursors.at(-1);
  const statusLabel = direct ? "Status da reserva" : "Status do pedido";
  const invalidRange = !!(from && to && from > to);

  useEffect(() => {
    let current = true;
    if (invalidRange) return;
    setLoading(true);
    setError("");
    setData(undefined);
    rpc<HistoryPage>(direct ? "direct_history" : "history", {
      p_status: status || null,
      p_from: from || null,
      p_to: to || null,
      p_before_start: cursor?.start ?? null,
      p_before_id: cursor?.id ?? null,
    })
      .then((result) => {
        if (current) setData(result);
      })
      .catch((e) => {
        if (current) setError(roomMessage(e));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [direct, status, from, to, cursor, revision, retry, invalidRange]);

  return (
    <>
      <h3>
        {direct ? "Histórico de reservas diretas" : "Histórico de solicitações"}
      </h3>
      <p className="muted room-history-hint">
        Filtre pela data de início da reunião. As duas datas são inclusivas.
      </p>
      <div className="room-history-filters">
        <label>
          {statusLabel}
          <select
            aria-label={statusLabel}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setCursors([]);
            }}
          >
            <option value="">Todos os status</option>
            {Object.entries(direct ? directStatuses : requestStatuses).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          Data inicial
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setCursors([]);
            }}
          />
        </label>
        <label>
          Data final
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setCursors([]);
            }}
          />
        </label>
      </div>
      {invalidRange ? (
        <Notice error>
          A data final deve ser igual ou posterior à data inicial.
        </Notice>
      ) : error ? (
        <Notice error>
          {error}{" "}
          <button type="button" onClick={() => setRetry((v) => v + 1)}>
            Tentar novamente
          </button>
        </Notice>
      ) : loading ? (
        <p role="status">Consultando histórico…</p>
      ) : !data?.items.length ? (
        <p role="status">
          {direct
            ? "Nenhuma reserva direta encontrada."
            : "Nenhuma solicitação encontrada."}
        </p>
      ) : (
        <ul
          className="room-list room-history-list"
          aria-label={
            direct ? "Reservas diretas encontradas" : "Solicitações encontradas"
          }
        >
          {data.items.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
      <div
        className="actions room-history-pagination"
        role="group"
        aria-label="Paginação do histórico"
      >
        <button
          type="button"
          disabled={loading || invalidRange || !cursors.length}
          onClick={() => setCursors((c) => c.slice(0, -1))}
        >
          Anterior
        </button>
        <span aria-live="polite">Página {cursors.length + 1}</span>
        <button
          type="button"
          disabled={loading || invalidRange || !data?.has_more}
          onClick={() => {
            const last = data?.items.at(-1);
            if (last)
              setCursors((c) => [...c, { start: last.starts_at, id: last.id }]);
          }}
        >
          Próxima
        </button>
      </div>
    </>
  );
}

function HistoryRow({ entry }: { entry: RequestEntry | DirectEntry }) {
  const request = "requester_name" in entry ? entry : null;
  const direct = "created_by_name" in entry ? entry : null;
  return (
    <li className="room-history-entry">
      <div className="room-time">
        <time dateTime={entry.starts_at}>{dateTime(entry.starts_at)}</time>
        {" — "}
        <time dateTime={entry.ends_at}>{time(entry.ends_at)}</time>
      </div>
      <div className="room-history-main">
        <strong>{entry.booked_for}</strong>
        <p>
          {request
            ? `Solicitante: ${request.requester_name}`
            : `Registrada por ${direct?.created_by_name}`}
        </p>
        {request?.booking_status && (
          <p>
            Reserva vinculada:{" "}
            {request.booking_status === "cancelled"
              ? "Cancelada posteriormente"
              : "Confirmada"}
            {request.booking_cancelled_at &&
              ` · ${dateTime(request.booking_cancelled_at)}`}
          </p>
        )}
        {direct?.cancelled_at && (
          <p>
            Cancelada em {dateTime(direct.cancelled_at)}
            {direct.cancelled_by_name && ` por ${direct.cancelled_by_name}`}
          </p>
        )}
      </div>
      <span className={`room-pill room-history-status is-${entry.status}`}>
        {request
          ? requestStatuses[request.status]
          : direct && directStatuses[direct.status]}
      </span>
      <details className="room-history-details">
        <summary>Detalhes da {request ? "solicitação" : "reserva"}</summary>
        <p>Registrada em {dateTime(entry.created_at)}</p>
        {request?.decided_at && (
          <p>
            Decisão: {dateTime(request.decided_at)} ·{" "}
            {request.decided_by_name ?? "Responsável registrado"}
          </p>
        )}
        {request?.decision_reason && (
          <p className="room-text">
            Motivo da recusa: {request.decision_reason}
          </p>
        )}
        {direct && <p>Atualizada em {dateTime(direct.updated_at)}</p>}
        {direct?.cancel_reason && (
          <p className="room-text">
            Motivo do cancelamento: {direct.cancel_reason}
          </p>
        )}
        {direct?.secretary_notes && (
          <p className="room-text">
            Observações da secretaria: {direct.secretary_notes}
          </p>
        )}
      </details>
    </li>
  );
}
