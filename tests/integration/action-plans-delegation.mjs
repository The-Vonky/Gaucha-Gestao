import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import pg from "pg";
import sharp from "sharp";

const project = process.argv[2];
const ci = process.env.GITHUB_ACTIONS === "true";
const identity = Boolean(project) && process.env.GG_AP03_LOCAL_PROFILE !== "base";
const native = Boolean(project);
assert.ok(project === "gaucha-gestao-local" ||
  (ci && (!project || /^gg-identity-ci-\d+-\d+$/.test(project))), "Use o DEV pessoal com Identity ou a CI descartável.");
const local = project === "gaucha-gestao-local";
assert.ok(process.env.GG_AP03_LOCAL_PROFILE !== "base" || local, "Seleção de perfil exclusiva do DEV pessoal.");
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
const viewer = employee("consulta");
const administrator = employee("admin");
const people = native ? [manager, executor, other, viewer, administrator] : [manager, executor, other];
const pdf = Buffer.from("%PDF-1.4\nFixture AP-02\n%%EOF");
const bucket = "action-plan-evidence";
let db, browser, vite, plan, objectKey, anon, baseConfig;
let phase = "configuração";

function docker(args, input) {
  return execFileSync("docker", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
}
async function sql(query) {
  if (!native) return (await db.query(query)).rows?.map((row) => Object.values(row).join("|")).join("\n") ?? "";
  return docker(["exec", "-i", `${project}-db-1`, "psql", "-XqAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], query);
}
async function authAdmin(method, path, payload) {
  if (!native) {
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
function request(path, { actor, method = "GET", schema = "action_plans", payload, bytes, mime = "application/pdf" } = {}) {
  return fetch(api + path, {
    method,
    headers: {
      Origin: origin,
      apikey: anon,
      "Accept-Encoding": "identity",
      ...(actor?.token && { Authorization: `Bearer ${actor.token}` }),
      "Accept-Profile": schema,
      "Content-Profile": schema,
      ...(payload !== undefined && { "Content-Type": "application/json" }),
      ...(bytes && { "Content-Type": mime, "Cache-Control": "0" }),
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

const denied = [400, 401, 403, 404];
const auditBucket = "audit-checklist-evidence";
const transformQuery = "width=480&height=480&resize=contain&quality=75&format=origin";
const render = (actor, target, key) =>
  request(`/storage/v1/render/image/authenticated/${target}/${key}?${transformQuery}`, { actor });
const object = (actor, target, key) =>
  request(`/storage/v1/object/authenticated/${target}/${key}`, { actor });
const signature = (actor, target, key, options = {}) =>
  request(`/storage/v1/object/sign/${target}/${key}`, {
    actor, method: "POST", payload: { expiresIn: 60, ...options },
  });
const traffic = {};
async function measure(actor, target, img, label) {
  const [thumbnail, original] = await Promise.all([
    expectStatus(render(actor, target, img.key), 200),
    expectStatus(object(actor, target, img.key), 200),
  ]);
  assert.equal(thumbnail.headers.get("content-type"), img.mime);
  for (const res of [thumbnail, original]) assert.equal(res.headers.get("content-encoding") ?? "identity", "identity");
  assert.match(thumbnail.headers.get("cache-control") ?? "", /no-store/);
  const small = Buffer.from(await thumbnail.arrayBuffer());
  const full = Buffer.from(await original.arrayBuffer());
  assert.deepEqual(full, img.bytes);
  const { width, height } = await sharp(small).metadata();
  assert.ok(width <= 480 && height <= 480);
  assert.ok(small.length < full.length / 2);
  traffic[label] = { miniatura: small.length, original: full.length };
}
async function preview(page, { name, key, bytes }, alt = name, { cached = true } = {}) {
  const paths = (response) => {
    const url = new URL(response.url());
    return url.pathname.startsWith("/storage/v1/") && url.pathname.endsWith("/" + key);
  };
  const enlarge = page.getByRole("button", { name: `Ampliar ${alt}`, exact: true });
  await page.locator(".file-item").filter({ hasText: alt }).scrollIntoViewIfNeeded();
  const [response] = await Promise.all([
    page.waitForResponse(r => paths(r) && r.url().includes("/object/") && r.request().method() === "GET"),
    enlarge.click(),
  ]);
  assert.equal(response.status(), 200);
  const dialog = page.getByRole("dialog", { name: alt, exact: true });
  const expanded = dialog.getByRole("img", { name: alt, exact: true });
  const sha = await expanded.evaluate(async img => {
    await img.decode();
    const blob = await fetch(img.src).then(res => res.arrayBuffer());
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", blob))]
      .map(value => value.toString(16).padStart(2, "0")).join("");
  });
  assert.equal(sha, createHash("sha256").update(bytes).digest("hex"));
  await checkWidth(page);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  if (cached) {
    let gets = 0;
    const count = r => { if (paths(r)) gets++; };
    page.on("response", count);
    await enlarge.click();
    await dialog.getByRole("img", { name: alt, exact: true }).waitFor();
    await dialog.getByRole("button", { name: "Fechar" }).click();
    assert.equal(gets, 0, "Reabertura usa o cache volátil");
    page.off("response", count);
  }
}

try {
  if (native) {
    for (const service of ["db", "identity", "kong"]) {
      assert.equal(docker(["inspect", "--format", '{{index .Config.Labels "com.docker.compose.project"}}',
        `${project}-${service}-1`]), project);
    }
    assert.equal(await sql("select enabled from private.identity_settings"), identity ? "t" : "f");
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
        VITE_AUDIT_EVIDENCE_STORAGE_TRANSFORMS: String(native),
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
      select '${actor.id}',id,${actor === administrator ? "'global',null" : `'unit','${unit}'`}
      from core.roles where key='${actor === manager ? "quality" : actor === viewer ? "quality_viewer" : actor === administrator ? "platform_administrator" : "quality_executor"}';
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
    await page.locator(".ap-fields dd").filter({ hasText: responsible.name }).waitFor();
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
    await page.locator(".ap-fields dd").filter({ hasText: responsible.name }).waitFor();
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

  const width = 1600, height = 1200;
  const pixels = native ? randomBytes(width * height * 3) : null;
  const picture = async (name, format) => ({
    name,
    mime: `image/${format}`,
    bytes: await sharp(pixels, { raw: { width, height, channels: 3 } }).toFormat(format).toBuffer(),
  });
  const uploadPlanImage = async (actor, planId, kind, img) => {
    const [row] = await ap(actor, "begin_evidence_upload", {
      p_plan: planId, p_kind: kind, p_original_name: img.name, p_content_type: img.mime, p_size: img.bytes.length,
    });
    await expectStatus(render(actor, bucket, row.object_key), ...denied);
    await expectStatus(request(`/storage/v1/object/${bucket}/${row.object_key}`, {
      actor, method: "POST", bytes: img.bytes, mime: img.mime,
    }), 200);
    await expectStatus(render(actor, bucket, row.object_key), ...denied);
    await ap(actor, "confirm_evidence_upload", { p_evidence: row.evidence_id });
    return { ...img, key: row.object_key, id: row.evidence_id };
  };

  let executionImage;
  if (native) {
    phase = "AP-03: miniatura de execução, falha, cache e remoção";
    executionImage = await uploadPlanImage(executor, plan, "execution", await picture("Execução sintética.jpg", "jpeg"));
    const removed = await uploadPlanImage(executor, plan, "execution", { ...executionImage, name: "Remover foto.jpg" });
    const transformRoute = `**/render/image/authenticated/${bucket}/${executionImage.key}?*`;
    const block = route => route.fulfill({ status: 503, body: "fixture" });
    let originalGets = 0;
    mobile.on("request", req => {
      if (req.method() === "GET" && req.url().includes(`/object/authenticated/${bucket}/${executionImage.key}`)) originalGets++;
    });
    await mobile.route(transformRoute, block);
    await mobile.reload();
    const imageRow = mobile.locator(".file-item").filter({ hasText: executionImage.name });
    await imageRow.scrollIntoViewIfNeeded();
    await imageRow.getByText("Miniatura indisponível.").waitFor();
    assert.equal(originalGets, 0, "Falha da miniatura não transfere o original grande");
    await mobile.unroute(transformRoute, block);
    await imageRow.getByRole("button", { name: "Tentar miniatura novamente" }).click();
    await preview(mobile, executionImage);
    assert.equal(originalGets, 1);
    const attachment = mobile.waitForEvent("download");
    await imageRow.getByRole("button", { name: `Baixar ${executionImage.name}`, exact: true }).click();
    const downloadedImage = await attachment;
    assert.equal(downloadedImage.suggestedFilename(), executionImage.name);
    assert.deepEqual(readFileSync(await downloadedImage.path()), executionImage.bytes);
    const removeRow = mobile.locator(".file-item").filter({ hasText: removed.name });
    await removeRow.scrollIntoViewIfNeeded();
    await removeRow.getByRole("button", { name: /^Ampliar/ }).waitFor();
    await removeRow.getByRole("button", { name: "Remover Remover foto.jpg" }).click();
    await mobile.getByRole("dialog", { name: "Remover evidência" }).getByRole("button", { name: "Confirmar" }).click();
    await removeRow.waitFor({ state: "detached" });
    await expectStatus(render(executor, bucket, removed.key), ...denied);
    await expectStatus(object(executor, bucket, removed.key), ...denied);

    await measure(executor, bucket, executionImage, "plano_execucao_jpg");
    for (const actor of [manager, viewer, administrator]) await expectStatus(render(actor, bucket, executionImage.key), 200);
    await expectStatus(render(other, bucket, executionImage.key), ...denied);
    await expectStatus(render(null, bucket, executionImage.key), ...denied);
    for (const options of [{}, { transform: { width: 480, height: 480 } }])
      await expectStatus(signature(executor, bucket, executionImage.key, options), ...denied);
  }

  phase = "grants, download autenticado e reatribuição";
  const file = (await ap(manager, "plan_evidence", { p_plan: plan })).find(e => e.content_type === "application/pdf");
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
  if (native) {
    await expectStatus(render(executor, bucket, executionImage.key), ...denied);
    await expectStatus(render(other, bucket, executionImage.key), 200);
    await expectStatus(render(other, bucket, objectKey), ...denied);
  }
  await expectStatus(request(`/storage/v1/object/${bucket}/${reserved.object_key}`, {
    actor: executor, method: "POST", bytes: pdf,
  }), 400, 401, 403, 404);
  await expectStatus(rpc(other, "remove_evidence", { p_evidence: file.id }), 403);
  await expectStatus(download(other), 200);
  await sql(`update core.user_role_assignments set active=false where user_id='${other.id}'`);
  assert.equal(await get(other), undefined);
  await expectStatus(download(other), 400, 401, 403, 404);
  if (native) await expectStatus(render(other, bucket, executionImage.key), ...denied);
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
  const verificationImage = native
    ? await uploadPlanImage(manager, plan, "verification", await picture("Verificação sintética.png", "png")) : null;
  if (native) {
    phase = "AP-03: verificação atual em Chromium desktop";
    await desktop.reload();
    await preview(desktop, verificationImage);
    await measure(viewer, bucket, verificationImage, "plano_verificacao_png");
  }
  await ap(manager, "verify_plan", {
    p_id: plan, p_version: await version(), p_effectiveness: "effective", p_verified_on: new Date().toISOString().slice(0, 10),
    p_notes: "Verificação AP-02", p_expected_evidence_ids: [file.id, ...native ? [executionImage.id, verificationImage.id] : []],
  });
  assert.equal((await get(manager)).effectiveness, "effective");
  if (native) {
    phase = "AP-03: rodada anterior e Quality Viewer";
    await ap(manager, "verify_plan", {
      p_id: plan, p_version: await version(), p_effectiveness: "effective", p_verified_on: new Date().toISOString().slice(0, 10),
      p_notes: "Nova rodada", p_expected_evidence_ids: [file.id, executionImage.id],
    });
    const viewerPage = await login(browser, viewer, { width: 1280, height: 900 });
    await viewerPage.goto(`${origin}/action-plans/${plan}`);
    const history = viewerPage.getByRole("heading", { name: "Verificação nº 1", exact: true }).locator("..");
    assert.equal(await viewerPage.getByRole("button", { name: /^Remover/ }).count(), 0);
    await history.getByRole("button", { name: `Baixar ${verificationImage.name}` }).waitFor();
    await preview(viewerPage, verificationImage);
    await viewerPage.close();
  }
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
    let photo;
    if (native) {
      const img = await picture("Origem sintética.jpg", "jpeg");
      const [row] = await auditCall(manager, "begin_checklist_evidence_upload", {
        p_inspection: id, p_item_key: "item-001", p_original_name: img.name, p_content_type: img.mime, p_size: img.bytes.length,
      });
      await expectStatus(request(`/storage/v1/object/${auditBucket}/${row.object_key}`, {
        actor: manager, method: "POST", bytes: img.bytes, mime: img.mime,
      }), 200);
      await auditCall(manager, "confirm_checklist_evidence_upload", { p_evidence: row.evidence_id });
      photo = { ...img, key: row.object_key };
    }
    return { id, source: source.id, observation, key: file.object_key, photo };
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
  const catalog = (actor) => auditRows(actor, "checklist_items", "key=eq.item-001&select=key");
  assert.deepEqual(await catalog(executor), [{ key: "item-001" }]);
  assert.deepEqual(await answersOf(executor, unrelated.id), []);
  const metadataOf = (actor, id) => auditCall(actor, "checklist_evidence", { p_inspection: id });
  assert.equal((await metadataOf(executor, linked.id)).length, native ? 2 : 1);
  assert.deepEqual(await metadataOf(executor, unrelated.id), []);
  const original = (actor, key) => request(`/storage/v1/object/authenticated/audit-checklist-evidence/${key}`, { actor });
  assert.deepEqual(Buffer.from(await (await expectStatus(original(executor, linked.key), 200)).arrayBuffer()), pdf);
  await expectStatus(original(executor, unrelated.key), 400, 401, 403, 404);
  if (native) {
    await measure(executor, auditBucket, linked.photo, "auditoria_vinculada_jpg");
    for (const actor of [manager, viewer, administrator]) await expectStatus(render(actor, auditBucket, linked.photo.key), 200);
    await expectStatus(render(executor, auditBucket, linked.key), ...denied);
    await expectStatus(render(executor, auditBucket, unrelated.photo.key), ...denied);
    await expectStatus(object(executor, auditBucket, unrelated.photo.key), ...denied);
    await expectStatus(render(null, auditBucket, linked.photo.key), ...denied);
    await expectStatus(signature(executor, auditBucket, linked.photo.key, { transform: { width: 480, height: 480 } }), ...denied);
    const viewerGrant = randomUUID();
    await sql(`insert into core.user_role_assignments(id,user_id,role_id,scope_type,unit_id)
      select '${viewerGrant}','${executor.id}',id,'unit','${unit}' from core.roles where key='quality_viewer'`);
    await expectStatus(render(executor, auditBucket, unrelated.photo.key), 200);
    await expectStatus(render(executor, bucket, executionImage.key), 200);
    await sql(`delete from core.user_role_assignments where id='${viewerGrant}'`);
    await expectStatus(render(executor, auditBucket, unrelated.photo.key), ...denied);
    await expectStatus(render(executor, bucket, executionImage.key), ...denied);
  }
  await expectStatus(request(`/storage/v1/object/sign/audit-checklist-evidence/${linked.key}`, {
    actor: executor, method: "POST", payload: { expiresIn: 60 },
  }), 400, 401, 403, 404);
  await expectStatus(rpc(executor, "inspection_export", { p_inspection: linked.id }, "audit"), 403);
  await expectStatus(rpc(executor, "unit_history_export", { p_unit: unit }, "audit"), 403);
  await expectStatus(request(`/rest/v1/inspection_answers?inspection_id=eq.${linked.id}&item_key=eq.item-001`, {
    actor: executor, method: "PATCH", schema: "audit", payload: { observation: "Alteração indevida" },
  }), 204);
  assert.deepEqual(await answersOf(manager, linked.id), [{ response: "AP", observation: linked.observation }]);

  phase = "link de origem e visão geral";
  await mobile.goto(`${origin}/action-plans/${linked.source}`);
  await mobile.getByRole("link", { name: "Abrir auditoria", exact: true }).click();
  await mobile.locator(".audit-attention-obs").filter({ hasText: linked.observation }).waitFor();
  await checkWidth(mobile);
  phase = "download da evidência de origem";
  const auditDownload = mobile.waitForEvent("download");
  await mobile.getByRole("button", { name: /^Baixar .*\.pdf$/i }).click();
  assert.deepEqual(readFileSync(await (await auditDownload).path()), pdf);
  phase = "checklist de origem em leitura";
  await mobile.getByRole("link", { name: "Abrir checklist" }).click();
  await mobile.locator(".audit-observation-text").filter({ hasText: linked.observation }).waitFor();
  assert.equal(await mobile.locator("input[type=file], .audit-observation textarea").count(), 0);
  if (native) {
    phase = "AP-03: auditoria vinculada mobile e regressão de Auditorias desktop";
    const toggle = page => page.locator('li.audit-item:has([aria-label="Evidências do critério 1"]) .audit-evidence-toggle');
    const photoName = page => page.getByText(/^Evidência .*\.jpg$/i).textContent();
    await toggle(mobile).click();
    await preview(mobile, linked.photo, await photoName(mobile));
    await desktop.goto(`${origin}/audit/inspections/${linked.id}/checklist`);
    await toggle(desktop).click();
    await preview(desktop, linked.photo, await photoName(desktop));
  }
  phase = "rotas diretas negadas";
  await mobile.goto(`${origin}/audit/inspections/${unrelated.id}`);
  await mobile.getByText("Auditoria indisponível", { exact: true }).waitFor();
  await mobile.goto(`${origin}/action-plans/${unrelated.source}`);
  await mobile.getByText("Plano de ação indisponível", { exact: true }).waitFor();
  await mobile.goto(`${origin}/audit`);
  await mobile.getByText("Acesso não autorizado", { exact: true }).waitFor();

  phase = "perda do vínculo de origem";
  await sql(`update core.user_role_assignments set active=false where user_id='${executor.id}'`);
  assert.deepEqual(await answersOf(executor, linked.id), []);
  assert.deepEqual(await catalog(executor), []);
  await expectStatus(original(executor, linked.key), 400, 401, 403, 404);
  if (native) await expectStatus(render(executor, auditBucket, linked.photo.key), ...denied);
  await sql(`update core.user_role_assignments set active=true where user_id='${executor.id}'`);
  const [{ plan: source }] = await ap(manager, "plan_summaries", { p_plan: linked.source });
  await ap(manager, "update_plan", { ...planning(other.id, source.version), p_id: source.id });
  assert.deepEqual(await answersOf(executor, linked.id), []);
  assert.equal((await answersOf(other, linked.id)).length, 1);
  if (native) {
    await expectStatus(render(executor, auditBucket, linked.photo.key), ...denied);
    await expectStatus(render(other, auditBucket, linked.photo.key), 200);
  }
  const impact = await ap(manager, "plan_delete_impact", { p_plan: source.id });
  await ap(manager, "begin_plan_delete", { p_plan: source.id, p_snapshot: impact.snapshot, p_confirmation: "excluir plano de ação" });
  assert.deepEqual(await metadataOf(other, linked.id), []);
  await expectStatus(original(other, linked.key), 400, 401, 403, 404);
  if (native) await expectStatus(render(other, auditBucket, linked.photo.key), ...denied);
  await ap(manager, "finish_plan_delete", { p_plan: source.id });
  assert.deepEqual(await answersOf(other, linked.id), []);
  assert.equal((await answersOf(manager, linked.id)).length, 1);
  if (native) {
    phase = "AP-03: exclusão de Auditoria";
    const deleteAudit = await auditCall(manager, "inspection_delete_impact", { p_inspection: linked.id });
    await auditCall(manager, "begin_inspection_delete", {
      p_inspection: linked.id, p_snapshot: deleteAudit.snapshot, p_confirmation: "excluir auditoria",
    });
    await expectStatus(render(manager, auditBucket, linked.photo.key), ...denied);
    const purge = (target, keys) => expectStatus(request(`/storage/v1/object/${target}`, {
      actor: manager, method: "DELETE", payload: { prefixes: keys },
    }), 200);
    await purge(auditBucket, [linked.key, linked.photo.key]);
    await auditCall(manager, "finish_inspection_delete", { p_inspection: linked.id });
    await expectStatus(render(administrator, auditBucket, linked.photo.key), ...denied);

    phase = "AP-03: exclusão de Plano";
    const [{ plan: beforeDelete }] = await ap(manager, "plan_summaries", { p_plan: mobilePlan });
    await ap(manager, "set_plan_status", { p_id: mobilePlan, p_version: beforeDelete.version, p_status: "in_progress" });
    const image = await uploadPlanImage(manager, mobilePlan, "execution", executionImage);
    await expectStatus(render(viewer, bucket, image.key), 200);
    const deletePlan = await ap(manager, "plan_delete_impact", { p_plan: mobilePlan });
    await ap(manager, "begin_plan_delete", {
      p_plan: mobilePlan, p_snapshot: deletePlan.snapshot, p_confirmation: "excluir plano de ação",
    });
    await expectStatus(render(viewer, bucket, image.key), ...denied);
    await expectStatus(object(viewer, bucket, image.key), ...denied);
    await purge(bucket, [image.key]);
    await ap(manager, "finish_plan_delete", { p_plan: mobilePlan });
    await expectStatus(render(administrator, bucket, image.key), ...denied);
    console.log(`PASS AP-03 (${identity ? "Identity" : "base"}): ${JSON.stringify(traffic)} bytes de corpo HTTP.`);
  }
  console.log(`PASS AP-02 (${identity ? "Identity" : "base"}): Chromium desktop/375px, REST, RLS, Storage, relato, reatribuição, revogação, conclusão, verificação e auditoria vinculada.`);
} catch (error) {
  console.error(`FAIL AP-02 (${phase}) | ${error.message.split("\n")[0]}`);
  const location = error.stack?.match(/action-plans-delegation\.mjs:\d+:\d+/g)?.slice(0, 4).join("\n");
  if (location) console.error(location);
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
        delete from audit_private.deletion_objects where inspection_id in (select inspection_id from audit_private.inspection_deletions where unit_id='${unit}');
        delete from audit_private.deletion_namespaces where inspection_id in (select inspection_id from audit_private.inspection_deletions where unit_id='${unit}');
        delete from audit_private.inspection_deletions where unit_id='${unit}';
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
