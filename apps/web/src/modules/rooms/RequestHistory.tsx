import { useEffect, useState } from "react";
import { Notice } from "../../shared/ui";
import { dateTime, time, rpc, roomMessage, type Request } from "./api";
type HistoryEntry = Request & {
  requester_name: string;
  created_at: string;
  decided_at: string | null;
  decided_by_name: string | null;
  booking_cancelled_at: string | null;
};
type Cursor = { start: string; id: string };
type HistoryPage = { items: HistoryEntry[]; has_more: boolean };
const labels = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Recusado",
  cancelled: "Cancelado",
};
export function RequestHistory({ revision }: { revision: number }) {
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cursors, setCursors] = useState<Cursor[]>([]);
  const [data, setData] = useState<HistoryPage>({ items: [], has_more: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const cursor = cursors.at(-1);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    setData({ items: [], has_more: false });
    rpc<HistoryPage>("history", {
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
  }, [status, from, to, cursor, revision, retry]);
  return (
    <section className="room-panel">
      <h2>Histórico de solicitações</h2>
      <p className="muted">
        Consulta dos pedidos de todos os usuários. Reservas diretas permanecem
        na agenda e na auditoria.
      </p>
      <div className="room-history-filters">
        <label>
          Status do pedido
          <select
            aria-label="Status do pedido"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setCursors([]);
            }}
          >
            <option value="">Todos</option>
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label === "Pendente"
                  ? "Pendentes"
                  : label === "Aprovado"
                    ? "Aprovados"
                    : label === "Recusado"
                      ? "Recusados"
                      : "Cancelados"}
              </option>
            ))}
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
      {error && (
        <Notice error>
          {error}{" "}
          <button onClick={() => setRetry((v) => v + 1)}>
            Tentar novamente
          </button>
        </Notice>
      )}
      {loading ? (
        <p role="status">Consultando histórico…</p>
      ) : !error && !data.items.length ? (
        <p>Nenhuma solicitação encontrada.</p>
      ) : null}
      <ul className="room-list">
        {data.items.map((r) => (
          <li key={r.id}>
            <div className="room-row">
              <strong>{r.booked_for}</strong>
              <span className="room-pill">{labels[r.status]}</span>
            </div>
            <p>
              {dateTime(r.starts_at)} — {time(r.ends_at)}
            </p>
            <p>
              Solicitante: {r.requester_name} · Criado em{" "}
              {dateTime(r.created_at)}
            </p>
            {r.decided_at && (
              <p>
                Decisão: {dateTime(r.decided_at)} ·{" "}
                {r.decided_by_name ?? "Responsável registrado"}
              </p>
            )}
            {r.decision_reason && (
              <p className="room-text">Motivo da recusa: {r.decision_reason}</p>
            )}
            {r.booking_status && (
              <p>
                Reserva vinculada:{" "}
                {r.booking_status === "cancelled"
                  ? "Cancelada posteriormente"
                  : "Confirmada"}
                {r.booking_cancelled_at
                  ? ` · ${dateTime(r.booking_cancelled_at)}`
                  : ""}
              </p>
            )}
          </li>
        ))}
      </ul>
      <div className="actions">
        <button
          disabled={loading || cursors.length === 0}
          onClick={() => setCursors((c) => c.slice(0, -1))}
        >
          Anterior
        </button>
        <span>Página {cursors.length + 1}</span>
        <button
          disabled={loading || !data.has_more}
          onClick={() => {
            const last = data.items.at(-1);
            if (last)
              setCursors((c) => [...c, { start: last.starts_at, id: last.id }]);
          }}
        >
          Próxima
        </button>
      </div>
    </section>
  );
}
