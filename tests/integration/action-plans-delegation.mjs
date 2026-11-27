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
  const page = await browserInstance.newPage({ viewport, hasTouch: viewport.width < 600 });
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

  phase = "seleção e edição em Chromium desktop e mobile";
  browser = await chromium.launch();
  const desktop = await login(browser, manager, { width: 1280, height: 900 });
  const managerMobile = await login(browser, manager, { width: 375, height: 812 });
  const title = `Revisar plano ${tag}`;

  async function selectAssignee(dialog, actor, touch) {
    const picker = dialog.getByRole("combobox", { name: "Responsável" });
    const due = dialog.getByLabel("Prazo");
    const position = async () => (await due.boundingBox()).y - (await picker.boundingBox()).y;
    await picker.click();
    const previous = await position();
    await picker.fill("");
    await picker.pressSequentially(`${tag} ${actor.name.split(" ").at(-1)}`, { delay: 40 });
    const option = dialog.getByRole("option", { name: actor.name, exact: true });
    await option.waitFor();
    assert.ok(Math.abs(await position() - previous) < 1, "O formulário mudou de posição durante a busca");
    assert.ok(await picker.evaluate((node) => node === document.activeElement));
    if (touch) await option.tap();
    else {
      await picker.press("ArrowDown");
      assert.equal(await option.getAttribute("aria-selected"), "true");
      await picker.press("Enter");
    }
    assert.equal(await picker.inputValue(), actor.name);
    assert.ok(await picker.evaluate((node) => node === document.activeElement));
    assert.equal(await dialog.getByRole("listbox").count(), 0);
  }
  async function createOn(page, name, responsible, touch) {
    await page.goto(origin + "/action-plans");
    await page.getByRole("button", { name: /Novo plano/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/Ponto de melhoria/).fill(name);
    await dialog.getByLabel("O que fazer").fill("Ajustar procedimento");
    await dialog.getByLabel("Como fazer").fill("Revisar checklist");
    await dialog.getByLabel("Prazo").fill(new Date().toISOString().slice(0, 10));
    await dialog.getByLabel("Critério de eficácia").fill("Procedimento conferido");
    await dialog.getByLabel("Evidência esperada").fill("PDF");
    await selectAssignee(dialog, responsible, touch);
    await checkWidth(page);
    await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
    await page.waitForURL(/\/action-plans\/[0-9a-f-]+$/);
    await page.getByText(responsible.name, { exact: true }).waitFor();
    return page.url().split("/").at(-1);
  }
  async function editOn(page, id, original, responsible, touch) {
    await page.getByRole("button", { name: "Editar planejamento" }).click();
    const dialog = page.getByRole("dialog");
    const picker = dialog.getByRole("combobox", { name: "Responsável" });
    assert.equal(await picker.inputValue(), original.name);
    await picker.fill("Busca sem seleção");
    await picker.press("Tab");
    assert.equal(await picker.inputValue(), original.name);
    await selectAssignee(dialog, responsible, touch);
    await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
    await page.getByText(responsible.name, { exact: true }).waitFor();
    const [saved] = await ap(manager, "plan_summaries", { p_plan: id });
    assert.equal(saved.plan.responsible_id, responsible.id);
  }
  plan = await createOn(desktop, title, other, false);
  assert.equal((await get(manager)).responsible_id, other.id);
  await editOn(desktop, plan, other, executor, false);
  const mobilePlan = await createOn(managerMobile, `Planejamento móvel ${tag}`, manager, true);
  const [mobileSaved] = await ap(manager, "plan_summaries", { p_plan: mobilePlan });
  assert.equal(mobileSaved.plan.responsible_id, manager.id);
  await editOn(managerMobile, mobilePlan, manager, other, true);
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
  const downloaded = mobile.waitForEvent("download");
  await mobile.getByRole("button", { name: "Baixar execucao.pdf" }).click();
  const attachment = await downloaded;
  assert.equal(attachment.suggestedFilename(), "execucao.pdf");
  assert.deepEqual(readFileSync(await attachment.path()), pdf);
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
  phase = "auditoria de origem em leitura por atribuição";
  const auditCall = async (actor, name, payload) => {
    const response = await expectStatus(rpc(actor, name, payload, "audit"), 200, 204);
    return response?.json();
  };
  const auditRows = async (actor, table, filters) => (await expectStatus(
    request(`/rest/v1/${table}?${filters}`, { actor, schema: "audit" }), 200,
  )).json();
  const prepareOrigin = async (actor) => {
    const id = await auditCall(manager, "create_inspection", {
      p_unit: unit, p_applied_on: new Date().toISOString().slice(0, 10), p_previous_visit_on: null,
    });
    const observation = `Observação da auditoria ${actor.name}`;
    await expectStatus(request(`/rest/v1/inspection_answers?inspection_id=eq.${id}&item_key=eq.item-001`, {
      actor: manager, method: "PATCH", schema: "audit", payload: { response: "AP", observation },
    }), 204);
    const [{ plan: source }] = await ap(manager, "plan_summaries", { p_inspection: id });
    await ap(manager, "update_plan", { ...planning(actor.id, source.version), p_id: source.id });
    const [file] = await auditCall(manager, "begin_checklist_evidence_upload", {
      p_inspection: id, p_item_key: "item-001", p_original_name: "origem.pdf",
      p_content_type: "application/pdf", p_size: pdf.length,
    });
    await expectStatus(request(`/storage/v1/object/audit-checklist-evidence/${file.object_key}`, {
      actor: manager, method: "POST", bytes: pdf,
    }), 200);
    await auditCall(manager, "confirm_checklist_evidence_upload", { p_evidence: file.evidence_id });
    return { id, source: source.id, observation, key: file.object_key };
  };
  const linked = await prepareOrigin(executor);
  const unrelated = await prepareOrigin(other);
  const audited = await auditRows(executor, "inspections", "select=id");
  assert.deepEqual(audited, [{ id: linked.id }]);
  assert.deepEqual(await auditCall(executor, "inspection_summaries", {}), []);
  assert.equal((await auditCall(executor, "inspection_summaries", { p_inspection: linked.id }))[0].id, linked.id);
  assert.deepEqual(await auditCall(executor, "inspection_summaries", { p_inspection: unrelated.id }), []);
  assert.deepEqual(await auditCall(executor, "inspection_summaries", { p_inspection: linked.id, p_overview: true }), []);
  const answersOf = (actor, id) => auditRows(actor, "inspection_answers",
    `inspection_id=eq.${id}&item_key=eq.item-001&select=response,observation`);
  assert.deepEqual(await answersOf(executor, linked.id), [{ response: "AP", observation: linked.observation }]);
  assert.deepEqual(await answersOf(executor, unrelated.id), []);
  const metadataOf = (actor, id) => auditCall(actor, "checklist_evidence", { p_inspection: id });
  assert.equal((await metadataOf(executor, linked.id)).length, 1);
  assert.deepEqual(await metadataOf(executor, unrelated.id), []);
  const original = (actor, key) => request(`/storage/v1/object/authenticated/audit-checklist-evidence/${key}`, { actor });
  assert.deepEqual(Buffer.from(await (await expectStatus(original(executor, linked.key), 200)).arrayBuffer()), pdf);
  await expectStatus(original(executor, unrelated.key), 400, 401, 403, 404);
  await expectStatus(request(`/storage/v1/object/sign/audit-checklist-evidence/${linked.key}`, {
    actor: executor, method: "POST", payload: { expiresIn: 60 },
  }), 400, 401, 403, 404);
  await expectStatus(rpc(executor, "inspection_export", { p_inspection: linked.id }, "audit"), 403);
  await expectStatus(rpc(executor, "unit_history_export", { p_unit: unit }, "audit"), 403);
  await expectStatus(request(`/rest/v1/inspection_answers?inspection_id=eq.${linked.id}&item_key=eq.item-001`, {
    actor: executor, method: "PATCH", schema: "audit", payload: { observation: "Alteração indevida" },
  }), 204);
  assert.deepEqual(await answersOf(manager, linked.id), [{ response: "AP", observation: linked.observation }]);

  await mobile.goto(`${origin}/action-plans/${linked.source}`);
  await mobile.getByRole("link", { name: "Abrir auditoria", exact: true }).click();
  await mobile.locator(".audit-attention-obs").filter({ hasText: linked.observation }).waitFor();
  await checkWidth(mobile);
  const auditDownload = mobile.waitForEvent("download");
  await mobile.getByRole("button", { name: /^Baixar/ }).click();
  assert.deepEqual(readFileSync(await (await auditDownload).path()), pdf);
  await mobile.getByRole("link", { name: "Abrir checklist" }).click();
  await mobile.locator(".audit-observation-text").filter({ hasText: linked.observation }).waitFor();
  assert.equal(await mobile.locator("input[type=file], .audit-observation textarea").count(), 0);
  await mobile.goto(`${origin}/audit/inspections/${unrelated.id}`);
  await mobile.getByText("Auditoria indisponível", { exact: true }).waitFor();
  await mobile.goto(`${origin}/action-plans/${unrelated.source}`);
  await mobile.getByText("Plano de ação indisponível", { exact: true }).waitFor();
  await mobile.goto(`${origin}/audit`);
  await mobile.getByText("Acesso não autorizado", { exact: true }).waitFor();

  await sql(`update core.user_role_assignments set active=false where user_id='${executor.id}'`);
  assert.deepEqual(await answersOf(executor, linked.id), []);
  await expectStatus(original(executor, linked.key), 400, 401, 403, 404);
  await sql(`update core.user_role_assignments set active=true where user_id='${executor.id}'`);
  const [{ plan: source }] = await ap(manager, "plan_summaries", { p_plan: linked.source });
  await ap(manager, "update_plan", { ...planning(other.id, source.version), p_id: source.id });
  assert.deepEqual(await answersOf(executor, linked.id), []);
  assert.equal((await answersOf(other, linked.id)).length, 1);
  const impact = await ap(manager, "plan_delete_impact", { p_plan: source.id });
  await ap(manager, "begin_plan_delete", { p_plan: source.id, p_snapshot: impact.snapshot, p_confirmation: "excluir plano de ação" });
  assert.deepEqual(await metadataOf(other, linked.id), []);
  await expectStatus(original(other, linked.key), 400, 401, 403, 404);
  await ap(manager, "finish_plan_delete", { p_plan: source.id });
  assert.deepEqual(await answersOf(other, linked.id), []);
  assert.equal((await answersOf(manager, linked.id)).length, 1);
  console.log(`PASS AP-02 (${identity ? "Identity" : "base"}): Chromium desktop/375px, REST, RLS, Storage, relato, reatribuição, revogação, conclusão, verificação e auditoria vinculada.`);
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
      const objects = await sql(`select o.bucket_id,o.name from storage.objects o
        where (o.bucket_id='${bucket}' and split_part(o.name,'/',1) in
         (select p.id::text from action_plans.plans p where p.unit_id='${unit}'))
        or (o.bucket_id='audit-checklist-evidence' and split_part(o.name,'/',1) in
         (select i.id::text from audit.inspections i where i.unit_id='${unit}'))`);
      for (const target of [bucket, "audit-checklist-evidence"]) {
        const keys = objects.split("\n").filter((row) => row.startsWith(target + "|")).map((row) => row.split("|")[1]);
        if (!keys.length) continue;
        const status = docker(["exec", "-i", `${project}-identity-1`, "node", "--input-type=module", "-e", `
          import {readFileSync} from "node:fs";
          const {bucket, prefixes}=JSON.parse(readFileSync(0,"utf8"));
          const response=await fetch("http://storage:5000/object/"+bucket,{
            method:"DELETE",headers:{Authorization:"Bearer "+process.env.GG_IDENTITY_AUTH_ADMIN_KEY,"Content-Type":"application/json"},
            body:JSON.stringify({prefixes}),
          });
          process.stdout.write(String(response.status));
        `], JSON.stringify({ bucket: target, prefixes: keys }));
        assert.ok(["200", "204"].includes(status));
        const names = keys.map((name) => {
          assert.match(name, /^[0-9a-f-]+\/[0-9a-f-]+$/);
          return `'${name}'`;
        }).join(",");
        assert.equal(await sql(`select count(*) from storage.objects where bucket_id='${target}' and name in (${names})`), "0");
      }
      await sql(`begin;
        delete from action_plans.evidence where plan_id in (select id from action_plans.plans where unit_id='${unit}');
        delete from action_plans.plans where unit_id='${unit}';
        delete from audit_private.deletion_objects where plan_id in (select plan_id from action_plans_private.plan_deletions where unit_id='${unit}');
        delete from audit_private.deletion_namespaces where plan_id in (select plan_id from action_plans_private.plan_deletions where unit_id='${unit}');
        delete from action_plans_private.plan_deletions where unit_id='${unit}';
        delete from audit.checklist_evidence_derivatives where evidence_id in (
          select e.id from audit.checklist_evidence e join audit.inspections i on i.id=e.inspection_id where i.unit_id='${unit}');
        delete from audit.checklist_evidence where inspection_id in (select id from audit.inspections where unit_id='${unit}');
        delete from audit.inspection_answers where inspection_id in (select id from audit.inspections where unit_id='${unit}');
        delete from audit.inspections where unit_id='${unit}';
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
