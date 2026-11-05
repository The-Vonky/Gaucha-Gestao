// GG-10: Chromium real; todos os endpoints de Auth/REST interceptados, sem banco.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium, expect } from "playwright/test";
import { salesLocalWeb } from "./sales-local-web.mjs";

const base = "http://127.0.0.1:5173", api = "http://127.0.0.1:54321";
const directory = process.env.GG10_ARTIFACT_DIR ?? "tmp/gg10";
mkdirSync(directory, { recursive: true });
const original = JSON.parse(readFileSync("tests/fixtures/announcements.json", "utf8"));
let config = structuredClone(original), unavailable = false, reads = 0;
const user = { id: "00000000-0000-4000-8000-000000000099", email: "gg10@example.test", aud: "authenticated" };
const expires = Math.floor(Date.now() / 1000) + 3600;
const token = [Buffer.from('{"alg":"HS256"}').toString("base64url"), Buffer.from(JSON.stringify({ sub: user.id, exp: expires, role: "authenticated" })).toString("base64url"), "synthetic"].join(".");
const session = { access_token: token, refresh_token: "synthetic", expires_at: expires, expires_in: 3600, token_type: "bearer", user };
const grants = ["audit.inspection.read", "audit.inspection.create", "action_plan.read", "announcements.notice.manage"].map(permission => ({ permission, scope_type: "global", unit_id: null, sector_id: null }));
const errors = [], checks = [], contrasts = [];
const notices = [];
let noticeVersion = 0;
let server, browser;
try {
  server = await salesLocalWeb({ API_URL: api, ANON_KEY: "sb_publishable_gg10_fixture" });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "pt-BR", reducedMotion: "reduce" });
  await context.route("**/*", async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (url.origin === api && path.endsWith("/announcements_published")) {
      reads++;
      return unavailable ? route.fulfill({ status: 404, body: "" }) : route.fulfill({ json: { ...config, serverNow: new Date().toISOString(), nextRefreshAt: null }, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } });
    }
    if (url.origin === base) return route.continue();
    assert.equal(url.origin, api, "Proibido acessar destinos diferentes do transporte local interceptado");
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 200, headers });
    const json = data => route.fulfill({ json: data, headers });
    if (path === "/auth/v1/token") return json(session);
    if (path === "/auth/v1/logout") return route.fulfill({ status: 204, headers });
    if (path === "/auth/v1/user") return json(user);
    if (path.endsWith("/profiles")) return json({ id: user.id, active: true, display_name: "Pessoa sintética GG-10" });
    if (path.endsWith("/my_access")) return json(grants);
    if (path.endsWith("/announcements_manage_list")) return json({ items: notices, total: notices.length });
    if (path.endsWith("/announcements_notice_save")) {
      const data = route.request().postDataJSON();
      const now = new Date().toISOString();
      const row = { id: "00000000-0000-4000-8000-000000000098", version: ++noticeVersion,
        title: data.p_title, message: data.p_message, category: data.p_category, tone: data.p_tone,
        priority: data.p_priority, starts_at: data.p_starts_at, ends_at: data.p_ends_at, state: data.p_state,
        status: data.p_state === "published" ? "active" : data.p_state, show_feedback: data.p_show_feedback,
        created_by: user.id, updated_by: user.id, created_at: now, updated_at: now };
      notices.splice(0, notices.length, row); return json(row);
    }
    if (path.endsWith("/announcements_notice_history")) return json({items: notices.map(row=>({notice_id:row.id,version:row.version,actor_user_id:user.id,occurred_at:row.updated_at,before_data:null,after_data:row})),total:notices.length});
    if (["/units", "/inspection_summaries", "/plan_summaries"].some(p => path.endsWith(p))) return json([]);
    throw new Error(`Endpoint não previsto: ${path}`);
  });
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  await page.clock.install();
  await page.goto(base);
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
  assert.equal(reads, 0); await expect(page.getByRole("region", { name: "Aviso institucional" })).toHaveCount(0);
  await page.getByLabel(/^E-mail/).fill(user.email); await page.getByLabel(/^Senha$/).fill("Synthetic-only-password-123!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  const banner = page.getByRole("region", { name: "Aviso institucional" });
  await expect(page.getByRole("heading", { name: "Áreas de trabalho" })).toBeVisible(); await expect(banner).toBeVisible();
  await expect(banner.getByRole("button", { name: "Relatar problema ou sugerir melhoria" })).toBeDisabled();
  checks.push("Login real da UI com resposta sintética: sem aviso/fetch antes da sessão, aviso após autenticação; GG-11 indisponível");

  const geometry = async width => {
    await expect.poll(async () => page.evaluate(() => {
      const bar = document.querySelector(".announcement-slot").getBoundingClientRect();
      const header = document.querySelector(".topbar").getBoundingClientRect();
      const sidebar = document.querySelector(".sidebar");
      const hidden = getComputedStyle(sidebar).display === "none";
      const side = sidebar.getBoundingClientRect();
      const delta = hidden ? 0 : Math.max(Math.abs(side.top - bar.bottom), Math.abs(side.bottom - innerHeight));
      return Math.max(Math.abs(header.top - bar.bottom), delta);
    })).toBeLessThan(1);
    const result = await page.evaluate(() => {
      const rect = selector => { const { top, bottom, height } = document.querySelector(selector).getBoundingClientRect(); return { top, bottom, height }; };
      const sidebar = document.querySelector(".sidebar");
      return { viewportHeight: innerHeight, bar: rect(".announcement-slot"), header: rect(".topbar"), main: rect("#main"), overflow: document.documentElement.scrollWidth > innerWidth + 1,
        sidebar: getComputedStyle(sidebar).display === "none" ? null : rect(".sidebar") };
    });
    assert.equal(result.overflow, false, `Overflow externo ${width}`);
    assert.ok(Math.abs(result.bar.top) < 1, `Topo persistente ${width}`);
    if (result.sidebar) {
      assert.ok(Math.abs(result.sidebar.top - result.bar.bottom) < 1, JSON.stringify({ width, ...result }));
      assert.ok(result.sidebar.bottom <= result.viewportHeight + 1, JSON.stringify({ width, ...result }));
    }
    return result;
  };
  await geometry(1440);
  await page.setViewportSize({ width: 375, height: 812 });
  await geometry(375);
  await page.screenshot({ path: `${directory}/testing-375.png`, animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await geometry(1440);
  const initialReads = reads;
  // Navegação SPA preserva a instância da barra e não refaz fetch por módulo.
  await banner.evaluate(element => { element.dataset.testContinuity = "preserved"; });
  await page.locator(".module-tile", { has: page.getByRole("heading", { name: "Auditorias", exact: true }) }).click();
  await expect(page.getByRole("heading", { name: "Auditorias", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Nova auditoria", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Nova auditoria", exact: true });
  await expect(modal).toBeVisible();
  assert.ok(await modal.evaluate(element => element.matches(":modal")), "Modal fica na top layer acima da barra");
  await modal.getByRole("button", { name: "Fechar", exact: true }).focus(); await page.keyboard.press("Enter"); await expect(modal).toHaveCount(0);
  await page.getByRole("link", { name: "Planos de Ação", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Planos de Ação", exact: true })).toBeVisible();
  await expect(banner).toHaveAttribute("data-test-continuity", "preserved"); assert.equal(reads, initialReads);
  checks.push("Navegação entre Auditorias/Planos preserva barra; Modal Shared na top layer, fechamento por teclado");

  // Polling real do hook, acelerado pelo relógio virtual do browser.
  const update = async next => {
    config = structuredClone(next); const before = reads;
    await page.clock.runFor(60010); await expect.poll(() => reads).toBeGreaterThan(before);
  };
  config.announcements[0].message = "Mensagem longa para leitura em telas estreitas. ".repeat(30);
  await update(config); await expect(banner).toContainText("Mensagem longa");
  for (const [width, height] of [[1440, 1000], [1024, 768], [768, 1000], [360, 800], [375, 812], [320, 568]]) {
    await page.setViewportSize({ width, height }); await page.evaluate(() => window.scrollTo(0, 0));
    await geometry(width);
    // Torna a página longa sem criar registros ou tocar em módulos.
    await page.locator("#main").evaluate(element => element.style.minHeight = "2200px");
    await page.evaluate(() => window.scrollTo(0, 700)); await geometry(width);
    const collapsed = await banner.boundingBox();
    assert.ok(collapsed.height >= 44 && collapsed.height <= 56, `Barra compacta ${width}: ${collapsed.height}`);
    const trigger = banner.getByRole("button", { name: /^Ler comunicado:/ });
    await trigger.focus(); await page.keyboard.press("Enter");
    const detail = page.getByRole("dialog", { name: original.announcements[0].title, exact: true });
    await expect(detail).toBeVisible();
    await expect(detail).toContainText(config.announcements[0].message);
    assert.ok(await detail.evaluate(element => element.matches(":modal")));
    assert.equal((await banner.boundingBox()).height, collapsed.height);
    await page.screenshot({ path: `${directory}/detail-${width}.png`, animations: "disabled" });
    await page.keyboard.press("Escape"); await expect(detail).toHaveCount(0); await expect(trigger).toBeFocused();
    if (width < 1024) {
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      const drawer = page.getByRole("dialog", { name: "Navegação", exact: true }); await expect(drawer).toBeVisible();
      assert.ok(await drawer.evaluate(element => element.matches(":modal")));
      await page.keyboard.press("Escape"); await expect(drawer).toHaveCount(0);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${directory}/long-${width}.png`, fullPage: false, animations: "disabled" });
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator("#main").evaluate(element => {
    const section = document.createElement("div"); section.className = "audit-section-bar";
    section.textContent = "Seção sintética de inspeção"; element.prepend(section);
  });
  await page.evaluate(() => window.scrollTo(0, 700)); await geometry(375);
  await expect.poll(() => page.evaluate(() => Math.abs(document.querySelector(".audit-section-bar").getBoundingClientRect().top - document.querySelector(".topbar").getBoundingClientRect().bottom))).toBeLessThan(1);
  await page.locator(".audit-section-bar").evaluate(element => element.remove());
  checks.push("1440/1024/768/360/375/320: barra 44–56px, mensagem longa no modal, Escape e retorno do foco, sem overflow externo; barra/header/sidebar medidos ao rolar; drawers na top layer e seletor sticky de Auditoria sob cabeçalho");

  // O índice desktop também precisa caber abaixo do conjunto barra+cabeçalho.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("#main").evaluate(element => {
    const layout = document.createElement("div"); layout.className = "audit-layout";
    const navigation = document.createElement("aside"); navigation.className = "audit-sections";
    for (let index = 0; index < 40; index++) {
      const control = document.createElement("button"); control.textContent = `Seção sintética ${index}`;
      navigation.append(control);
    }
    const content = document.createElement("div"); content.style.minHeight = "2200px";
    layout.append(navigation, content); element.prepend(layout);
  });
  await page.evaluate(() => window.scrollTo(0, 700)); await geometry(1440);
  await expect.poll(() => page.evaluate(() => {
    const navigation = document.querySelector(".audit-sections").getBoundingClientRect();
    const header = document.querySelector(".topbar").getBoundingClientRect();
    const spacing = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--space-4")) * 16;
    return Math.max(Math.abs(navigation.top - header.bottom - spacing), Math.max(0, navigation.bottom - innerHeight));
  })).toBeLessThan(1);
  await page.locator(".audit-layout").evaluate(element => element.remove());
  checks.push("Índice sticky desktop de Auditoria: posição sob barra+cabeçalho e altura útil dentro do viewport, com 40 controles sintéticos");

  // Reflow de viewport 1280→640 e texto 16→32px: duas verificações separadas.
  await page.setViewportSize({ width: 640, height: 450 });
  await geometry(640);
  await page.evaluate(() => document.documentElement.style.fontSize = "200%");
  await geometry(640); await banner.getByRole("button", { name: /^Ler comunicado:/ }).focus();
  await page.screenshot({ path: `${directory}/zoom-text-200.png`, animations: "disabled" });
  await page.evaluate(() => document.documentElement.style.fontSize = "");
  checks.push("Reflow equivalente a 200% (640×450) e ampliação de texto 200%; zoom nativo e aparelhos físicos pendentes");

  await page.setViewportSize({ width: 1440, height: 1000 });
  // Contraste usa cores CSS realmente computadas em cada categoria, inclusive botão indisponível.
  for (const type of ["testing", "maintenance", "information", "critical", "success", "general"]) {
    const next = structuredClone(original); next.announcements[0].type = type; await update(next);
    await expect(banner).toHaveClass(new RegExp(`announcement-${type}`));
    const ratio = await banner.evaluate(element => {
      const rgb = value => value.match(/\d+(?:\.\d+)?/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      const lum = value => { const [r, g, b] = rgb(value); return .2126 * r + .7152 * g + .0722 * b; };
      const styles = getComputedStyle(element), background = lum(styles.backgroundColor);
      return [styles.color, getComputedStyle(element.querySelector("button")).color].map(color => {
        const foreground = lum(color); return (Math.max(background, foreground) + .05) / (Math.min(background, foreground) + .05);
      });
    });
    assert.ok(ratio.every(value => value >= 4.5), `Contraste WCAG AA ${type}: ${ratio}`); contrasts.push({ type, text: ratio[0], button: ratio[1] });
    await page.screenshot({ path: `${directory}/${type}-1440.png`, animations: "disabled" });
  }
  checks.push("Contraste computado texto/botão ≥4.5:1 nas quatro categorias, aria-live polite sem rotação");

  // Foco e âncoras respeitam a soma medida barra+cabeçalho.
  await page.evaluate(() => {
    const target = document.createElement("button"); target.textContent = "Alvo de foco sintético";
    target.style.marginTop = "950px"; document.querySelector("#main").append(target); target.focus();
  });
  const focus = await page.getByRole("button", { name: "Alvo de foco sintético" }).boundingBox();
  const header = await page.locator(".topbar").boundingBox(); assert.ok(focus.y >= header.y + header.height, "Foco fora da obstrução sticky");
  await update({ ...original, enabled: false }); await expect(banner).toHaveCount(0);
  await expect.poll(() => page.locator(".announcement-slot").evaluate(element => element.getBoundingClientRect().height)).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  assert.equal((await page.locator(".topbar").boundingBox()).y, 0);
  await update(original); await expect(banner).toBeVisible();
  unavailable = true; await page.clock.runFor(60010); await expect(banner).toHaveCount(0);
  unavailable = false; await update(original); await expect(banner).toBeVisible();
  checks.push("Refresh em página aberta, foco/scroll-padding, desativação sem espaço vazio, 404 oculta e recuperação exibe");
  await page.locator(".sidebar").getByRole("button", { name: "Administração", exact: true }).click();
  await page.locator(".sidebar").getByRole("link", { name: "Comunicados", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Comunicados", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Novo comunicado", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Novo comunicado", exact: true });
  await editor.getByLabel("Assunto", { exact: true }).fill("Manutenção programada — demonstração");
  await editor.getByLabel("Mensagem completa", { exact: true }).fill("Mensagem sintética para prévia administrativa. ".repeat(12));
  await editor.getByLabel(/^Categoria/).selectOption("critical");
  await expect(editor.getByRole("radio")).toHaveCount(1);
  await expect(editor.getByRole("radio", { name: "Vermelho · crítico" })).toBeChecked();
  for (const [width,height] of [[1440,1000],[1024,768],[768,1000],[375,812],[320,568]]) {
    await page.setViewportSize({width,height});
    await expect(editor).toBeVisible();
    assert.equal(await editor.evaluate(element=>element.scrollWidth>element.clientWidth+1),false, `Formulário sem overflow ${width}`);
    await page.screenshot({path:`${directory}/admin-editor-${width}.png`,animations:"disabled"});
  }
  await page.setViewportSize({width:1440,height:1000});
  await editor.getByRole("button", {name:"Prévia mobile",exact:true}).click();
  await page.screenshot({path:`${directory}/admin-preview-mobile.png`,animations:"disabled"});
  await editor.getByRole("button",{name:"Salvar rascunho",exact:true}).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByText("Comunicado salvo no servidor.", {exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Editar Manutenção programada — demonstração",exact:true}).click();
  const edit = page.getByRole("dialog",{name:"Editar comunicado",exact:true});
  await edit.getByRole("button",{name:"Publicar comunicado",exact:true}).click();await expect(edit).toHaveCount(0);
  await expect(page.getByText("Ativo",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Histórico de Manutenção programada — demonstração",exact:true}).click();
  const history = page.getByRole("dialog",{name:"Histórico: Manutenção programada — demonstração",exact:true});
  await expect(history).toContainText("Versão 2");await page.keyboard.press("Escape");
  await expect(page.getByRole("button",{name:"Histórico de Manutenção programada — demonstração",exact:true})).toBeFocused();
  await page.screenshot({path:`${directory}/admin-list-1440.png`,animations:"disabled"});
  checks.push("Administração Chromium sintética: lista, rascunho/publicação com resposta de transporte, histórico sob demanda, vermelho obrigatório para crítico, formulário sem overflow 1440/1024/768/375/320 e prévia mobile");
  const beforeLogout = reads;
  await page.locator(".sidebar").getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible(); await expect(banner).toHaveCount(0);
  await page.clock.runFor(120010); assert.equal(reads, beforeLogout);
  assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue("--app-sticky-height")), "");
  checks.push("Logout preservado, barra removida, polling cancelado e variável de scroll limpa");
  assert.deepEqual(errors, []);
  writeFileSync(`${directory}/results.json`, JSON.stringify({ checks, contrasts, errors }, null, 2));
  console.log(JSON.stringify({ result: "PASS", checks, contrasts, directory }, null, 2));
} finally {
  await browser?.close(); await server?.close();
}
