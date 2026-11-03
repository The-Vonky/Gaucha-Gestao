// MEL-03–06: navegador real com transporte interceptado; nenhum cadastro persistente.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
import { chromium, expect } from "playwright/test";
import { salesLocalWeb } from "./sales-local-web.mjs";

const source = ts.transpileModule(readFileSync("tests/fixtures/sales-dashboard.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { dashboardFixture, A } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const directory = process.env.VEN04B_ARTIFACT_DIR ?? "tmp/mel03-06";
mkdirSync(directory, { recursive: true });
const base = "http://127.0.0.1:5173", api = "http://127.0.0.1:54321";
const user = { id: "00000000-0000-4000-8000-000000000099", email: "visual@example.test", aud: "authenticated" };
const expires = Math.floor(Date.now() / 1000) + 3600;
const token = [Buffer.from('{"alg":"HS256"}').toString("base64url"), Buffer.from(JSON.stringify({ sub: user.id, exp: expires, role: "authenticated" })).toString("base64url"), "fixture"].join(".");
const session = { access_token: token, refresh_token: "fixture-without-real-session", expires_at: expires, expires_in: 3600, token_type: "bearer", user };
const grant = permission => ({ permission, scope_type: "global", unit_id: null, sector_id: null });
const both = [grant("sales.dashboard.read"), ...["read", "create", "edit", "delete"].map(p => grant(`sales.entry.${p}`))];
const unit = { id: A, code: "A", name: "Unidade Alfa", active: true, can_read: true, can_create: true, can_edit: true, can_delete: true };
let grants = both, units = [unit], active = true, catalogError = false;
let server, browser;
const checks = [], errors = [], requests = [];
try {
  server = await salesLocalWeb({ API_URL: api, ANON_KEY: "sb_publishable_visual_fixture" });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "pt-BR", reducedMotion: "reduce" });
  await context.addInitScript(session => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)), session);
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === base) return route.continue();
    assert.equal(url.origin, api, "A prova só pode utilizar endpoints locais interceptados");
    const path = url.pathname, method = route.request().method(); requests.push({ path, method });
    if (method === "OPTIONS") return route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" } });
    const json = data => route.fulfill({ json: data, headers: { "Access-Control-Allow-Origin": "*" } });
    if (path.endsWith("/profiles")) return json({ id: user.id, active, display_name: "Pessoa de teste visual" });
    if (path.endsWith("/my_access")) return json(grants);
    if (path.endsWith("/sales_operation_units")) return catalogError ? route.abort() : json(units);
    if (path.endsWith("/sales_entries_list")) return json([]);
    if (path.endsWith("/sales_dashboard")) return json(dashboardFixture(JSON.parse(route.request().postData() || "{}").p_scope === "combined"));
    if (path.endsWith("/user")) return json(user);
    throw new Error(`Endpoint inesperado: ${path}`);
  });
  const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
  await page.goto(base + "/sales"); await expect(page.getByRole("heading", { name: "Dashboard gerencial", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Vendas / Maquininhas", exact: true })).toHaveAttribute("aria-expanded", "true");
  assert.equal(await page.locator(".page-title .eyebrow").count(), 0);
  await page.screenshot({ path: `${directory}/dashboard-1440.png`, fullPage: true, animations: "disabled" });
  for (const label of ["Voltar", "Comparar tudo", "Redefinir", "Atualizar"]) await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Ir para lançamentos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Lançamentos", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Novo lançamento", exact: true })).toBeEnabled();
  await page.screenshot({ path: `${directory}/entries-1440.png`, fullPage: true, animations: "disabled" });
  await page.goBack(); await expect(page.getByRole("heading", { name: "Dashboard gerencial", exact: true })).toBeVisible();
  await page.goForward(); await expect(page.getByRole("heading", { name: "Lançamentos", exact: true })).toBeVisible();
  checks.push("Entrada gerencial, dois níveis de menu, destaque ativo, breadcrumb, atalho contextual, controles gerenciais e histórico real");
  await page.goto(base + "/sales?method=Stone&from=2026-09-02&to=2026-09-10");
  await expect(page).toHaveURL(/\/sales\/entries\?method=Stone/);
  await page.getByRole("link", { name: "Voltar ao dashboard", exact: true }).click();
  await page.getByRole("link", { name: "Ir para lançamentos", exact: true }).click();
  assert.ok(page.url().includes("from=2026-09-02") && page.url().includes("to=2026-09-10") && page.url().includes("method=Stone"));
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [path, heading] of [["/sales/dashboard", "Dashboard gerencial"], ["/sales/entries", "Lançamentos"]]) {
      await page.goto(base + path); await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow externo ${width} ${path}`);
    }
    if (width === 375) {
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      const drawer = page.getByRole("dialog", { name: "Navegação", exact: true });
      await expect(drawer.getByRole("link", { name: "Lançamentos", exact: true })).toHaveAttribute("aria-current", "page");
      await page.screenshot({ path: `${directory}/menu-mobile-375.png`, fullPage: true, animations: "disabled" });
      const toggle = drawer.getByRole("button", { name: "Vendas / Maquininhas", exact: true });
      await toggle.focus(); await page.keyboard.press("Enter"); await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await page.keyboard.press("Space"); await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await drawer.getByRole("link", { name: "Visão geral", exact: true }).click(); await expect(drawer).toHaveCount(0);
      await page.goBack(); await expect(page.getByRole("heading", { name: "Lançamentos", exact: true })).toBeVisible();
    }
  }
  checks.push("375/768/1024/1440 sem overflow externo nas duas telas; menu mobile, Enter/Espaço, fechamento ao navegar e histórico");
  await page.setViewportSize({ width: 1440, height: 1000 }); units = []; grants = [...both, grant("admin.unit.manage")];
  await page.goto(base + "/sales/entries"); await expect(page.getByText(/ainda não existe nenhuma unidade cadastrada/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Novo lançamento", exact: true })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Cadastrar unidade", exact: true })).toHaveAttribute("href", "/admin/units");
  await page.screenshot({ path: `${directory}/entries-empty-1440.png`, fullPage: true, animations: "disabled" });
  units = [{ ...unit, active: false }]; await page.reload(); await expect(page.getByText(/Não há unidades ativas disponíveis/)).toBeVisible();
  catalogError = true; await page.reload(); await expect(page.getByText(/Não foi possível carregar as unidades autorizadas/)).toBeVisible();
  assert.equal(await page.getByText(/ainda não existe nenhuma unidade cadastrada/).count(), 0);
  catalogError = false; units = [unit]; await page.getByRole("button", { name: "Tentar carregar unidades novamente" }).click();
  await expect(page.getByRole("button", { name: "Novo lançamento", exact: true })).toBeEnabled();
  checks.push("Catálogo vazio, link administrativo, inativas, falha de rede e recuperação sem unidades persistentes");
  for (const [permissions, start, target, forbidden] of [
    [[grant("sales.dashboard.read")], "/sales", "Dashboard gerencial", "/sales/entries"],
    [[grant("sales.entry.read")], "/sales", "Lançamentos", "/sales/dashboard"],
  ]) {
    grants = permissions; await page.goto(base + start); await expect(page.getByRole("heading", { name: target, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Ir para lançamentos|Voltar ao dashboard/ })).toHaveCount(0);
    await page.goto(base + forbidden); await expect(page.getByRole("heading", { name: "Acesso não autorizado", exact: true })).toBeVisible();
  }
  grants = []; await page.goto(base + "/sales"); await expect(page.getByRole("heading", { name: "Acesso não autorizado", exact: true })).toBeVisible();
  grants = [{ ...grant("sales.dashboard.read"), scope_type: "sector", sector_id: "synthetic" }]; await page.reload();
  await expect(page.getByRole("heading", { name: "Acesso não autorizado", exact: true })).toBeVisible();
  active = false; await page.reload(); await expect(page.getByRole("heading", { name: "Acesso indisponível", exact: true })).toBeVisible();
  checks.push("Gerencial/operacional isolados, sem grants, setorial, perfil inativo e URLs diretas; nenhuma escrita real");
  assert.deepEqual(errors, []);
  writeFileSync(`${directory}/visual-result.json`, JSON.stringify({ checks, errors, transport: "Auth e RPC interceptados por fixtures; navegador/frontend reais; banco preservado", requests: requests.map(r => r.path) }, null, 2));
  console.log("MEL-03–06 Chromium PASS:", checks);
} finally { await browser?.close(); await server?.close(); }
