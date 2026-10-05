// Fail closed: this tool supports only the checked-in disposable Supabase CLI stack.
export const PROJECT_ID = "gaucha-gestao-local";
export const CONTAINER_NAME = `supabase_db_${PROJECT_ID}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refuse(message) {
  throw new Error(`Seed recusado: ${message}. Somente desenvolvimento local/descartável.`);
}

export function assertLocalStatus(status) {
  // Check literal hosts BEFORE URL normalization (127.1 and integer IPv4 normalize to loopback).
  if (!/^http:\/\/(127\.0\.0\.1|localhost):54321\/?$/.test(status?.API_URL ?? ""))
    refuse("API deve ser http://127.0.0.1:54321 ou http://localhost:54321");
  if (!/^postgres(?:ql)?:\/\/(?:[^@/?#\\]*@)?(127\.0\.0\.1|localhost):54322\/postgres$/.test(status?.DB_URL ?? ""))
    refuse("banco deve ser postgres local na porta 54322, sem parâmetros ou redirecionamentos");
}

export function assertLocalEnvironment(env, linked) {
  if (linked) refuse("checkout linked a banco remoto; use um checkout local não linked");
  for (const key of ["NODE_ENV", "APP_ENV", "ENVIRONMENT", "VITE_MODE"])
    if (env[key] && !["development", "dev", "local", "test"].includes(env[key].toLowerCase()))
      refuse(`ambiente ${key} não é desenvolvimento local`);
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    if (/^SUPABASE_/.test(key) && !["SUPABASE_URL", "SUPABASE_DB_URL"].includes(key))
      refuse(`variável ${key} não é aceita; não forneça credenciais ou projeto remoto`);
    if (/^(PGHOST|PGHOSTADDR|PGPORT|PGDATABASE|PGUSER|PGPASSWORD|PGPASSFILE|PGSERVICE|PGSERVICEFILE|PGOPTIONS|PGSSLMODE|POSTGRES_PASSWORD|JWT_SECRET|SERVICE_ROLE_KEY|DOCKER_HOST|DOCKER_CONTEXT|DOCKER_TLS_VERIFY|DOCKER_CERT_PATH)$/.test(key))
      refuse(`override/credencial ${key} não é aceito`);
    if (["SUPABASE_URL", "VITE_SUPABASE_URL"].includes(key))
      assertLocalStatus({ API_URL: value, DB_URL: "postgres://localhost:54322/postgres" });
    if (["DATABASE_URL", "SUPABASE_DB_URL"].includes(key))
      assertLocalStatus({ API_URL: "http://localhost:54321", DB_URL: value });
  }
}

export function assertDockerEndpoint(endpoint) {
  if (typeof endpoint !== "string" || !/^(unix:\/\/\/[^\r\n]+|npipe:\/\/\/\/\.\/pipe\/[^\r\n]+)$/.test(endpoint))
    refuse("Docker deve usar socket local unix/npipe; contextos TCP/SSH são proibidos");
}

export function assertLocalContainer(container) {
  if (!container || container.Name !== `/${CONTAINER_NAME}` || !container.State?.Running ||
      container.Config?.Labels?.["com.supabase.cli.project"] !== PROJECT_ID ||
      !/^(public\.ecr\.aws|ghcr\.io)\/supabase\/postgres:/.test(container.Config?.Image ?? "") ||
      !/^[0-9a-f]{64}$/.test(container.Id ?? ""))
    refuse("container PostgreSQL não pertence ao projeto Supabase CLI local esperado");
  return container.Id;
}

export function parseArguments(args) {
  if (args.length === 0) return { userId: "" };
  if (args.length === 2 && args[0] === "--user-id" && UUID.test(args[1]))
    return { userId: args[1] };
  refuse("use seed:audit-demo [-- --user-id UUID]; endpoints, --linked e outros flags são proibidos");
}
