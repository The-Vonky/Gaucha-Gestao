import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createServer } from "vite";
import readExcelFile from "read-excel-file/node";
import { exportFixture, exportUnit } from "../fixtures/sales-export.ts";

// Aplicação e writer reais, transporte inteiramente interceptado. Sem banco/Auth reais.
const backend = "http://127.0.0.1:65439";
process.env.VITE_SUPABASE_URL = backend;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_browser-synthetic";
const user = { id: "00000000-0000-0000-0000-000000000001", email: "ven05a-browser@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const payload = Buffer.from(JSON.stringify({ sub: user.id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
const session = { access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.synthetic`, refresh_token: "synthetic-refresh", token_type: "bearer", expires_in: 3600, user };
const grants = ["sales.entry.read", "sales.dashboard.read", "sales.export.filtered", "sales.export.full"].map(permission => ({ permission, scope_type: "unit", unit_id: exportUnit, sector_id: null }));
const report = exportFixture();
let browser, server, phase = "iniciar navegador";
try {
  server = await createServer({ configFile: "apps/web/vite.config.ts", root: "apps/web", server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.route(`${backend}/**`, async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const reply = body => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/auth/v1/token") return reply(session);
    if (path === "/auth/v1/user") return reply(user);
    if (path === "/rest/v1/profiles") return reply({ id: user.id, display_name: "Exportação sintética", active: true });
    if (path.endsWith("/rpc/my_access")) return reply(grants);
    if (path.endsWith("/rpc/sales_operation_units")) return reply([{ ...report.units[0], can_read: true, can_create: false, can_edit: false, can_delete: false }]);
    if (path.endsWith("/rpc/sales_entries_list")) return reply([]);
    if (path.endsWith("/rpc/sales_export_page")) {
      const args = request.postDataJSON(), offset = args.p_offset;
      return reply({ ...report, offset, next_offset: 2, rows: offset ? [] : report.rows });
    }
    throw new Error(`Endpoint sintético inesperado: ${path}`);
  });
  phase = "login sintético";
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/sales/entries?from=2026-09-01&to=2026-09-30&method=Stone`);
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill("Synthetic-browser-aA1!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  phase = "consulta aplicada";
  await page.getByText("Nenhum lançamento encontrado", { exact: true }).waitFor();
  await page.locator('select[name="method"]').selectOption("PIX");
  phase = "gerar e baixar XLSX";
  const pending = page.waitForEvent("download", { timeout: 15000 });
  await page.getByRole("button", { name: "Exportar período filtrado", exact: true }).click();
  const outcome = await Promise.race([
    pending.then(download => ({ download })),
    page.locator(".sales-export [role=alert]").waitFor().then(async () => ({ error: await page.locator(".sales-export [role=alert]").textContent() })),
  ]);
  assert.ok(!outcome.error, outcome.error);
  const bytes = await readFile(await outcome.download.path());
  const sheets = await readExcelFile(bytes);
  assert.deepEqual(sheets.map(s => s.sheet), ["Lançamentos", "Ajustes mensais", "Resumo"]);
  assert.equal(sheets[0].data[1][5], "0.01");
  assert.equal(sheets[2].data.find(r => r[0] === "Total consolidado exato (BRL)")[1], "0.11");
  console.log("VEN-05A browser sintético PASS: aplicação/writer/download/readback reais; sem acesso a banco.");
} catch (error) {
  console.error(`VEN-05A browser sintético falhou: ${phase}`);
  throw error; // Todo transporte desta prova é sintético e interceptado.
} finally { await browser?.close(); await server?.close(); }
