import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import pg from "pg";
import { proxyStorage, storagePath } from "./storage.mjs";

const issuer = process.env.GG_IDENTITY_ISSUER;
const serviceKey = process.env.GG_IDENTITY_AUTH_ADMIN_KEY;
const databaseUrl = process.env.GG_IDENTITY_DATABASE_URL;
if (!issuer || !serviceKey || !databaseUrl || new URL(databaseUrl).username !== "gg_identity") {
  throw new Error("Configuração de identidade incompleta.");
}
const allowedOrigins = new Set(["http://127.0.0.1:5173", "http://localhost:5173"]);
const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 5,
  connectionTimeoutMillis: 3000,
  statement_timeout: 5000,
  application_name: "gg_identity",
});
pool.on("error", () => process.stderr.write("identity_database_connection_error\n"));

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const reject = (status, code = "request_rejected") => Object.assign(new Error(code), { status, code });
const execute = async (query, params = []) => (await pool.query(query, params)).rows[0];
const scalar = async (query, params = []) => (await execute(query, params))?.result;

function send(response, status, data) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(data === undefined ? undefined : JSON.stringify(data));
}

async function parse(request, keys) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] ?? "")) throw reject(415);
  let length = 0;
  const chunks = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 8192) {
      // Keep the socket closed when a streaming request exceeds the limit.
      request.destroy();
      throw reject(413);
    }
    chunks.push(chunk);
  }
  let data;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw reject(400);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)
      || Object.keys(data).some((key) => !keys.includes(key))) throw reject(400);
  return data;
}

function emailAddress(value) {
  if (typeof value !== "string" || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    throw reject(400);
  }
  return value.trim().toLowerCase();
}

function passwordInput(value, minimum) {
  if (typeof value !== "string" || value.includes("\0") || value.length < minimum
      || Buffer.byteLength(value) > 72) throw reject(400, "invalid_password");
  return value;
}

async function authCall(method, path, token, body) {
  const response = await fetch(new URL(path, "http://auth:9999"), {
    method,
    redirect: "error",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(8000),
  });
  return { ok: response.ok, status: response.status, data: response.status === 204 ? null : await response.json() };
}

function claimsFor(token) {
  try {
    if (typeof token !== "string" || token.length > 8192 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
      throw reject(401);
    }
    const [encodedHeader, encodedClaims] = token.split(".");
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
    const claims = JSON.parse(Buffer.from(encodedClaims, "base64url").toString("utf8"));
    if (!["HS256", "ES256", "RS256", "EdDSA"].includes(header.alg) || claims.iss !== issuer
        || claims.role !== "authenticated" || claims.aud !== "authenticated"
        || claims.is_anonymous === true || !uuid.test(claims.sub) || !uuid.test(claims.session_id)
        || !Number.isSafeInteger(claims.exp) || claims.exp <= Date.now() / 1000) throw reject(401);
    const passwordAuthenticatedAt = Array.isArray(claims.amr)
      ? claims.amr.find((entry) => entry?.method === "password")?.timestamp
      : undefined;
    return { user: claims.sub, session: claims.session_id, passwordAuthenticatedAt };
  } catch {
    throw reject(401);
  }
}

async function identify(token) {
  const identity = claimsFor(token);
  // A validação criptográfica usa exclusivamente o GoTrue pinado na rede interna.
  const result = await authCall("GET", "/user", token);
  if (!result.ok || result.data?.id !== identity.user) throw reject(401);
  return identity;
}

const purpose = ({ user, session }) => scalar(
  "select private.identity_session_purpose($1,$2) as result", [user, session],
);
const actorAllowed = ({ user, session }, verb) => scalar(
  "select private.identity_actor($1,$2,$3) as result", [user, session, verb],
);

// A instância interna aceita apenas tráfego do Kong. Um limite global cobre origens
// desconhecidas e o limite por conta não diferencia identidades existentes.
const budgets = new Map();
const interval = 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [key, item] of budgets) if (item.until <= now) budgets.delete(key);
}, interval).unref();
function rateLimit(key, maximum) {
  const now = Date.now();
  const existing = budgets.get(key);
  if (existing && existing.until > now) {
    if (existing.count >= maximum) throw reject(429);
    existing.count++;
  } else {
    if (budgets.size >= 4096) throw reject(429);
    budgets.set(key, { count: 1, until: now + interval });
  }
}
const hash = (value) => createHash("sha256").update(value).digest("hex");

