// Prova do contrato do provedor. Usa a fixture inativa da GG-05A no runner descartável.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export async function verifyPasswordLifecycle({ config, email, targetId }) {
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
  assert.equal(config.API_URL, "http://127.0.0.1:54321");
  assert.match(email, /^governance-none-[0-9a-f]{8}@example\.test$/);

  const health = await fetch(config.API_URL + "/auth/v1/health", { headers: { apikey: config.ANON_KEY } });
  assert.ok(health.ok, "health do provedor");
  assert.match((await health.json()).version, /^v?2\.196\.0$/, "versão do Auth sob ensaio");

  const options = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
  const client = () => createClient(config.API_URL, config.ANON_KEY, options);
  const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options).auth.admin;
  const secret = () => randomBytes(24).toString("base64url") + "-aA1!";
  const temporary = secret(), definitive = secret(), replacement = secret();

  async function setTemporary(value) {
    const result = await admin.updateUserById(targetId, { password: value });
    assert.ok(!result.error && result.data.user?.id === targetId, "reset da fixture pelo Auth");
  }
  async function login(auth, password) {
    const result = await auth.signInWithPassword({ email, password });
    assert.ok(!result.error && result.data.user?.id === targetId && result.data.session, "login da fixture");
    return result.data.session;
  }
  async function deniedLogin(password) {
    const result = await client().auth.signInWithPassword({ email, password });
    assert.ok(result.error?.code === "invalid_credentials" && !result.data.session, "senha substituída recusada");
  }
  async function deniedRefresh(session) {
    const result = await client().auth.refreshSession({ refresh_token: session.refresh_token });
    assert.ok(result.error && result.error.status >= 400 && result.error.status < 500 && !result.data.session,
      "renovação recusada pelo provedor");
  }

  await setTemporary(temporary);
  const first = client(), second = client();
  const firstSession = await login(first.auth, temporary);
  const otherSession = await login(second.auth, temporary);
  const same = await first.auth.updateUser({ password: temporary });
  assert.equal(same.error?.code, "same_password", "troca precisa substituir a credencial");
  const changed = await first.auth.updateUser({ password: definitive });
  assert.ok(!changed.error && changed.data.user?.id === targetId, "titular alterou a senha");
  await deniedLogin(temporary);
  await deniedRefresh(otherSession);
  const renewed = await first.auth.refreshSession({ refresh_token: firstSession.refresh_token });
  assert.ok(!renewed.error && renewed.data.session, "sessão da própria troca pode renovar");
  const fresh = await login(client().auth, definitive);

  await setTemporary(replacement);
  await deniedLogin(definitive);
  await deniedRefresh(renewed.data.session);
  await deniedRefresh(fresh);
  const previous = createClient(config.API_URL, config.ANON_KEY, {
    ...options, accessToken: async () => fresh.access_token,
  });
  const access = await previous.schema("core").rpc("my_access");
  assert.ok(!access.error && access.status === 200, "PostgREST ainda aceita o JWT anterior ao reset");
  assert.deepEqual(access.data, [], "Core preserva o bloqueio da fixture");
  const next = client();
  await login(next.auth, replacement);
  assert.ok(!(await next.auth.signOut()).error, "encerrar sessão sintética");
  console.log("PASS GG-05B GoTrue v2.196.0: troca, reset, login, refresh e JWT anterior no PostgREST.");
}
