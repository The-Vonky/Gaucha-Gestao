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
    const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: "pt-BR" });
    await context.addInitScript((session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)), verify.data.session);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin + "/rooms");
    await page.getByRole("heading", { name: "Meus pedidos", exact: true }).waitFor();
    await page.getByRole("button", { name: "Novo pedido", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Solicitações pendentes", exact: true }).count(), 0);
    for (const name of ["Criar reserva direta", "Editar reserva", "Cancelar reserva", "Aprovar pedido", "Recusar pedido"])
      assert.equal(await page.getByRole("button", { name, exact: true }).count(), 0);
    const summary = await auth.rpc("room_booking_summary");
    assert.equal(summary.error,null);
    assert.equal(Object.hasOwn(summary.data,"pending_count"),false);
    const forbidden = await auth.rpc("room_booking_requests", {p_queue:true});
    assert.equal(forbidden.error?.code,"42501");
    await page.goto(origin + "/admin/roles");
    for (const name of ["Room Booking Manager", "Room Booking Requester"]) {
      await page.getByPlaceholder("Nome ou chave do perfil").fill(name);
      await page.getByRole("button", {name: "Consultar " + name, exact:true}).click();
      await page.getByRole("heading", {name: "Consultar perfil · " + name, exact:true}).waitFor();
      await page.getByRole("dialog").getByText(name === "Room Booking Manager" ? "Gestão de pedidos e reservas." : "Solicitações individuais e consulta da agenda.", {exact:true}).waitFor();
      await page.getByRole("button", {name:"Fechar", exact:true}).click();
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS Chromium ${width}px: administrador sem gestão/fila; RPC privada negada; nomes na busca/lista/detalhe`);
  }
} finally {
  await browser?.close();
  await db.end();
}