async function tokenGrant(request, url) {
  const grant = url.searchParams.get("grant_type");
  if ([...url.searchParams].length !== 1 || !["password", "refresh_token"].includes(grant)) throw reject(404);
  rateLimit("grant", 180);
  let credentials;
  let context;
  if (grant === "password") {
    const input = await parse(request, ["email", "password", "gotrue_meta_security"]);
    if (input.gotrue_meta_security !== undefined
        && JSON.stringify(input.gotrue_meta_security) !== "{}") throw reject(400);
    const email = emailAddress(input.email);
    rateLimit(`login:${hash(email)}`, 12);
    credentials = { email, password: passwordInput(input.password, 1) };
    context = await execute("select * from private.identity_login_state($1)", [email]);
    // Usa o mesmo resultado público para credencial incorreta ou conta indisponível.
    if (!context) throw reject(400, "invalid_credentials");
  } else {
    const input = await parse(request, ["refresh_token"]);
    if (typeof input.refresh_token !== "string" || !/^[\w-]{8,2048}$/.test(input.refresh_token)) {
      throw reject(400);
    }
    credentials = { refresh_token: input.refresh_token };
  }
  const result = await authCall("POST", `/token?grant_type=${grant}`, undefined, credentials);
  if (!result.ok) throw reject(400, "invalid_credentials");
  const token = result.data?.access_token;
  const identity = await identify(token);
  if (result.data?.user?.id !== identity.user) throw reject(401);
  const admitted = grant === "password"
    ? context.user_id === identity.user && await scalar(
      "select private.identity_admit($1,$2,$3) as result", [identity.user, identity.session, context.generation],
    )
    : await purpose(identity);
  if (!admitted) {
    await authCall("POST", "/logout?scope=local", token).catch(() => {});
    throw reject(400, "invalid_credentials");
  }
  return result.data;
}

function intentFor(body) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = emailAddress(body.email);
  if (!name || name.length > 160 || (body.roleId !== null && !uuid.test(body.roleId))
      || (body.unitId !== null && !uuid.test(body.unitId))
      || (body.sectorId !== null && !uuid.test(body.sectorId))
      || Boolean(body.roleId) !== Boolean(body.unitId) || (body.sectorId && !body.unitId)
      || body.verified !== true) throw reject(400);
  return [email, name, body.roleId, body.unitId, body.sectorId];
}

async function credentialCommand(request, token, identity, verb, target) {
  const keys = {
    create: ["operation", "name", "email", "roleId", "unitId", "sectorId", "verified"],
    reset: ["operation", "version", "verified"],
    change: ["operation", "password", "confirmation", "currentPassword"],
  };
  const body = await parse(request, keys[verb]);
  if (!uuid.test(body.operation)) throw reject(400);
  rateLimit(`command:${identity.user}`, 15);
  if (verb === "change") {
    if (await purpose(identity) !== "password_change") throw reject(403);
  } else if (!await actorAllowed(identity, verb)) {
    throw reject(403);
  }

  let intent = [null, null, null, null, null];
  if (verb === "create") intent = intentFor(body);
  if (verb === "reset" && (!Number.isSafeInteger(identity.passwordAuthenticatedAt)
      || Date.now() / 1000 - identity.passwordAuthenticatedAt > 900)) {
    throw reject(403, "operator_login_required");
  }
  if (verb === "reset" && (!Number.isInteger(body.version) || body.version < 1
      || body.verified !== true || identity.user === target)) throw reject(403);
  if (verb === "change") {
    passwordInput(body.password, 12);
    passwordInput(body.currentPassword, 1);
    if (body.password !== body.confirmation || body.password === body.currentPassword) {
      throw reject(400, "invalid_password");
    }
  }

  const { user, session } = identity;
  const operation = body.operation;
  const start = await scalar(
    "select private.identity_begin($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as result",
    [user, session, operation, target, verb, body.version ?? null, ...intent],
  );
  if (!start) throw reject(409, "operation_conflict");
  const finish = (confirmation) => scalar(
    "select private.identity_finish($1,$2,$3,$4,$5) as result", [user, session, operation, target, confirmation],
  );
  const temporary = verb === "change" ? null : `Gg!9-${randomBytes(24).toString("base64url")}`;
  try {
    let result;
    if (verb === "create") {
      result = await authCall("POST", "/admin/users", serviceKey, {
        id: target, email: intent[0], password: temporary, email_confirm: true,
        user_metadata: { display_name: intent[1] },
      });
    } else if (verb === "reset") {
      result = await authCall("PUT", `/admin/users/${target}`, serviceKey, { password: temporary });
    } else {
      result = await authCall("PUT", "/user", token, {
        password: body.password, current_password: body.currentPassword,
      });
    }

    if (verb === "change" && !result.ok && [400, 422].includes(result.status)
        && ["same_password", "weak_password", "current_password_invalid"].includes(
          result.data?.error_code ?? result.data?.code,
        ) && await finish(false)) {
      throw reject(422, "password_rejected");
    }
    if (!result.ok || result.data?.id !== target || !await finish(true)) {
      throw reject(503, "reconciliation_required");
    }
  } catch (error) {
    if (error.code === "password_rejected") throw error;
    // Um timeout pode ocorrer após o commit do GoTrue. Preserva a operação exclusiva
    // e a quarentena, sem repetir chamada nem devolver uma credencial incerta.
    throw Object.assign(reject(503, "reconciliation_required"), { operation });
  }
  return temporary ? { userId: target, temporaryPassword: temporary } : { loginRequired: true };
}

