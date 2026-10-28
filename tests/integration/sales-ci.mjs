// Nenhuma descoberta de serviços, .env ou URL padrão: conexão somente no runner hospedado.
export function salesCiUrl() {
  if (process.env.CI !== "true" || process.env.RUNNER_ENVIRONMENT !== "github-hosted")
    throw new Error("PostgreSQL VEN-02 permitido somente no CI hospedado descartável.");
  const url = new URL(process.env.SALES_CI_DATABASE_URL);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/gaucha_sales_ci")
    throw new Error("Destino diferente do PostgreSQL descartável VEN-02.");
  return url.href;
}
