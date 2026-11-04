import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createServer } from "vite";
import readExcelFile from "read-excel-file/node";
import { dashboardFixture } from "../fixtures/sales-dashboard.ts";
import { exportFixture, exportUnit } from "../fixtures/sales-export.ts";

// Aplicação e writer reais, transporte inteiramente interceptado. Sem banco/Auth reais.
const backend = "http://127.0.0.1:65439";
process.env.VITE_SUPABASE_URL = backend;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_browser-synthetic";
const user = { id: "00000000-0000-0000-0000-000000000001", email: "ven05a-browser@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const payload = Buffer.from(JSON.stringify({ sub: user.id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
const session = { access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.synthetic`, refresh_token: "synthetic-refresh", token_type: "bearer", expires_in: 3600, user };
const grants = ["sales.entry.read", "sales.dashboard.read", "sales.export.filtered", "sales.export.full", "sales.entry.create"].map(permission => ({ permission, scope_type: "unit", unit_id: exportUnit, sector_id: null }));
const report = exportFixture();
report.units[0].active = true;
const artifactDir = process.env.VEN05A_ARTIFACT_DIR;
let browser, server, phase = "iniciar navegador";
try {
  server = await createServer({ configFile: "apps/web/vite.config.ts", root: "apps/web", server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true, locale: "pt-BR" });
  const page = await context.newPage();
  await page.route(`${backend}/**`, async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const reply = body => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/auth/v1/token") return reply(session);
    if (path === "/auth/v1/user") return reply(user);
    if (path === "/rest/v1/profiles") return reply({ id: user.id, display_name: "Exportação sintética", active: true });
    if (path.endsWith("/rpc/my_access")) return reply(grants);
    if (path.endsWith("/rpc/sales_operation_units")) return reply([{ ...report.units[0], can_read: true, can_create: true, can_edit: false, can_delete: false }]);
    if (path.endsWith("/rpc/sales_entries_list")) return reply([{ ...report.rows[0], sale_date: report.rows[0].date }]);
    if (path.endsWith("/rpc/sales_dashboard")) return reply(dashboardFixture());
    if (path.endsWith("/rpc/sales_export_page")) {
      const args = request.postDataJSON(), offset = args.p_offset;
      return reply({ ...report, mode: args.p_mode, filters: { from: args.p_from, to: args.p_to, method: args.p_method }, offset, next_offset: 2, rows: offset ? [] : report.rows });
    }
    throw new Error(`Endpoint sintético inesperado: ${path}`);
  });
  phase = "login sintético";
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/sales/entries?from=2026-09-01&to=2026-09-30&method=Stone`);
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill("Synthetic-browser-aA1!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  phase = "consulta aplicada";
  await page.getByRole("columnheader", { name: "Lançado por", exact: true }).waitFor();
  await page.getByRole("cell", { name: "Pessoa sintética Á 😀", exact: true }).waitFor();
  if (artifactDir) await mkdir(artifactDir, { recursive: true });
  for (const [name, width] of [["desktop", 1440], ["notebook", 1024], ["tablet", 768], ["mobile", 375]]) {
    await page.setViewportSize({ width, height: 960 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Sem overflow da página em ${name}`);
    const actions = page.getByRole("group", { name: "Ações dos lançamentos", exact: true });
    assert.equal(await actions.getByRole("button").count(), 3);
    const filterBox = await page.locator(".sales-filters").boundingBox(), actionBox = await actions.boundingBox(), tableBox = await page.locator(".table-scroll").boundingBox();
    assert.ok(actionBox.y >= filterBox.y + filterBox.height && tableBox.y >= actionBox.y + actionBox.height, `Ações entre filtros e tabela em ${name}`);
    if (name === "desktop") {
      const exportGroup = await actions.getByRole("group", { name: "Exportação Excel de Vendas", exact: true }).boundingBox();
      const createBox = await actions.getByRole("button", { name: "Novo lançamento", exact: true }).boundingBox();
      assert.ok(Math.abs(exportGroup.x - actionBox.x) < 2, "Exportações na extremidade esquerda");
      assert.ok(Math.abs(createBox.x + createBox.width - actionBox.x - actionBox.width) < 2, "Cadastro sozinho na extremidade direita");
      assert.ok(Math.abs(createBox.y - exportGroup.y) < 2, "Grupos na mesma linha");
      const info = await page.locator(".sales-export > p.muted").boundingBox();
      assert.ok(info.y >= Math.max(exportGroup.y + exportGroup.height, createBox.y + createBox.height), "Explicação abaixo dos dois grupos");
    }
    if (artifactDir) await page.screenshot({ path: `${artifactDir}/lancamentos-${name}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.locator('select[name="method"]').selectOption("PIX");
  phase = "gerar e baixar XLSX";
  const pending = page.waitForEvent("download", { timeout: 15000 });
  await page.getByRole("button", { name: "Exportar período filtrado", exact: true }).click();
  const outcome = await Promise.race([
    pending.then(download => ({ download })),
    page.locator(".sales-export [role=alert]").waitFor().then(async () => ({ error: await page.locator(".sales-export [role=alert]").textContent() })),
  ]);
  assert.ok(!outcome.error, outcome.error);
  assert.equal(outcome.download.suggestedFilename(), "historico-filtrado-01-09-2026-30-09-2026-1total.xlsx");
  const bytes = await readFile(await outcome.download.path());
  const sheets = await readExcelFile(bytes);
  assert.deepEqual(sheets.map(s => s.sheet), ["Lançamentos", "Ajustes mensais", "Resumo"]);
  assert.equal(sheets[0].data[4][4], 0.01);
  assert.equal(sheets[2].data.find(r => r[0] === "Total consolidado (R$)")[1], 0.11);
  assert.equal(sheets[0].data[4][5], "Pessoa sintética Á 😀");
  if (artifactDir) await writeFile(`${artifactDir}/exemplo-sintetico.xlsx`, bytes);
  const fullDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar histórico completo autorizado", exact: true }).click();
  const fullResult = await fullDownload;
  assert.equal(fullResult.suggestedFilename(), "historico-completo-01-09-2026-30-09-2026-1total.xlsx");
  const fullBytes = await readFile(await fullResult.path());
  const fullSheets = await readExcelFile(fullBytes);
  for (const result of [sheets, fullSheets]) {
    assert.equal(result[0].data[3].length, 7);
    assert.equal(result[0].data[4][4], 0.01);
    assert.equal(result[0].data[4][5], "Pessoa sintética Á 😀");
    assert.equal(result[1].data[1][4], 0.10);
    assert.ok(result.every(sheet => sheet.data.every(row => !row.some(value => typeof value === "string" && /Valor exato|Total .* exato/.test(value)))));
  }
  if (artifactDir) await writeFile(`${artifactDir}/exemplo-completo-sintetico.xlsx`, fullBytes);
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/sales/dashboard`);
  await page.getByText("Total financeiro do período", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /Exportar/ }).count(), 0);
  if (artifactDir) await page.screenshot({ path: `${artifactDir}/dashboard-desktop.png`, fullPage: true });
  console.log("VEN-05A browser sintético PASS: 4 viewports; criador; ambos downloads; dashboard sem exportação; aplicação/writer/download/readback reais; sem acesso a banco.");
} catch (error) {
  console.error(`VEN-05A browser sintético falhou: ${phase}`);
  throw error; // Todo transporte desta prova é sintético e interceptado.
} finally { await browser?.close(); await server?.close(); }
