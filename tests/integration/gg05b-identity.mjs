import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

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
const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");

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

async function http(path, { token, method = "GET", json, body, schema = "public", contentType } = {}) {
  return fetch(base + path, {
    method, headers: {
      origin,
      "Accept-Profile": schema,
      "Content-Profile": schema,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(json !== undefined || contentType ? { "Content-Type": contentType ?? "application/json" } : {}),
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : body ? { body } : {}),
    redirect: "error",
  });
}
async function responseOf(path, options, statuses) {
  const response = await http(path, options);
  if (!statuses.includes(response.status)) {
    const surface = path.split("?")[0].split("/").slice(1, 4).join("/");
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

let phase = "configuração";
const browserResponses = [];
let browserPage;
const browserOnly = process.env.GG_IDENTITY_TEST_UI === "only";
try {
  assert.equal(sql("select enabled from private.identity_settings"), "t");
  const adminSecret = password();
  for (const [index, name] of ["operador", "protegido"].entries()) {
    const response = internal("auth", "/admin/users", "POST", {
      id: actors[index], email: email(name), password: index === 0 ? adminSecret : password(), email_confirm: true,
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
      console.log("PASS GG-05B: cadastro, recarga da troca e novo login pelo Vite em Chromium.");
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
  if (phase.startsWith("interface:") && browserResponses.length) console.error(browserResponses.slice(-10).join(" | "));
  process.exitCode = 1;
} finally {
  let cleanupPhase = "identificar alvos";
  try {
    const syntheticEmails = [email("employee"), email("reader"), email("browser")].map((value) => `'${value}'`).join(",");
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
    cleanupPhase = "Core";
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
      delete from core.system_audit_log where actor_user_id in (${userList})
        or entity_id in (${userList},${unitList}) or unit_id in (${unitList});
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
    console.log("Fixtures GG-05B removidas e ausência das identidades confirmada.");
  } catch {
    console.error(`A limpeza verificada das fixtures GG-05B falhou na etapa ${cleanupPhase}.`);
    process.exitCode = 1;
  }
}
