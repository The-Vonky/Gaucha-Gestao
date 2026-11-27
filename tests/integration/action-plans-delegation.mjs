import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import pg from "pg";

const project = process.argv[2];
const ci = process.env.GITHUB_ACTIONS === "true";
const identity = Boolean(project);
assert.ok(project === "gaucha-gestao-local" ||
  (ci && (!project || /^gg-identity-ci-\d+-\d+$/.test(project))), "Use o DEV pessoal com Identity ou a CI descartável.");
const local = project === "gaucha-gestao-local";
const origin = "http://127.0.0.1:5173";
const api = "http://127.0.0.1:54321";
const tag = randomUUID().slice(0, 8);
const unit = randomUUID();
const password = `Ap02!-${randomUUID()}-aA9`;
const employee = (label) => ({
  id: randomUUID(),
  email: `ap02-${label}-${tag}@example.test`,
  name: `AP02 ${tag} ${label}`,
});
const manager = employee("gerente");
const executor = employee("executor");
const other = employee("substituto");
const people = [manager, executor, other];
const pdf = Buffer.from("%PDF-1.4\nFixture AP-02\n%%EOF");
const bucket = "action-plan-evidence";
let db, browser, vite, plan, objectKey, anon, baseConfig;
let phase = "configuração";

function docker(args, input) {
  return execFileSync("docker", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
}
async function sql(query) {
  if (!identity) return (await db.query(query)).rows?.map((row) => Object.values(row).join("|")).join("\n") ?? "";
  return docker(["exec", "-i", `${project}-db-1`, "psql", "-XqAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], query);
}
async function authAdmin(method, path, payload) {
  if (!identity) {
    return fetch(`${api}/auth/v1/admin/users${path}`, {
      method,
      headers: {
        apikey: baseConfig.SERVICE_ROLE_KEY,
        Authorization: `Bearer ${baseConfig.SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: payload && JSON.stringify(payload),
    });
  }
  const status = docker(["exec", "-i", `${project}-identity-1`, "node", "--input-type=module", "-e", `
    import {readFileSync} from "node:fs";
    const {method,path,payload}=JSON.parse(readFileSync(0,"utf8"));
    const response=await fetch("http://auth:9999/admin/users"+path,{
      method,headers:{Authorization:"Bearer "+process.env.GG_IDENTITY_AUTH_ADMIN_KEY,"Content-Type":"application/json"},
      body:payload && JSON.stringify(payload),
    });
    process.stdout.write(String(response.status));
  `], JSON.stringify({ method, path, payload }));
  return { status: Number(status) };
}
function request(path, { actor, method = "GET", schema = "action_plans", payload, bytes } = {}) {
  return fetch(api + path, {
    method,
    headers: {
      Origin: origin,
      apikey: anon,
      ...(actor?.token && { Authorization: `Bearer ${actor.token}` }),
      "Accept-Profile": schema,
      "Content-Profile": schema,
      ...(payload !== undefined && { "Content-Type": "application/json" }),
      ...(bytes && { "Content-Type": "application/pdf" }),
    },
    body: bytes ?? (payload === undefined ? undefined : JSON.stringify(payload)),
  });
}
async function expectStatus(response, ...statuses) {
  const result = await response;
  if (!statuses.includes(result.status)) {
    const failure = await result.json().catch(() => null);
    throw new Error(`HTTP ${result.status}, esperado ${statuses.join("/")}${failure?.code ? ` (${failure.code})` : ""}`);
  }
  return result.status === 204 ? null : result;
}
const rpc = (actor, name, payload, schema) =>
  request(`/rest/v1/rpc/${name}`, { actor, schema, method: "POST", payload });
const ap = async (actor, name, payload) => {
  const result = await expectStatus(rpc(actor, name, payload), 200, 204);
  return result?.json();
};
const get = async (actor) => (await ap(actor, "plan_summaries", { p_plan: plan }))[0]?.plan;
async function createSession(actor) {
  const response = await expectStatus(request("/auth/v1/token?grant_type=password", {
    method: "POST", payload: { email: actor.email, password },
  }), 200);
  actor.token = (await response.json()).access_token;
}
const version = async () => (await get(manager)).version;
async function login(browserInstance, actor, viewport) {
  const page = await browserInstance.newPage({ viewport });
  await page.goto(origin);
  await page.getByLabel(/E-mail/i).fill(actor.email);
  await page.getByLabel(/^Senha$/i).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("heading", { level: 2, name: "Planos de Ação", exact: true }).waitFor();
  return page;
}
const checkWidth = async (page) => assert.ok(await page.evaluate(
  () => document.documentElement.scrollWidth <= window.innerWidth,
), "Página precisa caber no viewport");
async function waitForVite() {
  for (let count = 0; count < 200; count++) {
    const response = await fetch(origin).catch(() => null);
    if (response?.ok && (await response.text()).includes('id="root"')) return;
    if (vite?.exitCode != null) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Vite indisponível.");
}

try {
  if (identity) {
    for (const service of ["db", "identity", "kong"]) {
      assert.equal(docker(["inspect", "--format", '{{index .Config.Labels "com.docker.compose.project"}}',
        `${project}-${service}-1`]), project);
    }
    assert.equal(await sql("select enabled from private.identity_settings"), "t");
    anon = local ? readFileSync("apps/web/.env.local", "utf8")
      .match(/^VITE_SUPABASE_PUBLISHABLE_KEY=(\S+)$/m)?.[1] : process.env.GG_IDENTITY_TEST_ANON_KEY;
  } else {
    baseConfig = JSON.parse(execFileSync("npx", ["--yes", "supabase@2.117.0", "status", "-o", "json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
    assert.equal(baseConfig.API_URL, api);
    assert.equal(new URL(baseConfig.DB_URL).hostname, "127.0.0.1");
    db = new pg.Client({ connectionString: baseConfig.DB_URL });
    await db.connect();
    anon = baseConfig.ANON_KEY;
    assert.equal(await sql("select enabled from private.identity_settings"), "false");
  }
  assert.ok(anon);
  if (!local) {
    vite = spawn(process.execPath, ["../../node_modules/vite/bin/vite.js", "--strictPort", "--host", "127.0.0.1"], {
      cwd: "apps/web", stdio: "ignore", env: { ...process.env,
        VITE_SUPABASE_URL: api, VITE_SUPABASE_PUBLISHABLE_KEY: anon,
        VITE_GG_IDENTITY_ENABLED: String(identity),
      },
    });
  }
  await waitForVite();

  phase = "fixtures e autenticação";
  for (const actor of people) {
    const payload = { id: actor.id, email: actor.email, password, email_confirm: true, user_metadata: { display_name: actor.name } };
    const response = await authAdmin("POST", "", payload);
    assert.ok([200, 201].includes(response.status));
  }
  await sql(`begin;
    insert into core.units(id,code,name) values ('${unit}','AP02-${tag}','Fixture AP-02');
    ${people.map((actor) => `
      update core.profiles set display_name='${actor.name}' where id='${actor.id}';
      ${identity ? `insert into private.identity_credentials(user_id,state,managed) values ('${actor.id}','active',false);` : ""}
      insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id)
      select '${actor.id}',id,'unit','${unit}' from core.roles where key='${actor === manager ? "quality" : "quality_executor"}';
    `).join("")}
    commit;`);
  for (const actor of people) await createSession(actor);

  phase = "planejamento em Chromium desktop";
  browser = await chromium.launch();
  const desktop = await login(browser, manager, { width: 1280, height: 900 });
  const title = `Revisar plano ${tag}`;
  await desktop.goto(origin + "/action-plans");
  await desktop.getByRole("button", { name: /Novo plano/ }).click();
  const form = desktop.getByRole("dialog");
  await form.getByLabel(/Ponto de melhoria/).fill(title);
  await form.getByLabel("O que fazer").fill("Ajustar procedimento");
  await form.getByLabel("Como fazer").fill("Revisar checklist");
  await form.getByLabel("Prazo").fill(new Date().toISOString().slice(0, 10));
  await form.getByLabel("Critério de eficácia").fill("Procedimento conferido");
  await form.getByLabel("Evidência esperada").fill("PDF");
  await form.getByLabel("Buscar funcionário").fill(executor.name);
  const select = form.getByLabel("Funcionário responsável");
  await select.getByRole("option", { name: executor.name }).waitFor({ state: "attached" });
  await select.selectOption(executor.id);
  await checkWidth(desktop);
  await form.getByRole("button", { name: "Salvar", exact: true }).click();
  await desktop.waitForURL(/\/action-plans\/[0-9a-f-]+$/);
  plan = desktop.url().split("/").at(-1);
  await desktop.getByText(executor.name, { exact: true }).waitFor();
  assert.equal((await get(manager)).responsible_id, executor.id);
  assert.equal(await get(other), undefined);
  await expectStatus(rpc(executor, "search_assignees", { p_unit: unit, p_sector: null, p_plan: plan }), 403);
  const status = (actor, state, v) => rpc(actor, "set_plan_status", { p_id: plan, p_version: v, p_status: state });
  await expectStatus(status(other, "in_progress", await version()), 403);
  await expectStatus(status(executor, "completed", await version()), 403);

  phase = "execução em Chromium mobile";
  const mobile = await login(browser, executor, { width: 375, height: 812 });
  await mobile.goto(`${origin}/action-plans/${plan}`);
  await mobile.getByRole("button", { name: "Iniciar execução", exact: true }).click();
  await mobile.getByRole("button", { name: "Confirmar", exact: true }).click();
  await mobile.getByRole("button", { name: "Registrar relato", exact: true }).click();
  await mobile.getByLabel(/Relato da execução/).fill("Relato AP-02 em andamento");
  await mobile.getByRole("button", { name: "Salvar", exact: true }).click();
  await mobile.getByText("Relato AP-02 em andamento", { exact: true }).waitFor();
  await mobile.locator('input[type="file"]').setInputFiles({ name: "execucao.pdf", mimeType: "application/pdf", buffer: pdf });
  await mobile.getByRole("button", { name: "Baixar execucao.pdf" }).waitFor();
  await checkWidth(mobile);
  for (const label of ["Concluir", "Editar planejamento", "Excluir", "Verificar eficácia"])
    assert.equal(await mobile.getByRole("button", { name: label, exact: true }).count(), 0);

  phase = "grants, download autenticado e reatribuição";
  const [file] = await ap(manager, "plan_evidence", { p_plan: plan });
  objectKey = file.object_key;
  const download = (actor) => request(`/storage/v1/object/authenticated/${bucket}/${objectKey}`, { actor });
  assert.deepEqual(Buffer.from(await (await expectStatus(download(executor), 200)).arrayBuffer()), pdf);
  const sign = (op, actor) => request(`/storage/v1/object/${op}/${bucket}/${objectKey}`, {
    actor, method: "POST", payload: { expiresIn: 60 },
  });
  await expectStatus(sign("sign", executor), 400, 401, 403, 404);
  const [reserved] = await ap(executor, "begin_evidence_upload", {
    p_plan: plan, p_kind: "execution", p_original_name: "pendente.pdf",
    p_content_type: "application/pdf", p_size: pdf.length,
  });
  await expectStatus(request(`/storage/v1/object/upload/sign/${bucket}/${reserved.object_key}`, {
    actor: executor, method: "POST", payload: {},
  }), 400, 401, 403, 404);
  const planning = (responsible, v) => ({
    p_id: plan, p_version: v, p_improvement_point: title, p_action: "Ajustar procedimento",
    p_how_to: "Revisar checklist", p_responsible_id: responsible,
    p_due_date: new Date().toISOString().slice(0, 10), p_effectiveness_criterion: "Procedimento conferido",
    p_monitoring_start: null, p_monitoring_end: null, p_expected_evidence: "PDF",
  });
  const save = (actor, v) => rpc(actor, "save_execution_report", { p_plan: plan, p_version: v, p_report: "Relato revisado" });
  await expectStatus(rpc(executor, "update_plan", planning(other.id, await version())), 403);
  await expectStatus(save(executor, (await version()) - 1), 500, 409);
  await ap(manager, "update_plan", planning(other.id, await version()));
  assert.equal(await get(executor), undefined);
  assert.deepEqual(await ap(executor, "execution_report_history", { p_plan: plan }), []);
  await expectStatus(download(executor), 400, 401, 403, 404);
  await expectStatus(request(`/storage/v1/object/${bucket}/${reserved.object_key}`, {
    actor: executor, method: "POST", bytes: pdf,
  }), 400, 401, 403, 404);
  await expectStatus(rpc(other, "remove_evidence", { p_evidence: file.id }), 403);
  await expectStatus(download(other), 200);
  await sql(`update core.user_role_assignments set active=false where user_id='${other.id}'`);
  assert.equal(await get(other), undefined);
  await expectStatus(download(other), 400, 401, 403, 404);
  await sql(`update core.user_role_assignments set active=true where user_id='${other.id}';
             update core.profiles set active=false where id='${other.id}'`);
  await expectStatus(download(other), 400, 401, 403, 404);
  await sql(`update core.profiles set active=true where id='${other.id}';
             update core.user_role_assignments set active=true where user_id='${other.id}'`);
  await createSession(other);

  phase = "conclusão e verificação";
  await desktop.reload();
  await desktop.getByText("Relato AP-02 em andamento", { exact: true }).waitFor();
  await desktop.getByRole("button", { name: "Concluir", exact: true }).click();
  await desktop.getByRole("button", { name: "Confirmar", exact: true }).click();
  await desktop.getByRole("button", { name: "Verificar eficácia", exact: true }).waitFor();
  await expectStatus(save(other, await version()), 400, 409, 500);
  await expectStatus(status(other, "in_progress", await version()), 403);
  await ap(manager, "verify_plan", {
    p_id: plan, p_version: await version(), p_effectiveness: "effective", p_verified_on: new Date().toISOString().slice(0, 10),
    p_notes: "Verificação AP-02", p_expected_evidence_ids: [file.id],
  });
  assert.equal((await get(manager)).effectiveness, "effective");
  console.log(`PASS AP-02 (${identity ? "Identity" : "base"}): Chromium desktop/375px, REST, RLS, Storage, relato, reatribuição, revogação, conclusão e verificação.`);
} catch (error) {
  console.error(`FAIL AP-02 (${phase}) | ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  vite?.kill();
  if (local) {
    try {
      const ids = people.map(({ id }) => `'${id}'`).join(",");
      // Usa a API de Storage para remover os bytes de qualquer plano desta fixture.
      const objects = await sql(`select o.name from storage.objects o join action_plans.plans p
        on split_part(o.name,'/',1)=p.id::text where p.unit_id='${unit}' and o.bucket_id='${bucket}'`);
      if (objects) {
        const status = docker(["exec", "-i", `${project}-identity-1`, "node", "--input-type=module", "-e", `
          import {readFileSync} from "node:fs";
          const response=await fetch("http://storage:5000/object/action-plan-evidence",{
            method:"DELETE",headers:{Authorization:"Bearer "+process.env.GG_IDENTITY_AUTH_ADMIN_KEY,"Content-Type":"application/json"},
            body:readFileSync(0,"utf8"),
          });
          process.stdout.write(String(response.status));
        `], JSON.stringify({ prefixes: objects.split("\n") }));
        assert.ok(["200", "204"].includes(status));
      }
      await sql(`begin;
        delete from action_plans.evidence where plan_id in (select id from action_plans.plans where unit_id='${unit}');
        delete from action_plans.plans where unit_id='${unit}';
        delete from core.user_role_assignments where user_id in (${ids});
        delete from private.identity_credentials where user_id in (${ids});
        delete from core.system_audit_log where unit_id='${unit}' or actor_user_id in (${ids}) or entity_id in (${ids});
        alter table core.units disable trigger record_change;
        delete from core.units where id='${unit}';
        alter table core.units enable trigger record_change;
        delete from core.profiles where id in (${ids});
        delete from core.system_audit_log where entity_id in (${ids});
        commit;`);
      for (const { id } of people) assert.ok([200, 204, 404].includes((await authAdmin("DELETE", `/${id}`)).status));
      assert.equal(await sql(`select count(*) from auth.users where id in (${ids})`), "0");
      assert.equal(await sql(`select count(*) from core.units where id='${unit}'`), "0");
      console.log("Fixtures AP-02 removidas do DEV pessoal e ausência confirmada.");
    } catch {
      console.error("Falha na limpeza das fixtures AP-02.");
      process.exitCode = 1;
    }
  }
  await db?.end();
}
