import { useEffect, useState, type ReactNode } from "react";
import { dateTime, type Summary } from "./api";
export function RoomHeroBanner({
  summary,
  loading,
  manager,
  onBoundary,
  photo,
}: {
  summary?: Summary | null;
  loading: boolean;
  manager: boolean;
  onBoundary?: () => void;
  photo?: ReactNode;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    setExpired(false);
    if (!summary) {
      setRemaining(null);
      return;
    }
    const target = summary.in_use ? summary.in_use_until : summary.next_start;
    const end = target ? Date.parse(target) : NaN;
    const server = Date.parse(summary.server_now);
    const started = summary.receivedAt ?? performance.now();
    let notified = false;
    const tick = () => {
      if (!Number.isFinite(end) || !Number.isFinite(server)) {
        setRemaining(null);
        return;
      }
      const seconds = Math.max(
        0,
        Math.ceil((end - server - (performance.now() - started)) / 1000),
      );
      setRemaining(summary.in_use ? seconds : null);
      if (seconds === 0 && !notified) {
        notified = true;
        setExpired(true);
        onBoundary?.();
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    const visible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [summary, onBoundary]);
  const status =
    loading || !summary || expired
      ? "Consultando agenda"
      : summary.in_use
        ? "Em uso"
        : "Disponível agora";
  return (
    <header className="room-hero">
      {photo}
      <div className="room-photo-overlay" aria-hidden="true" />
      <div className="room-hero-copy">
        <p className="room-eyebrow">ADMINISTRATIVO · AGENDAMENTO DE SALAS</p>
        <h1>{summary?.name ?? "Sala de Reunião"}</h1>
        <p>
          Reserve seu espaço, organize seus encontros e acompanhe os horários
          confirmados.
        </p>
        <span
          className={`room-status ${loading || !summary || expired ? "is-loading" : summary.in_use ? "is-busy" : "is-free"}`}
        >
          <span aria-hidden="true">{summary?.in_use ? "◷" : "✓"}</span> {status}
        </span>
        {summary?.in_use && remaining !== null && !expired && (
          <p className="room-countdown" role="timer">
            Termina em {formatRemaining(remaining)}
          </p>
        )}
      </div>
      <dl className="room-hero-card" aria-label="Resumo da sala">
        <div>
          <dt>Situação atual</dt>
          <dd>
            <span
              className={`room-status ${loading || !summary || expired ? "is-loading" : summary.in_use ? "is-busy" : "is-free"}`}
            >
              <span aria-hidden="true">{summary?.in_use ? "◷" : "✓"}</span>{" "}
              {status}
            </span>
          </dd>
        </div>
        <div>
          <dt>Reservas confirmadas hoje</dt>
          <dd>{summary?.today_count ?? "—"}</dd>
        </div>
        <div>
          <dt>Próxima reserva</dt>
          <dd>
            {summary
              ? summary.next_start
                ? dateTime(summary.next_start)
                : "Nenhuma prevista"
              : "—"}
          </dd>
        </div>
        {manager && (
          <div>
            <dt>Solicitações pendentes</dt>
            <dd>{summary?.pending_count ?? "—"}</dd>
          </div>
        )}
      </dl>
    </header>
  );
}

export function formatRemaining(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return [Math.floor(value / 3600), Math.floor(value / 60) % 60, value % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
