// Chromium real + Auth/REST local. Sessões e chaves ficam somente em memória.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { connect, identity } from "./room-booking-local.mjs";
const origin = "http://127.0.0.1:5173";
const cli = process.env.SUPABASE_CLI || "supabase";
const local = JSON.parse(
  execFileSync(cli, ["status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
assert.equal(local.API_URL, "http://127.0.0.1:54321");
const db = await connect();
let browser;
let activePage;
let phase = "autenticação local";
try {
  const id = await identity(db);
  const { rows } = await db.query("select email from auth.users where id=$1", [
    id,
  ]);
  const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: rows[0].email,
  });
  assert.equal(link.error, null, "Gerar sessão de teste para conta existente");
  const auth = createClient(local.API_URL, local.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const verify = await auth.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: "magiclink",
  });
  assert.equal(verify.error, null, "Autenticação real local");
  browser = await chromium.launch();
  for (const width of [1440, 390]) {
    phase = `${width}px abrir rota`;
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      timezoneId: width === 390 ? "Asia/Tokyo" : "UTC",
      locale: "pt-BR",
    });
    await context.addInitScript(
      (session) =>
        localStorage.setItem("sb-127-auth-token", JSON.stringify(session)),
      verify.data.session,
    );
    const page = await context.newPage();
    activePage = page;
    page.on("dialog", (d) => d.accept());
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/rooms");
    await page
      .getByRole("heading", { name: "Sala de Reunião", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Atualizar agenda", exact: true })
      .waitFor();
    phase = `${width}px criar pedido`;
    await page
      .getByRole("button", { name: "Novo pedido", exact: true })
      .click();
    const date = width === 1440 ? "2098-11-24" : "2098-11-25";
    const name = `Demonstração sintética ${width}px ${crypto.randomUUID().slice(0, 6)}`;
    await page.getByLabel("Data da reunião", { exact: true }).fill(date);
    await page.getByLabel("Início", { exact: true }).fill("14:07");
    await page.getByLabel("Término", { exact: true }).fill("14:23");
    await page.getByLabel("Reservado para", { exact: true }).fill(name);
    await page
      .getByLabel("Finalidade privada (somente você e a gestão)", {
        exact: true,
      })
      .fill("Validação local sintética");
    await page
      .getByRole("button", { name: "Enviar pedido", exact: true })
      .click();
    await page
      .getByText(
        "Pedido enviado. Aguarde aprovação: o horário ainda não está reservado.",
        { exact: true },
      )
      .waitFor();
    phase = `${width}px aprovar pedido`;
    const queue = page.locator("section").filter({
      has: page.getByRole("heading", {
        name: "Solicitações pendentes",
        exact: true,
      }),
    });
    const row = queue.locator("li").filter({ hasText: name });
    await row
      .getByRole("button", { name: "Aprovar pedido", exact: true })
      .click();
    await row
      .getByLabel("Observações públicas da secretaria", { exact: true })
      .fill("<script>texto inerte</script>");
    await row
      .getByRole("button", { name: "Confirmar aprovação", exact: true })
      .click();
    await page
      .getByText("Pedido aprovado. Reserva confirmada.", { exact: true })
      .waitFor();
    await page.getByLabel("Data", { exact: true }).fill(date);
    const agenda = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Agenda", exact: true }),
    });
    await agenda.getByText(name, { exact: true }).waitFor();
    assert.equal(await agenda.locator("script").count(), 0);
    phase = `${width}px editar reserva`;
    await agenda
      .getByRole("button", { name: "Editar reserva", exact: true })
      .click();
    phase = `${width}px editar nome`;
    await page
      .getByLabel("Reservado para", { exact: true })
      .fill(name + " editada");
    phase = `${width}px editar observações`;
    await page
      .getByLabel("Observações públicas da secretaria", { exact: true })
      .fill("Ensaio local concluído");
    await page
      .getByRole("button", { name: "Salvar reserva", exact: true })
      .click();
    await agenda.getByText(name + " editada", { exact: true }).waitFor();
    await page.locator(".rooms-page").screenshot({
      path: `/tmp/ag-rooms-${width}.png`,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
      "Sem overflow horizontal",
    );
    phase = `${width}px cancelar reserva`;
    await agenda
      .getByRole("button", { name: "Cancelar reserva", exact: true })
      .click();
    await page.getByText("Reserva cancelada.", { exact: true }).waitFor();
    await page
      .getByText("Reserva cancelada pela secretaria", { exact: true })
      .first()
      .waitFor();
    phase = `${width}px reserva direta`;
    await page
      .getByRole("button", { name: "Criar reserva direta", exact: true })
      .click();
    await page.getByLabel("Início", { exact: true }).fill("16:07");
    await page.getByLabel("Término", { exact: true }).fill("16:23");
    await page
      .getByLabel("Reservado para", { exact: true })
      .fill(name + " direta");
    await page
      .getByRole("button", { name: "Salvar reserva", exact: true })
      .click();
    await agenda.getByText(name + " direta", { exact: true }).waitFor();
    await agenda
      .getByRole("button", { name: "Cancelar reserva", exact: true })
      .click();
    await page.getByText("Reserva cancelada.", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      `PASS Chromium ${width}px: pedido → aprovação → agenda → edição → cancelamento; reserva direta; fuso e texto inerte`,
    );
    await context.close();
  }
  // Sem sessão: REST e tela não oferecem acesso de negócio.
  const anonymous = await browser.newContext();
  const page = await anonymous.newPage();
  await page.goto(origin + "/rooms");
  await page.getByRole("button", { name: "Entrar", exact: true }).waitFor();
  const denied = await fetch(
    local.API_URL + "/rest/v1/rpc/room_booking_summary",
    {
      method: "POST",
      headers: { apikey: local.ANON_KEY, "Content-Type": "application/json" },
      body: "{}",
    },
  );
  assert.equal(denied.ok, false);
  console.log("PASS sem sessão: login obrigatório e RPC negada");
  await anonymous.close();
} catch (e) {
  if (activePage)
    console.log(
      "Diagnóstico UI:",
      await activePage.locator("h1, [role=alert]").allTextContents(),
    );
  console.error("FAIL browser na fase:", phase, e.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await db.end();
}
