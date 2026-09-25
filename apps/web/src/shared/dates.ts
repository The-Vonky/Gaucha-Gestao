/** Local business date as YYYY-MM-DD. */
export function today(now = new Date()) {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}
/** Formats a PostgreSQL `date` (YYYY-MM-DD) without timezone shifts. */
export function formatDate(date: string | null) {
  return date ? new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR") : "—";
}
