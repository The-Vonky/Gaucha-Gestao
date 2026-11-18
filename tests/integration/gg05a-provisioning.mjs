// Extensão da matriz JWT da CI. Credenciais sintéticas permanecem em memória.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export async function verifyProvisioning({ config, operator, target, targetId, email, password, roleId, unit, otherUnit }) {
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
  assert.equal(new URL(config.API_URL).origin, "http://127.0.0.1:54321");
  assert.match(email, /^governance-none-[0-9a-f]{8}@example\.test$/);
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const core = operator.schema("core");
  function data(result, step) {
    assert.ok(!result.error, step);
    return result.data;
  }
  const session = data(await target.auth.getSession(), "sessão sintética inicial").session;
  const sameToken = createClient(config.API_URL, config.ANON_KEY, {
    ...options, accessToken: async () => session.access_token,
  }).schema("core");
  const visibleUnits = async () => data(await sameToken.from("units").select("id").in("id", [unit, otherUnit]), "RLS por unidade");
  const directory = data(await core.rpc("user_directory", { p_search: email, p_inactive: true }), "reconciliação Auth/Core");
  assert.equal(directory.length, 1);
  assert.equal(directory[0].id, targetId);
  assert.equal(directory[0].active, true);
  assert.deepEqual(await visibleUnits(), []);

  const authAdmin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options).auth.admin;
  const duplicate = await authAdmin.createUser({ email, password, email_confirm: true });
  assert.ok(["email_exists", "user_already_exists"].includes(duplicate.error?.code), "duplicata identificada pelo Auth");
  const grant = { user_id: targetId, role_id: roleId, scope_type: "unit", unit_id: unit };
  const assign = () => core.from("user_role_assignments").insert(grant);
  const operatorSession = data(await operator.auth.getSession(), "sessão do operador").session;
  async function disconnectedGrant(deliver) {
    let committed = false;
    const offline = createClient(config.API_URL, config.ANON_KEY, {
      ...options,
      accessToken: async () => operatorSession.access_token,
      global: {
        fetch: async (url, init) => {
          if (deliver) {
            const response = await fetch(url, init);
            committed = response.status === 201;
            await response.arrayBuffer();
          }
          throw new TypeError("Falha de rede sintética");
        },
      },
    });
    const result = await offline.schema("core").from("user_role_assignments").insert(grant);
    assert.ok(result.error && result.status === 0, "cliente perdeu a resposta");
    assert.equal(committed, deliver, "ponto de falha no transporte");
  }
  await disconnectedGrant(false);
  assert.deepEqual(data(await core.rpc("user_access_assignments", { p_user: targetId }), "falha antes do envio"), []);
  // Duas requisições para o mesmo pedido; reconciliar sem confiar na resposta vencedora.
  const responses = await Promise.all([assign(), assign()]);
  assert.equal(responses.filter(r => !r.error).length, 1, "grant único");
  assert.ok(responses.some(r => r.error?.code === "23505"), "unicidade da atribuição");
  const rows = data(await core.rpc("user_access_assignments", { p_user: targetId }), "reler atribuição");
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.ok(row.assignment_active && row.role_id === roleId && row.unit_id === unit && row.scope_type === "unit");
  assert.deepEqual(await visibleUnits(), [{ id: unit }]);
  const revoke = () => core.from("user_role_assignments").update({ active: false })
    .eq("id", row.assignment_id).eq("version", row.assignment_version).select("id");
  assert.equal(data(await revoke(), "revogar").length, 1);
  assert.deepEqual(data(await revoke(), "versão já consumida"), []);
  assert.deepEqual(await visibleUnits(), []);
  assert.deepEqual(data(await sameToken.rpc("my_access"), "JWT anterior à revogação"), []);
  await disconnectedGrant(true);
  const reconciled = data(await core.rpc("user_access_assignments", { p_user: targetId }), "falha após commit");
  assert.equal(reconciled.length, 1);
  assert.ok(reconciled[0].assignment_active && reconciled[0].role_id === roleId &&
    reconciled[0].unit_id === unit && reconciled[0].scope_type === "unit");
  assert.deepEqual(await visibleUnits(), [{ id: unit }]);
  assert.equal(data(await core.from("profiles").update({ active: false }).eq("id", targetId)
    .eq("version", directory[0].version).select("id"), "bloquear").length, 1);
  assert.deepEqual(await visibleUnits(), []);
  assert.deepEqual(data(await sameToken.from("profiles").select("id").eq("id", targetId), "perfil inativo"), []);

  // Contrato do provedor sem SMTP: somente a conta sintética já bloqueada.
  const recovery = createClient(config.API_URL, config.ANON_KEY, options);
  const { properties } = data(await authAdmin.generateLink({ type: "recovery", email }), "emitir recuperação sintética");
  data(await recovery.auth.verifyOtp({ type: "recovery", token_hash: properties.hashed_token }), "validar recuperação");
  const reused = await createClient(config.API_URL, config.ANON_KEY, options).auth.verifyOtp({
    type: "recovery", token_hash: properties.hashed_token,
  });
  assert.ok(reused.error && !reused.data.session, "recuperação de uso único");
  const newPassword = "Synthetic-" + randomUUID() + "-aA1!";
  data(await recovery.auth.updateUser({ password: newPassword }), "titular define nova senha");
  const fresh = createClient(config.API_URL, config.ANON_KEY, options);
  const login = data(await fresh.auth.signInWithPassword({ email, password: newPassword }), "novo login");
  assert.equal(login.user.id, targetId);
  assert.deepEqual(data(await fresh.schema("core").rpc("my_access"), "recuperação preserva bloqueio"), []);
  data(await fresh.auth.signOut({ scope: "global" }), "encerrar sessões sintéticas");
  const refresh = await recovery.auth.refreshSession({ refresh_token: login.session.refresh_token });
  assert.ok(refresh.error && !refresh.data.session, "renovação encerrada");
  assert.deepEqual(await visibleUnits(), []);
  console.log("PASS GG-05A Auth/Core, duplicata, grants concorrentes, mesmo JWT, revogação, bloqueio e recuperação sintética.");
}
