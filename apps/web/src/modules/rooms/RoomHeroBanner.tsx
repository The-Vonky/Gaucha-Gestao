import { dateTime, type Summary } from "./api";
export function RoomHeroBanner({
  summary,
  loading,
  manager,
}: {
  summary?: Summary | null;
  loading: boolean;
  manager: boolean;
}) {
  const status =
    loading || !summary
      ? "Consultando agenda"
      : summary.in_use
        ? "Em uso"
        : "Disponível agora";
  return (
    <header className="room-hero">
      <div className="room-hero-copy">
        <p className="room-eyebrow">ADMINISTRATIVO · AGENDAMENTO DE SALAS</p>
        <h1>{summary?.name ?? "Sala de Reunião"}</h1>
        <p>
          Reserve seu espaço, organize seus encontros e acompanhe os horários
          confirmados.
        </p>
        <span className="room-status">● {status}</span>
      </div>
      <dl className="room-hero-card" aria-label="Resumo da sala">
        <div>
          <dt>Situação atual</dt>
          <dd>{status}</dd>
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