const server = createServer({
  headersTimeout: 8000,
  requestTimeout: 10000,
  maxHeaderSize: 16000,
}, async (request, response) => {
  try {
    const method = request.method;
    const url = new URL(request.url, "http://identity.internal");
    const path = url.pathname;
    if (!request.url.startsWith("/") || request.url.startsWith("//")
        || request.url.split("?")[0] !== path) throw reject(400);
    if (path === "/health" && method === "GET" && !url.search) {
      await execute("select private.identity_enabled()");
      return send(response, 204);
    }
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.has(origin)) throw reject(403);
    if (!await scalar("select private.identity_enabled() as result")) throw reject(503, "identity_disabled");
    if (path.startsWith("/storage/")) {
      if (path === "/storage/status" && method === "GET" && request.url === path) return send(response, 200, { status: "ok" });
      const upstreamPath = storagePath(request);
      if (!upstreamPath) throw reject(404);
      const token = /^Bearer (\S+)$/i.exec(request.headers.authorization ?? "")?.[1];
      const identity = await identify(token);
      if (await purpose(identity) !== "application") throw reject(403);
      await proxyStorage(request, response, upstreamPath, token);
      return;
    }
    if (path === "/token" && method === "POST") {
      return send(response, 200, await tokenGrant(request, url));
    }
    const reset = /^\/identity\/users\/([0-9a-f-]+)\/password-reset$/i.exec(path);
    const routes = (path === "/identity/me" && method === "GET")
      || (path === "/logout" && method === "POST")
      || (method === "POST" && ["/identity/me/password", "/identity/users"].includes(path))
      || (method === "POST" && reset && uuid.test(reset[1]));
    if (!routes || (path !== "/logout" && url.search)) throw reject(404);
    const token = /^Bearer (\S+)$/i.exec(request.headers.authorization ?? "")?.[1];
    const identity = await identify(token);

    if (path === "/logout") {
      const scope = url.searchParams.get("scope") ?? "global";
      if ([...url.searchParams].length > 1 || !["local", "global"].includes(scope)
          || (url.search && !url.searchParams.has("scope"))) throw reject(400);
      const result = await authCall("POST", `/logout?scope=${scope}`, token);
      return send(response, result.ok ? 204 : 401);
    }
    if (path === "/identity/me") {
      const sessionPurpose = await purpose(identity);
      if (!sessionPurpose) throw reject(403);
      return send(response, 200, {
        passwordChangeRequired: sessionPurpose === "password_change",
        provision: sessionPurpose === "application" && await actorAllowed(identity, "create"),
        resetPassword: sessionPurpose === "application" && await actorAllowed(identity, "reset"),
      });
    }
    if (!origin) throw reject(403);
    const verb = reset ? "reset" : path === "/identity/users" ? "create" : "change";
    const target = reset ? reset[1].toLowerCase() : verb === "create" ? randomUUID() : identity.user;
    const result = await credentialCommand(request, token, identity, verb, target);
    return send(response, verb === "create" ? 201 : 200, result);
  } catch (error) {
    if (response.destroyed || response.headersSent) { response.destroy(); return; }
    const status = error.status ?? (error.code === "23505" ? 409 : 503);
    if (!error.status && status >= 500) process.stderr.write("identity_operation_error\n");
    send(response, status, {
      code: error.status ? error.code : status === 409 ? "operation_conflict" : "unavailable",
      ...(error.operation ? { operation: error.operation } : {}),
    });
  }
});
server.listen(8080, "0.0.0.0");
