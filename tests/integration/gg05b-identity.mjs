import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import sharp from "sharp";

const project = process.argv[2];
const authorized = project === "gaucha-gestao-local"
  || (process.env.GITHUB_ACTIONS === "true" && /^gg-identity-ci-\d+-\d+$/.test(project ?? ""));
assert.ok(authorized);
for (const service of ["db", "identity", "kong"]) {
  const label = execFileSync("docker", ["inspect", "--format",
    '{{index .Config.Labels "com.docker.compose.project"}}', `${project}-${service}-1`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  assert.equal(label, project);
}
const origin = "http://127.0.0.1:5173";
const base = "http://127.0.0.1:54321";
const tag = randomUUID().slice(0, 8);
const uuid = () => randomUUID();
const logStart = new Date().toISOString();
const secrets = [];
const password = (length = 41) => {
  const value = `Gg!9-${uuid()}`.slice(0, length);
  secrets.push(value);
  return value;
};
function assertTemporaryPassword(value) {
  assert.ok(/^[A-HJ-NP-Zabcdefghijkmnpqrstuvwxyz2-9!@#$%&*+?]{22}$/.test(value)
    && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[2-9]/.test(value)
    && /[!@#$%&*+?]/.test(value), "Formato da senha temporária");
}
const email = (name) => `gg05b-${name}-${tag}@example.test`;
const actors = [uuid(), uuid()];
const units = [uuid(), uuid()];
const identities = [...actors];
const assets = [];
let requesterPassword;
const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
const feedbackObject = (key) => `/storage/v1/object/feedback-attachments/${key}`;
const feedbackInput = (extension = null) => ({
  p_id: uuid(), p_kind: "problem", p_module: "home", p_origin: "home",
  p_description: "Relato exclusivamente sintético para a integração GG-11.",
  p_app_version: null, p_extension: extension,
});
const feedbackDenied = (name, token, json, statuses = [403]) =>
  responseOf(`/rest/v1/rpc/feedback_${name}`, { token, method: "POST", json }, statuses);
const feedback = async (name, token, json) => (await rest(`feedback_${name}`, token, json, "public")).json();
const feedbackFilters = { p_kind: null, p_module: null, p_from: null, p_until: null, p_before: null, p_before_id: null };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function runDocker(args, input) {
  return execFileSync("docker", args, { input, stdio: ["pipe", "pipe", "ignore"], encoding: "utf8" });
}
function sql(query) {
  return runDocker(["exec", "-i", `${project}-db-1`, "psql", "-XqAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], query).trim();
}
function internal(service, path, method, payload) {
  const output = runDocker(["exec", "-i", `${project}-identity-1`, "node", "--input-type=module", "-e", `
    import {readFileSync} from "node:fs";
    const {service,path,method,payload}=JSON.parse(readFileSync(0,"utf8"));
    const upstream=service==="auth"?"http://auth:9999":"http://storage:5000";
    const response=await fetch(upstream+path,{method,headers:{
      Authorization:"Bearer "+process.env.GG_IDENTITY_AUTH_ADMIN_KEY,"Content-Type":"application/json",
    },...(payload?{body:JSON.stringify(payload)}:{})});
    process.stdout.write(JSON.stringify({status:response.status,data:await response.json().catch(()=>null)}));
  `], JSON.stringify({ service, path, method, payload }));
  return JSON.parse(output);
}

async function http(path, { token, method = "GET", json, body, schema = "public", contentType, upsert } = {}) {
  return fetch(base + path, {
    method, headers: {
      origin,
      "Accept-Profile": schema,
      "Content-Profile": schema,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(json !== undefined || contentType ? { "Content-Type": contentType ?? "application/json" } : {}),
      ...(upsert !== undefined ? { "x-upsert": String(upsert) } : {}),
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : body ? { body } : {}),
    redirect: "error",
  });
}
async function responseOf(path, options, statuses) {
  const response = await http(path, options);
  if (!statuses.includes(response.status)) {
    const surface = path.split("?")[0].split("/").slice(1, path.startsWith("/rest/v1/rpc/") ? 5 : 4).join("/");
    throw Object.assign(new Error("status inesperado"), {
      actualStatus: response.status, expectedStatuses: statuses, surface,
    });
  }
  return response;
}
const rest = (name, token, json, schema = "core") => responseOf(`/rest/v1/rpc/${name}`, { token, method: "POST", json, schema }, [200, 204]);
const identity = (path, token, json, statuses = [200]) =>
  responseOf(`/auth/v1/identity${path}`, { token, json, method: json ? "POST" : "GET" }, statuses);
const grant = (type, body, statuses = [200]) =>
  responseOf(`/auth/v1/token?grant_type=${type}`, { method: "POST", json: body }, statuses);
const login = async (name, secret) => (await grant("password", { email: email(name), password: secret })).json();
const deniedLogin = (name, secret) => grant("password", { email: email(name), password: secret }, [400]);

async function command(path, token, attributes, status) {
  const response = await identity(path, token, { ...attributes, operation: uuid() }, [status]);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const result = await response.json();
  if (result.temporaryPassword) secrets.push(result.temporaryPassword);
  return result;
}
const change = (token, temporary, definitive) => command("/me/password", token, {
  password: definitive, confirmation: definitive, currentPassword: temporary,
}, 200);
const roleId = () => sql("select id from core.roles where key='quality_viewer'");
const version = (id) => Number(sql(`select version from core.profiles where id='${id}'`));
const grantQuality = (id) => sql(`insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id)
  select '${id}',id,'unit','${units[0]}' from core.roles where key='quality_viewer'`);

async function assertBarriers(token, path) {
  await responseOf("/rest/v1/profiles?select=id", { token, schema: "core" }, [403]);
  await responseOf("/rest/v1/rpc/my_access", { token, schema: "core", method: "POST", json: {} }, [403]);
  await responseOf("/rest/v1/rpc/announcements_published", { token, method: "POST", json: {} }, [403]);
  await responseOf("/graphql/v1", { token, schema: "graphql_public", method: "POST", json: { query: "{ __typename }" } }, [403]);
  await responseOf(path, { token }, [401, 403]);
}

async function assertFeedbackBarrier(token, key, png) {
  const input = feedbackInput("png");
  await feedbackDenied("prepare", token, input);
  await feedbackDenied("list", token, feedbackFilters);
  await feedbackDenied("detail", token, { p_id: key.slice(0, -4) });
  const path = feedbackObject(key);
  const options = { token, method: "POST", body: png, contentType: "image/png" };
  await responseOf(path, options, [401, 403]);
  await responseOf(path, { token }, [401, 403]);
}

async function verifyFeedbackStorage({ admin, reader, readerId, other, png, jpg }) {
  const noAttachment = feedbackInput();
  assert.equal((await feedback("prepare", reader, noAttachment)).attachmentKey, null);
  const textReceipt = await feedback("receive", reader, { p_id: noAttachment.p_id });
  assert.equal(textReceipt.id, noAttachment.p_id);
  assert.ok(textReceipt.receivedAt);

  const denied = [400, 403, 404];
  const upload = (path, token, bytes, contentType, statuses, upsert = false) =>
    responseOf(path, { token, method: "POST", body: bytes, contentType, upsert }, statuses);
  const reports = [noAttachment.p_id];
  for (const [extension, mime, bytes] of [["png", "image/png", png], ["jpg", "image/jpeg", jpg]]) {
    const input = feedbackInput(extension);
    const id = { p_id: input.p_id };
    reports.push(input.p_id);
    const key = `${input.p_id}.${extension}`;
    const path = feedbackObject(key);
    const reservation = { id: input.p_id, receivedAt: null, attachmentKey: key };
    assert.deepEqual(await feedback("prepare", reader, input), reservation);
    assert.deepEqual(await feedback("prepare", reader, input), reservation);
    await feedbackDenied("prepare", undefined, input, [401]);
    await feedbackDenied("prepare", other, input);
    await feedbackDenied("receive", other, id);
    assert.equal((await (await feedbackDenied("receive", reader, id, [500])).json()).code, "P0002");
    await upload(path, undefined, bytes, mime, [401]);
    await responseOf(path, {}, [401]);
    await upload(path, other, bytes, mime, denied);
    await upload(feedbackObject(`${uuid()}.${extension}`), reader, bytes, mime, denied);
    await upload(feedbackObject(`${input.p_id}.jpeg`), reader, bytes, mime, [404]);
    if (extension === "png") {
      await upload(path, reader, bytes, "text/html", [400, 415]);
      await upload(path, reader, Buffer.alloc(5 * 1024 * 1024 + 1), mime, [400, 413]);
    }
    await upload(path, reader, bytes, mime, [200]);
    assert.equal(sql(`select owner_id from storage.objects where bucket_id='feedback-attachments' and name='${key}'`), readerId);
    assert.equal((await (await feedbackDenied("detail", admin, id, [500])).json()).code, "P0002");
    await responseOf(path, { token: admin }, denied);

    const receipt = await feedback("receive", reader, id);
    assert.equal(receipt.id, input.p_id);
    assert.ok(receipt.receivedAt);
    assert.deepEqual(await feedback("receive", reader, id), receipt);
    assert.equal((await feedback("prepare", reader, input)).receivedAt, receipt.receivedAt);
    assert.equal((await feedback("detail", admin, id)).attachment_key, key);
    for (const token of [reader, other]) {
      await feedbackDenied("detail", token, id);
      await feedbackDenied("list", token, feedbackFilters);
      await responseOf(path, { token }, denied);
    }
    const downloaded = await responseOf(path, { token: admin }, [200]);
    const received = Buffer.from(await downloaded.arrayBuffer());
    assert.equal(downloaded.headers.get("cache-control"), "private, no-store");
    assert.equal(received.length, bytes.length);
    assert.equal(sha256(received), sha256(bytes));
    await upload(path, reader, bytes, mime, denied);
    await upload(path, reader, bytes, mime, [404], true);
  }
  const list = await feedback("list", admin, feedbackFilters);
  assert.ok(reports.every((id) => list.some((row) => row.id === id)));
  for (const id of reports) {
    assert.equal(sql(`select count(*) from core.system_audit_log where module='feedback' and action='report.receive'
      and entity_id='${id}' and actor_user_id='${readerId}'`), "1");
  }

  // Metadados incompatíveis podem chegar ao bucket. O SQL precisa negar o recibo.
  const mismatch = feedbackInput("png");
  const reserved = await feedback("prepare", reader, mismatch);
  await upload(feedbackObject(reserved.attachmentKey), reader, jpg, "image/jpeg", [200]);
  assert.equal((await (await feedbackDenied("receive", reader, { p_id: mismatch.p_id }, [500])).json()).code, "P0002");

  const key = `${reports[1]}.png`;
  for (const [method, path] of [
    ["PUT", `object/feedback-attachments/${key}`],
    ["DELETE", "object/feedback-attachments"],
    ["POST", "object/list/feedback-attachments"],
    ["GET", `object/public/feedback-attachments/${key}`],
    ["POST", `object/sign/feedback-attachments/${key}`],
    ["GET", `object/unknown-bucket/${key}`],
  ]) await responseOf(`/storage/v1/${path}`, { token: admin, method }, [404]);

  const legacy = internal("storage", `/object/sign/feedback-attachments/${key}`, "POST", { expiresIn: 60 });
  assert.equal(legacy.status, 200);
  const signed = new URL(legacy.data.signedURL, base);
  await responseOf(`/storage/v1${signed.pathname}${signed.search}`, { token: admin }, [404]);
  return { id: reports[1], key };
}

async function verifyFeedbackBrowser(adminSecret, readerSecret, png) {
  const browser = await chromium.launch();
  try {
    const signIn = async (name, secret, width) => {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      page.setDefaultTimeout(10_000);
      await page.goto(origin);
      await page.locator('input[name="email"]').fill(email(name));
      await page.locator('input[name="password"]').fill(secret);
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      return page;
    };
    const readerPage = await signIn("reader", readerSecret, 320);
    await readerPage.getByRole("button", { name: /^Relatar problema/ }).click();
    const form = readerPage.getByRole("dialog", { name: "Relatar problema ou sugerir melhoria" });
    const description = "Relato sintético GG-11 enviado e baixado pelo app no notebook.";
    await form.getByLabel("Descrição detalhada").fill(description);
    const attachment = form.getByLabel("Anexo opcional");
    await attachment.setInputFiles({ name: "invalido.png", mimeType: "image/png", buffer: Buffer.from("inválido") });
    await form.getByRole("button", { name: "Enviar relato" }).click();
    await form.getByText("Escolha uma imagem PNG ou JPEG válida.").waitFor();
    await attachment.setInputFiles({ name: "sintetico.png", mimeType: "image/png", buffer: png });
    await form.getByRole("button", { name: "Enviar relato" }).click();
    await form.getByText("Relato recebido.", { exact: true }).waitFor();
    const id = await form.locator("strong").textContent();
    assert.match(id, /^[a-f0-9-]{36}$/);
    await form.getByRole("button", { name: "Concluir" }).click();
    await readerPage.goto(`${origin}/admin/feedback`);
    await readerPage.getByText(/Acesso não autorizado/).waitFor();

    const adminPage = await signIn("operador", adminSecret, 1280);
    const sidebar = adminPage.locator(".sidebar");
    await sidebar.getByRole("button", { name: "Administração", exact: true }).click();
    await sidebar.getByRole("link", { name: "Relatos e sugestões", exact: true }).click();
    await adminPage.getByRole("button", { name: `Ler relato ${id}`, exact: true }).click();
    const detail = adminPage.getByRole("dialog", { name: "Detalhes do relato" });
    await detail.getByText(description, { exact: true }).waitFor();
    const [download] = await Promise.all([
      adminPage.waitForEvent("download"),
      detail.getByRole("button", { name: "Baixar anexo" }).click(),
    ]);
    assert.equal(download.suggestedFilename(), "anexo-relato.png");
    const bytes = await readFile(await download.path());
    assert.equal(bytes.length, png.length);
    assert.equal(sha256(bytes), sha256(png));
    console.log(`PASS GG-11 Chromium/Vite: envio 320 px, recibo, negativa administrativa, descarga desktop. PNG: ${bytes.length} bytes, SHA-256 ${sha256(bytes)}.`);
  } finally {
    await browser.close();
  }
}

let phase = "configuração";
const browserResponses = [];
let browserPage;
const browserOnly = process.env.GG_IDENTITY_TEST_UI === "only";
try {
  assert.equal(sql("select enabled from private.identity_settings"), "t");
  const adminSecret = password();
  const protectedSecret = password();
  for (const [index, name] of ["operador", "protegido"].entries()) {
    const response = internal("auth", "/admin/users", "POST", {
      id: actors[index], email: email(name), password: index === 0 ? adminSecret : protectedSecret, email_confirm: true,
    });
    assert.ok([200, 201].includes(response.status));
    assert.ok(response.data.id === actors[index]);
  }
  sql(`begin;
    insert into private.identity_credentials(user_id,state,managed) values
      ('${actors[0]}','active',false),('${actors[1]}','active',false);
    insert into core.user_role_assignments(user_id,role_id,scope_type)
      select p.id,r.id,'global' from core.profiles p cross join core.roles r
      where p.id in ('${actors[0]}','${actors[1]}') and r.key='platform_administrator';
    insert into private.identity_operators(user_id,provision,reset_password) values ('${actors[0]}',true,true);
    insert into core.units(id,code,name) values
      ('${units[0]}','G05A-${tag}','Fixture GG05B A'),('${units[1]}','G05B-${tag}','Fixture GG05B B');
    commit;`);

  if (!browserOnly) {
    phase = "ingresso e sessão administrativa";
    let admin = (await login("operador", adminSecret)).access_token;
    secrets.push(admin);
    const status = await identity("/me", admin);
    assert.deepEqual(await status.json(), { passwordChangeRequired: false, provision: true, resetPassword: true });
    for (const id of actors) {
      await command(`/users/${id}/password-reset`, admin, { version: version(id), verified: true },
        id === actors[0] ? 403 : 409);
    }
    for (const path of ["/auth/v1/admin/users", "/auth/v1/user", "/auth/v1/recover", "/auth/v1/signup"]) {
      await responseOf(path, { token: admin, method: "POST", json: {} }, [404]);
    }

    phase = "objetos reais e escopo";
    for (const unit of units) {
      const started = (await (await rest("begin_unit_cover_upload", admin, {
        p_unit: unit, p_mime_type: "image/jpeg", p_byte_size: jpeg.length, p_width: 1, p_height: 1,
      })).json())[0];
      assets.push(started);
      await responseOf(`/storage/v1/object/unit-covers/${started.object_key}`, {
        token: admin, method: "POST", body: jpeg, contentType: "image/jpeg",
      }, [200]);
      await rest("confirm_unit_cover_upload", admin, {
        p_unit: unit, p_asset: started.asset_id, p_position_x: 50, p_position_y: 50,
      });
    }
    const file = (index) => `/storage/v1/object/authenticated/unit-covers/${assets[index].object_key}`;
    const legacy = internal("storage", `/object/sign/unit-covers/${assets[0].object_key}`, "POST", { expiresIn: 300 });
    assert.equal(legacy.status, 200);
    const signed = new URL(legacy.data.signedURL, base);
    const legacyPath = `/storage/v1${signed.pathname}${signed.search}`;
    await responseOf(legacyPath, {}, [404]);
    await responseOf(legacyPath, { token: admin }, [404]);
    for (const path of [
      "object/abc-source-files",
      "object/action-plan-evidence",
      "render/image/authenticated/audit-checklist-evidence",
      "render/image/authenticated/audit-evidence-thumbnails",
      "object/room-covers",
    ]) await responseOf(`/storage/v1/${path}/fixture`, {}, [401]);

    phase = "cadastro e primeiro acesso";
    const employee = await command("/users", admin, {
      name: "Funcionário sintético GG05B", email: email("employee"),
      roleId: roleId(), unitId: units[0], sectorId: null, verified: true,
    }, 201);
    assert.match(employee.userId, /^[a-f0-9-]{36}$/);
    identities.push(employee.userId);
    assertTemporaryPassword(employee.temporaryPassword);
    const pending = await login("employee", employee.temporaryPassword);
    assert.equal((await (await identity("/me", pending.access_token)).json()).passwordChangeRequired, true);
    await assertBarriers(pending.access_token, file(0));
    const pendingRefresh = await (await grant("refresh_token", { refresh_token: pending.refresh_token })).json();
    await assertBarriers(pendingRefresh.access_token, file(0));

    const short = password(7);
    const tooShort = await command("/me/password", pendingRefresh.access_token, {
      password: short, confirmation: short, currentPassword: employee.temporaryPassword,
    }, 400);
    assert.equal(tooShort.code, "invalid_password");
    const definitive = password(8);
    const wrong = await command("/me/password", pendingRefresh.access_token, {
      password: definitive, confirmation: definitive, currentPassword: password(),
    }, 422);
    assert.equal(wrong.code, "password_rejected");
    assert.equal((await change(pendingRefresh.access_token, employee.temporaryPassword, definitive)).loginRequired, true);
    await assertBarriers(pendingRefresh.access_token, file(0));
    await deniedLogin("employee", employee.temporaryPassword);
    const admitted = await login("employee", definitive);
    const first = admitted.access_token;
    secrets.push(first, admitted.refresh_token);
    const grants = await (await rest("my_access", first, {})).json();
    assert.ok(grants.length > 0 && grants.every((entry) => entry.unit_id === units[0]));
    const bytes = await responseOf(file(0), { token: first }, [200]);
    assert.deepEqual(Buffer.from(await bytes.arrayBuffer()), jpeg);
    await responseOf(file(1), { token: first }, [400, 403, 404]);
    await identity("/users", first, { operation: uuid() }, [403]);

    phase = "comunicados sem papel";
    const reader = await command("/users", admin, {
      name: "Leitor sintético GG05B", email: email("reader"), roleId: null, unitId: null, sectorId: null, verified: true,
    }, 201);
    assert.match(reader.userId, /^[a-f0-9-]{36}$/);
    identities.push(reader.userId);
    assertTemporaryPassword(reader.temporaryPassword);
    assert.ok(reader.temporaryPassword !== employee.temporaryPassword);
    const readerPending = await login("reader", reader.temporaryPassword);
    const readerDefinitive = password();
    await change(readerPending.access_token, reader.temporaryPassword, readerDefinitive);
    const readerAccess = (await login("reader", readerDefinitive)).access_token;
    assert.deepEqual(await (await rest("my_access", readerAccess, {})).json(), []);
    await rest("announcements_published", readerAccess, {}, "public");

    phase = "GG-11: reserva, recebimento e download";
    const image = sharp({ create: { width: 2, height: 2, channels: 3, background: "#496c42" } });
    const png = await image.clone().png().toBuffer();
    const jpg = await image.clone().jpeg().toBuffer();
    const report = await verifyFeedbackStorage({
      admin, reader: readerAccess, readerId: reader.userId, other: first, png, jpg,
    });
    phase = "GG-11: finalidade, admissão e revogação administrativa";
    await assertFeedbackBarrier(pending.access_token, report.key, png);
    const unadmitted = internal("auth", "/token?grant_type=password", "POST", {
      email: email("reader"), password: readerDefinitive,
    });
    assert.equal(unadmitted.status, 200);
    secrets.push(unadmitted.data.access_token, unadmitted.data.refresh_token);
    await assertFeedbackBarrier(unadmitted.data.access_token, report.key, png);
    const protectedToken = (await login("protegido", protectedSecret)).access_token;
    secrets.push(protectedToken);
    await responseOf(feedbackObject(report.key), { token: protectedToken }, [200]);
    sql(`update core.user_role_assignments set active=false where user_id='${actors[1]}'`);
    await feedbackDenied("detail", protectedToken, { p_id: report.id });
    await responseOf(feedbackObject(report.key), { token: protectedToken }, [400, 403, 404]);

    if (process.env.GG_IDENTITY_TEST_UI === "feedback") {
      phase = "GG-11: interface no Vite";
      await verifyFeedbackBrowser(adminSecret, readerDefinitive, png);
    }

    phase = "D5-C: cadastro global da secretaria e solicitante";
    assert.equal(await (await rest("room_booking_admin_context", admin, {}, "public")).json(), true);
    await rest("room_booking_requests", admin, { p_queue: true }, "public");
    for (const [key, alias, shouldManage] of [
      ["room_booking_manager", "secretary", true],
      ["room_booking_requester", "roomrequester", false],
    ]) {
      const roomRole = sql(`select id from core.roles where key='${key}'`);
      const registered = await command("/users", admin, {
        name: "Usuário sintético Room Booking",
        email: email(alias),
        roleId: roomRole, unitId: null, sectorId: null, verified: true,
      }, 201);
      identities.push(registered.userId);
      secrets.push(registered.temporaryPassword);
      assertTemporaryPassword(registered.temporaryPassword);
      const assignment = sql(`select concat_ws(':',a.scope_type,
          a.unit_id is null,a.sector_id is null,a.granted_by='${actors[0]}',
          exists(select 1 from core.system_audit_log l where l.actor_user_id='${actors[0]}'
            and l.entity_id=a.id::text and l.action='grant'))
        from core.user_role_assignments a
        where a.user_id='${registered.userId}' and a.role_id='${roomRole}' and a.active`);
      assert.equal(assignment, "global:t:t:t:t");
      const temporaryLogin = await login(alias, registered.temporaryPassword);
      secrets.push(temporaryLogin.access_token);
      await assertBarriers(temporaryLogin.access_token, "/storage/v1/object/authenticated/unit-covers/missing");
      const chosenPassword = password();
      await change(temporaryLogin.access_token, registered.temporaryPassword, chosenPassword);
      const roomToken = (await login(alias, chosenPassword)).access_token;
      secrets.push(roomToken);
      const access = await (await rest("my_access", roomToken, {})).json();
      assert.equal(access.some((entry) => entry.permission === "room_booking.manage"), shouldManage);
      assert.equal(await (await rest("room_booking_admin_context", roomToken, {}, "public")).json(), false);
      await rest("room_booking_requests", roomToken, { p_queue: false }, "public");
      for (const [name, json] of [
        ["room_booking_requests", { p_queue: true }],
        ["room_booking_history", {}],
        ["room_booking_direct_history", {}],
      ]) {
        await responseOf(`/rest/v1/rpc/${name}`, { token: roomToken, method: "POST", json },
          shouldManage ? [200] : [403]);
      }
      if (!shouldManage) requesterPassword = chosenPassword;
    }
    const forbiddenAdministrator = await command("/users", admin, {
      name: "Administrativo não permitido", email: email("forbiddenadmin"),
      roleId: sql("select id from core.roles where key='platform_administrator'"),
      unitId: null, sectorId: null, verified: true,
    }, 409);
    assert.equal(forbiddenAdministrator.code, "operation_conflict");
    assert.equal(sql(`select count(*) from auth.users where email='${email("forbiddenadmin")}'`), "0");

    phase = "reset e revogação";
    const reset = await command(`/users/${employee.userId}/password-reset`, admin, {
      version: version(employee.userId), verified: true,
    }, 200);
    assertTemporaryPassword(reset.temporaryPassword);
    assert.ok(reset.temporaryPassword !== employee.temporaryPassword);
    await assertBarriers(first, file(0));
    await grant("refresh_token", { refresh_token: admitted.refresh_token }, [400]);
    await deniedLogin("employee", definitive);
    const secondPending = await login("employee", reset.temporaryPassword);
    await assertBarriers(secondPending.access_token, file(0));
    const secondPassword = password();
    await change(secondPending.access_token, reset.temporaryPassword, secondPassword);
    const second = (await login("employee", secondPassword)).access_token;
    await responseOf(file(0), { token: second }, [200]);
    await assertBarriers(first, file(0));

    phase = "bloqueio, reativação e JWT anterior";
    for (const active of [false, true]) {
      await responseOf(`/rest/v1/profiles?id=eq.${employee.userId}&version=eq.${version(employee.userId)}`, {
        method: "PATCH", token: admin, schema: "core", json: { active },
      }, [204]);
      assert.equal(sql(`select active from core.profiles where id='${employee.userId}'`), active ? "t" : "f");
      await assertBarriers(second, file(0));
      await assertFeedbackBarrier(second, report.key, png);
    }
    grantQuality(employee.userId);
    await assertBarriers(first, file(0));
    await assertBarriers(second, file(0));
    const final = (await login("employee", secondPassword)).access_token;
    await responseOf(file(0), { token: final }, [200]);
    await rest("my_access", final, {});

    phase = "temporária invalida ao bloquear";
    admin = (await login("operador", adminSecret)).access_token;
    const unused = await command(`/users/${reader.userId}/password-reset`, admin, {
      version: version(reader.userId), verified: true,
    }, 200);
    for (const active of [false, true]) {
      await responseOf(`/rest/v1/profiles?id=eq.${reader.userId}&version=eq.${version(reader.userId)}`, {
        method: "PATCH", token: admin, schema: "core", json: { active },
      }, [204]);
    }
    await deniedLogin("reader", unused.temporaryPassword);
    const replacement = await command(`/users/${reader.userId}/password-reset`, admin, {
      version: version(reader.userId), verified: true,
    }, 200);
    const newPending = (await login("reader", replacement.temporaryPassword)).access_token;
    await assertBarriers(newPending, file(0));
    await assertFeedbackBarrier(newPending, report.key, png);
    console.log("PASS GG-11: RPCs e Storage reais, sem papel, sem/com PNG/JPEG, recibos, hash, auditoria e negativas de sessão, autoria e papel.");

    phase = "contrato SDK";
    const apiKey = process.env.GG_IDENTITY_TEST_ANON_KEY;
    if (apiKey) {
      const browserAuth = createClient(base, apiKey, { auth: { persistSession: false, autoRefreshToken: false } }).auth;
      assert.ok(!(await browserAuth.signInWithPassword({ email: email("employee"), password: secondPassword })).error);
      assert.ok(!(await browserAuth.refreshSession()).error);
      assert.ok(!(await browserAuth.signOut({ scope: "local" })).error);
    }
  }

  if (browserOnly || process.env.GG_IDENTITY_TEST_UI === "true") {
    phase = "interface administrativa e troca obrigatória";
    const browser = await chromium.launch();
    try {
      const observe = (page) => {
        page.setDefaultTimeout(10_000);
        page.on("response", async (response) => {
          const path = new URL(response.url()).pathname;
          if (!/^\/(auth|rest)\/v1\//.test(path)) return;
          let code = "";
          if (response.status() >= 400) {
            const body = await response.json().catch(() => undefined);
            if (typeof body?.code === "string" && /^[a-zA-Z0-9_]{1,36}$/.test(body.code)) code = ` ${body.code}`;
            if (body?.code === "42501" && typeof body.message === "string" &&
                /^(permission denied for (table|schema|function) [a-zA-Z0-9_]+|Sessão sem acesso aos módulos)$/.test(body.message)) {
              code += ` ${body.message}`;
            }
          }
          browserResponses.push(`${response.request().method()} ${path.split("/").slice(0, 5).join("/")}: ${response.status()}${code}`);
        });
        browserPage = page;
        return page;
      };
      const operatorPage = observe(await browser.newPage({ reducedMotion: "reduce" }));
      const signIn = async (page, name, secret) => {
        await page.locator('input[name="email"]').fill(email(name));
        await page.locator('input[name="password"]').fill(secret);
        await page.getByRole("button", { name: "Entrar", exact: true }).click();
      };
      phase = "interface: login e botão de cadastro";
      await operatorPage.goto(`${origin}/admin/users`);
      await signIn(operatorPage, "operador", adminSecret);
      await operatorPage.locator("header.page-title").getByRole("button", { name: "Novo usuário", exact: true }).click();
      phase = "interface: envio e temporária";
      const form = operatorPage.getByRole("dialog", { name: "Novo usuário" });
      await form.getByLabel("Nome completo").fill("Funcionário sintético pelo navegador");
      await form.getByLabel("E-mail individual").fill(email("browser"));
      const role = form.getByLabel("Papel institucional");
      assert.equal(await role.getByRole("option", { name: "Room Booking Requester", exact: true }).count(), 1);
      assert.equal(await role.getByRole("option", { name: "Platform Administrator", exact: true }).count(), 0);
      await role.selectOption({ label: "Room Booking Manager" });
      assert.equal(await form.getByLabel("Unidade", { exact: true }).count(), 0);
      assert.equal(await form.getByLabel("Setor", { exact: true }).count(), 0);
      await form.getByRole("checkbox").check();
      await form.getByRole("button", { name: "Salvar" }).click();
      const modal = operatorPage.getByRole("dialog", { name: "Senha temporária" });
      const temporary = await modal.getByRole("textbox").inputValue();
      secrets.push(temporary);
      assertTemporaryPassword(temporary);
      await modal.getByRole("button", { name: "Concluir" }).click();
      assert.equal(await operatorPage.getByRole("dialog", { name: "Senha temporária" }).count(), 0);

      phase = "interface: login temporário e recarga";
      const employeePage = observe(await browser.newPage({ reducedMotion: "reduce" }));
      await employeePage.goto(`${origin}/admin/users`);
      await signIn(employeePage, "browser", temporary);
      const heading = employeePage.getByRole("heading", { name: "Defina sua senha" });
      await heading.waitFor();
      await employeePage.reload();
      await heading.waitFor();
      const newPassword = employeePage.getByLabel("Nova senha", { exact: true });
      const confirmation = employeePage.getByLabel("Confirme a nova senha", { exact: true });
      assert.equal(await newPassword.getAttribute("minlength"), "8");
      assert.equal(await confirmation.getAttribute("minlength"), "8");
      const exit = employeePage.getByRole("button", { name: "Sair", exact: true });
      const submit = employeePage.getByRole("button", { name: "Alterar senha e sair" });
      for (const width of [1024, 320]) {
        await employeePage.setViewportSize({ width, height: 768 });
        const fields = await employeePage.locator('input[type="password"]').evaluateAll((inputs) =>
          inputs.map((input) => ({ x: input.getBoundingClientRect().x, width: input.getBoundingClientRect().width })),
        );
        assert.equal(fields.length, 3);
        assert.deepEqual(fields, [fields[0], fields[0], fields[0]]);
        const [left, right] = await Promise.all([exit.boundingBox(), submit.boundingBox()]);
        assert.ok(left && right && left.y === right.y && left.height === right.height
          && left.x === fields[0].x && right.x + right.width === fields[0].x + fields[0].width
          && left.x + left.width < right.x && right.x + right.width <= width);
      }
      phase = "interface: troca e novo login";
      const secret = password(8);
      await employeePage.locator('input[name="current_password"]').fill(temporary);
      await newPassword.pressSequentially(secret.slice(0, 7));
      assert.ok(await newPassword.evaluate((input) => input.validity.tooShort));
      await newPassword.fill(secret);
      await confirmation.fill(secret);
      await submit.click();
      await employeePage.getByRole("heading", { name: "Entrar na plataforma" }).waitFor();
      await signIn(employeePage, "browser", secret);
      await employeePage.getByText("Acesso não autorizado", { exact: true }).waitFor();
      phase = "interface: gestora após troca";
      await employeePage.goto(`${origin}/rooms`);
      await employeePage.getByRole("button", { name: "Criar reserva direta" }).waitFor();
      assert.equal(await employeePage.getByRole("group", { name: "Modo de atuação" }).count(), 0);
      assert.equal(await employeePage.getByRole("heading", { name: "Meus pedidos" }).count(), 0);

      phase = "interface: modos do administrador em desktop e celular";
      await operatorPage.goto(`${origin}/rooms`);
      const requester = operatorPage.getByRole("button", { name: "Room Booking Requester", exact: true });
      const manager = operatorPage.getByRole("button", { name: "Room Booking Manager", exact: true });
      await requester.waitFor();
      assert.equal(await requester.getAttribute("aria-pressed"), "true");
      await operatorPage.getByRole("button", { name: "Novo pedido" }).waitFor();
      for (const width of [1280, 320]) {
        await operatorPage.setViewportSize({ width, height: 800 });
        const [left, right] = await Promise.all([requester.boundingBox(), manager.boundingBox()]);
        assert.ok(left && right && [left, right].every((box) => box.x >= 0 && box.x + box.width <= width));
        await manager.click();
        assert.equal(await manager.getAttribute("aria-pressed"), "true");
        await operatorPage.getByRole("heading", { name: "Histórico do agendamento" }).waitFor();
        assert.equal(await operatorPage.getByRole("heading", { name: "Meus pedidos" }).count(), 0);
        await requester.click();
        await operatorPage.getByRole("heading", { name: "Meus pedidos" }).waitFor();
        assert.equal(await operatorPage.getByRole("heading", { name: "Histórico do agendamento" }).count(), 0);
      }
      if (requesterPassword) {
        phase = "interface: solicitante sem gestão";
        const requesterPage = observe(await browser.newPage({ reducedMotion: "reduce" }));
        await requesterPage.goto(`${origin}/rooms`);
        await signIn(requesterPage, "roomrequester", requesterPassword);
        await requesterPage.getByRole("heading", { name: "Meus pedidos" }).waitFor();
        assert.equal(await requesterPage.getByRole("button", { name: "Criar reserva direta" }).count(), 0);
        assert.equal(await requesterPage.getByRole("group", { name: "Modo de atuação" }).count(), 0);
      }
      console.log("PASS GG-05B/D5-C: cadastro global, troca, modos administrativos e vistas fixas pelo Vite em Chromium.");
    } catch (error) {
      const summaries = ["intercepts pointer events", "strict mode violation", "element is not visible",
        "element is not stable", "Timeout", "page has been closed", "did not resolve to an element"];
      const kind = summaries.filter((message) => error.message.includes(message));
      if (kind.length) browserResponses.push(kind.join(", "));
      if (browserPage) {
        const state = await browserPage.evaluate(() => {
          const body = document.body?.innerText ?? "";
          return ["Carregando seu acesso", "Não foi possível concluir a operação", "Acesso não autorizado",
            "Não foi possível exibir esta página", "Novo usuário", "Entrar na plataforma", "Usuários"]
            .filter((label) => body.includes(label));
        }).catch(() => []);
        if (state.length) browserResponses.push(`tela: ${state.join(", ")}`);
      }
      throw error;
    } finally {
      await browser.close();
    }
  }

  phase = "logs sem credenciais";
  for (const service of ["auth", "identity"]) {
    const logs = spawnSync("docker", ["logs", "--since", logStart, `${project}-${service}-1`], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
    assert.equal(logs.status, 0);
    assert.ok(secrets.every((secret) => !logs.stdout.includes(secret) && !logs.stderr.includes(secret)));
  }
  if (!browserOnly) console.log("PASS GG-05B: GoTrue, Kong, REST/RPC, objetos, escopo, primeiro acesso, reset, bloqueio e reativação.");
} catch (error) {
  console.error(`FAIL GG-05B | ${phase}${error.actualStatus ? ` | ${error.surface}: HTTP ${error.actualStatus}, esperado ${error.expectedStatuses.join("/")}` : ""}`);
  const location = error.stack?.match(/gg05b-identity\.mjs:\d+:\d+/)?.[0];
  if (location) console.error(location);
  if (phase.startsWith("interface:") && browserResponses.length) console.error(browserResponses.slice(-10).join(" | "));
  process.exitCode = 1;
} finally {
  let cleanupPhase = "identificar alvos";
  try {
    const syntheticEmails = [email("employee"), email("reader"), email("browser"), email("secretary"), email("roomrequester"), email("forbiddenadmin")].map((value) => `'${value}'`).join(",");
    const remaining = sql(`select id from auth.users where email in (${syntheticEmails})
      union select target_id from private.identity_operations where email in (${syntheticEmails})`)
      .split("\n").filter((id) => /^[a-f0-9-]{36}$/.test(id));
    const userList = [...new Set([...identities, ...remaining])].map((id) => `'${id}'`).join(",");
    const unitList = units.map((id) => `'${id}'`).join(",");
    cleanupPhase = "Storage";
    if (assets.length) {
      const result = internal("storage", "/object/unit-covers", "DELETE", { prefixes: assets.map((asset) => asset.object_key) });
      assert.ok([200, 204].includes(result.status));
    }
    const syntheticReports = `select id from feedback.reports where author_id in (${userList})`;
    const attachmentKeys = sql(`select attachment_key from feedback.reports
      where author_id in (${userList}) and attachment_key is not null`).split("\n").filter(Boolean);
    if (attachmentKeys.length) {
      const result = internal("storage", "/object/feedback-attachments", "DELETE", { prefixes: attachmentKeys });
      assert.ok([200, 204].includes(result.status));
      const keys = attachmentKeys.map((key) => `'${key}'`).join(",");
      assert.equal(sql(`select count(*) from storage.objects where bucket_id='feedback-attachments' and name in (${keys})`), "0");
    }
    cleanupPhase = "Core";
    const fixtureAudit = `actor_user_id in (${userList})
      or entity_id in (${userList},${unitList}) or unit_id in (${unitList})
      or (entity_type = 'user_role_assignments'
        and (before_data->>'user_id' in (${userList}) or after_data->>'user_id' in (${userList})))`;
    sql(`begin;
      -- A trilha normal guarda a unidade em uma FK. Suspende o trigger somente
      -- na transação que remove as duas unidades desta fixture.
      alter table core.units disable trigger record_change;
      update core.units set cover_asset_id=null where id in (${unitList});
      delete from core.unit_cover_assets where unit_id in (${unitList});
      delete from core.user_role_assignments where user_id in (${userList});
      delete from private.identity_operators where user_id in (${userList});
      delete from private.identity_credentials where user_id in (${userList});
      delete from private.identity_operations where target_id in (${userList}) or actor_id in (${userList});
      delete from core.system_audit_log where ${fixtureAudit};
      delete from feedback.reports where id in (${syntheticReports});
      set constraints all immediate;
      delete from core.units where id in (${unitList});
      alter table core.units enable trigger record_change;
      delete from core.profiles where id in (${userList});
      delete from core.system_audit_log where entity_id in (${userList});
      commit;`);
    cleanupPhase = "Auth";
    for (const id of new Set([...identities, ...remaining])) {
      const result = internal("auth", `/admin/users/${id}`, "DELETE");
      assert.ok([200, 204, 404].includes(result.status));
    }
    assert.equal(sql(`select count(*) from auth.users where id in (${userList})`), "0");
    assert.equal(sql(`select count(*) from core.system_audit_log where ${fixtureAudit}`), "0");
    assert.equal(sql(`select count(*) from feedback.reports where author_id in (${userList})`), "0");
    console.log("Fixtures GG-05B removidas e ausência das identidades e de sua trilha confirmada.");
  } catch {
    console.error(`A limpeza verificada das fixtures GG-05B falhou na etapa ${cleanupPhase}.`);
    process.exitCode = 1;
  }
}
