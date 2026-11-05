// VEN-04B: fidelidade visual com transporte interceptado; nenhum cadastro persistente.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
import { execFileSync } from "node:child_process";
import { createServer } from "vite";
import { chromium, expect } from "playwright/test";
import { visualFixture } from "./sales-dashboard-visual-fixture.mjs";
import { salesLocalWeb } from "./sales-local-web.mjs";

const source = ts.transpileModule(readFileSync("tests/fixtures/sales-dashboard.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { dashboardFixture, A } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const directory = process.env.VEN04B_ARTIFACT_DIR ?? "tmp/ven04b-visual";
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
let server, browser, baselineServer, dependencyVersion;
const baseline = process.env.VEN04B_BASELINE_SHA;
if (baseline) {
  assert.match(baseline, /^[a-f0-9]{7,40}$/);
  const files = ["SalesDashboardPage.tsx", "DashboardCharts.tsx", "dashboard.ts", "dashboard.css"];
  baselineServer = await createServer({ configFile: "apps/web/vite.config.ts", root: "apps/web", server: { middlewareMode: true, hmr: false }, plugins: [{ name: "ven04b-readonly-baseline", enforce: "pre", load(id) {
    const file = files.find(file => id === `${process.cwd()}/apps/web/src/modules/sales/${file}`);
    return file ? execFileSync("git", ["show", `${baseline}:apps/web/src/modules/sales/${file}`], { encoding: "utf8" }) : null;
  } }] });
}
const checks = [], errors = [], requests = [], filterComparisons = [];
const measureControls = form => form.evaluate(el => {
  const style = node => {
    const css = getComputedStyle(node), rect = node.getBoundingClientRect();
    return Object.fromEntries([...["fontSize", "fontWeight", "lineHeight", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "borderRadius", "borderWidth", "borderColor", "backgroundColor", "gap", "marginBottom"].map(key => [key, css[key]]), ["height", rect.height], ["width", rect.width]]);
  };
  return { form: style(el), label: style(el.querySelector("label")), control: style(el.querySelector("select")), button: style(el.querySelector("button")), controls: [...el.querySelectorAll("select, .sales-segmented")].map(style) };
});
let stress = false, releaseDaily, pendingDaily;
try {
  server = await salesLocalWeb({ API_URL: api, ANON_KEY: "sb_publishable_visual_fixture" });
  if (baselineServer) {
    const currentSource = await (await fetch(`${base}/src/modules/sales/SalesDashboardPage.tsx`)).text();
    dependencyVersion = currentSource.match(/node_modules\/\.vite\/deps\/react[^"?]*\?v=([a-f0-9]+)/)?.[1];
    assert.ok(dependencyVersion, "Versão React do Vite existente deve ser preservada");
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "pt-BR", reducedMotion: "reduce" });
  await context.addInitScript(session => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)), session);
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === base) {
      if (baselineServer && /\/src\/modules\/sales\/(SalesDashboardPage\.tsx|DashboardCharts\.tsx|dashboard\.ts|dashboard\.css)$/.test(url.pathname)) {
        const result = await baselineServer.transformRequest(url.pathname);
        assert.ok(result); return route.fulfill({ contentType: "application/javascript", body: result.code.replace(/(node_modules\/\.vite\/deps\/[^"?]+\?v=)[a-f0-9]+/g, `$1${dependencyVersion}`) });
      }
      return route.continue();
    }
    assert.equal(url.origin, api, "A prova só pode utilizar endpoints locais interceptados");
    const path = url.pathname, method = route.request().method(); requests.push({ path, method, ...(path.endsWith("/sales_dashboard") ? { filters: JSON.parse(route.request().postData() || "{}") } : {}) });
    if (method === "OPTIONS") return route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" } });
    const json = data => route.fulfill({ json: data, headers: { "Access-Control-Allow-Origin": "*" } });
    if (path.endsWith("/profiles")) return json({ id: user.id, active, display_name: "Pessoa de teste visual" });
    if (path.endsWith("/my_access")) return json(grants);
    if (path.endsWith("/announcements_published")) return json({version:1,enabled:true,announcements:[],serverNow:new Date().toISOString(),nextRefreshAt:null});
    if (path.endsWith("/sales_operation_units")) return catalogError ? route.abort() : json(units);
    if (path.endsWith("/sales_entries_list")) return json([]);
    if (path.endsWith("/sales_dashboard")) {
      const filters = JSON.parse(route.request().postData() || "{}"), combined = filters.p_scope === "combined";
      const data = visualFixture(dashboardFixture(combined), combined, filters.p_daily_month ?? undefined);
      data.filters.unit_ids = filters.p_units ?? data.filters.unit_ids;
      if (pendingDaily) { const pending = pendingDaily; pendingDaily = undefined; await pending; }
      if (stress) {
        data.units[0].name = "Unidade sintética com denominação extensa para avaliação de truncamento e acesso ao nome completo";
        data.summary.total = "9007199254740993.01";
      }
      return json(data);
    }
    if (path.endsWith("/user")) return json(user);
    throw new Error(`Endpoint inesperado: ${path}`);
  });
  const entries = await context.newPage();
  const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message)); page.on("console", message => { if (message.type() === "error") console.log("Browser:", message.text().slice(0, 600)); });
  for (const width of [1440, 1024, 768, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base + "/sales/dashboard?from=2026-04&to=2026-09");
    await expect(page.getByText("Total financeiro do período", { exact: true })).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow externo ${width}`);
    await page.screenshot({ path: `${directory}/dashboard-${width}.png`, fullPage: true, animations: "disabled" });
    await entries.setViewportSize({ width, height: 1000 });
    await entries.goto(base + "/sales/entries");
    await expect(entries.getByRole("heading", { name: "Lançamentos", exact: true })).toBeVisible();
    const entriesForm = entries.locator(".sales-filters");
    await expect(entriesForm).toBeVisible();
    await entries.screenshot({ path: `${directory}/entries-${width}.png`, fullPage: true, animations: "disabled" });
    await entriesForm.screenshot({ path: `${directory}/entries-filters-${width}.png` });
    await page.locator(".sales-dashboard-filters").screenshot({ path: `${directory}/toolbar-${width}.png` });
    await page.getByRole("figure", { name: "Composição Stone × PIX", exact: true }).screenshot({ path: `${directory}/mix-${width}.png` });
    const comparison = { width, entries: await measureControls(entriesForm), dashboard: await measureControls(page.locator(".sales-dashboard-filters")) };
    filterComparisons.push(comparison);
    if (!baseline) {
      const { entries: reference, dashboard: actual } = comparison;
      assert.deepEqual(actual.control, { ...reference.control, width: actual.control.width }, "Selects com o mesmo acabamento computado de Lançamentos");
      for (const key of ["fontSize", "fontWeight", "lineHeight", "gap", "marginBottom"]) assert.equal(actual.label[key], reference.label[key], `Label: ${key}`);
      for (const key of ["paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "gap", "marginBottom", "borderRadius", "borderColor", "backgroundColor"]) assert.equal(actual.form[key], reference.form[key], `Formulário: ${key}`);
      assert.deepEqual(actual.button, { ...reference.button, width: actual.button.width }, "Botões equivalentes a Lançamentos");
      assert.ok(actual.controls.every(control => control.height === reference.control.height), "Alturas medidas pela referência, incluindo segmentado");
      checks.push(`${width}: filtros comparados com estilos computados reais de Lançamentos (${reference.control.height}px)`);
    }
    if (!baseline) {
      assert.equal(await page.locator('[aria-label="Indicadores executivos"] .metric').count(), 4);
      assert.equal(await page.locator('.sales-insights article').count(), 3);
      const plots = await page.locator('.sales-plot').evaluateAll(elements => elements.map(e => e.getBoundingClientRect().height));
      assert.deepEqual(plots, [310,310,310]);
      assert.ok(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
      if (process.env.VEN04B_AXE_PATH) {
        await page.addScriptTag({ path: process.env.VEN04B_AXE_PATH });
        const result = await page.evaluate(async () => {
          const report = await window.axe.run(".sales-dashboard", { runOnly: { type: "tag", values: ["wcag2a","wcag2aa","wcag21aa"] } });
          return { violations: report.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) })), passes: report.passes.length, incomplete: report.incomplete.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })) };
        });
        writeFileSync(`${directory}/axe-${width}.json`, JSON.stringify(result, null, 2));
        assert.deepEqual(result.violations, [], `axe WCAG A/AA em ${width}`);
      }
      const daily = page.getByRole("figure", { name: "Acumulado diário e projeção", exact: true });
      await page.locator(".sales-competency").first().screenshot({ path: `${directory}/month-year-${width}.png` });
      const sizes = await page.locator('.sales-segmented, .sales-competency-controls select, .sales-dashboard-filters > label > select').evaluateAll(elements => elements.map(el => ({ height: el.getBoundingClientRect().height, bottom: el.getBoundingClientRect().bottom })));
      assert.ok(sizes.every(s => s.height === comparison.entries.control.height), `Alturas iguais: ${JSON.stringify(sizes)}`);
      if (width > 1200) assert.ok(sizes.every(s => Math.abs(s.bottom - sizes[0].bottom) < 1), "Controles alinhados na toolbar");
      const samples = await daily.locator('.sales-series-sample line').evaluateAll(lines => lines.map(line => {
        const plot = line.closest('figure').querySelector(`.sales-plot path.${line.getAttribute('class')}`);
        const sample = getComputedStyle(line), actual = getComputedStyle(plot);
        return { sample: [sample.stroke, sample.strokeWidth, sample.strokeDasharray], plot: [actual.stroke, actual.strokeWidth, actual.strokeDasharray] };
      }));
      assert.equal(samples.length, 3); assert.ok(samples.every(s => JSON.stringify(s.sample) === JSON.stringify(s.plot)));
      const mix = page.getByRole('figure', { name: 'Composição Stone × PIX', exact: true });
      const reading = mix.getByRole('region', { name: 'Leitura do recorte' });
      await expect(reading).toContainText('04/2026 a 09/2026');
      await expect(reading).toContainText('Todas as unidades autorizadas');
      await expect(reading).toContainText('R$ 1.380.000,00');
      const mixColors = await mix.evaluate(el => [...el.querySelectorAll('.sales-swatch')].map((swatch, i) => getComputedStyle(swatch).backgroundColor === getComputedStyle(el.querySelectorAll('.sales-mix-bar > span')[i]).backgroundColor));
      assert.deepEqual(mixColors, [true, true]);
      await daily.screenshot({ path: `${directory}/daily-${width}.png` });
      await mix.screenshot({ path: `${directory}/mix-${width}.png` });
      await daily.scrollIntoViewIfNeeded();
      const scrollBefore = await page.evaluate(() => {
        window.__ven04bMain = [...document.querySelectorAll('.sales-kpis > *, .sales-analysis-grid > *, .sales-insights, .sales-heat-cell')];
        return scrollY;
      });
      const calls = requests.filter(r => r.path.endsWith('/sales_dashboard')).length;
      pendingDaily = new Promise(resolve => { releaseDaily = resolve; });
      await page.getByLabel('Competência do gráfico', { exact: true }).selectOption('2026-07');
      await expect(page.getByText('Carregando competência diária…')).toBeVisible();
      assert.ok(await page.evaluate(() => window.__ven04bMain.every(el => el.isConnected)));
      releaseDaily();
      await expect(daily.getByText('Jul/2026 — observado', { exact: true })).toBeVisible();
      await expect(daily.getByText('Jun/2026 — referência', { exact: true })).toBeVisible();
      await expect(daily.locator('.sales-projection')).toHaveCount(0);
      assert.equal(requests.filter(r => r.path.endsWith('/sales_dashboard')).length, calls + 1);
      assert.deepEqual(requests.filter(r => r.path.endsWith('/sales_dashboard')).at(-1).filters,
        { p_from: '2026-04-01', p_to: '2026-09-01', p_units: null, p_scope: 'stone', p_daily_month: '2026-07-01' });
      assert.ok(Math.abs(await page.evaluate(() => scrollY) - scrollBefore) <= 2, 'Troca diária preserva scroll');
      // Enquadra a captura abaixo do breadcrumb fixo, após verificar o scroll real.
      await daily.evaluate(el => window.scrollTo({ top: scrollY + el.getBoundingClientRect().top - 80, behavior: 'instant' }));
      await daily.screenshot({ path: `${directory}/daily-changed-${width}.png` });
      await expect(page).toHaveURL(/daily=2026-07/);
      await page.reload(); await expect(daily.getByText('Jul/2026 — observado', { exact: true })).toBeVisible();
      await page.goBack(); await expect(page.getByLabel('Competência do gráfico', { exact: true })).toHaveValue('2026-09');
      await page.goForward(); await expect(daily.getByText('Jul/2026 — observado', { exact: true })).toBeVisible();
      checks.push(`${width}: controles equivalentes a Lançamentos, legendas com estilos idênticos, cores do mix, diário independente, scroll, reload, Voltar/Avançar`);
      const contrast = await page.evaluate(() => {
        const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
        const luminance = color => {
          ctx.clearRect(0,0,1,1); ctx.fillStyle = color; ctx.fillRect(0,0,1,1);
          const rgb = Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3).map(c => { const s = c / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
          return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
        };
        return [".sales-chart-scroll svg text", ".sales-heat-cell", ".sales-insight h3", ".sales-kpis .metric-label"].map(selector => {
          const ratios = Array.from(document.querySelectorAll(selector)).map(el => {
            const style = getComputedStyle(el), front = luminance(el instanceof SVGElement ? style.fill : style.color);
            const back = luminance(el.matches(".sales-heat-cell") ? style.backgroundColor : "white");
            return (Math.max(front,back) + .05) / (Math.min(front,back) + .05);
          });
          return { selector, samples: ratios.length, minimum: Math.min(...ratios) };
        });
      });
      writeFileSync(`${directory}/contrast-${width}.json`, JSON.stringify(contrast,null,2));
      assert.ok(contrast.every(sample => sample.samples > 0 && sample.minimum >= 4.5), "Contraste das amostras ≥4,5:1");
      checks.push(`${width}: quatro KPIs, três insights, três gráficos com 310px, reduced-motion e ausência de overflow externo`);
      if (width === 1440) {
        await page.screenshot({ path: `${directory}/overview-1440.png`, animations: "disabled" });
        await page.getByRole("figure", { name: /^Evolução mensal/ }).screenshot({ path: `${directory}/evolution-1440.png` });
        await page.getByRole("figure", { name: /^Composição mensal por unidade/ }).screenshot({ path: `${directory}/stacked-1440.png` });
      }
    }
  }
  if (!baseline) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const figure = page.getByRole("figure", { name: /^Evolução mensal/ });
    const point = figure.getByRole("button", { name: /Focar competência 04/ });
    await point.focus(); await expect(page.getByRole("tooltip")).toBeVisible();
    await page.screenshot({ path: `${directory}/tooltip-keyboard.png` });
    await page.keyboard.press("Escape"); await expect(page.getByRole("tooltip")).toHaveCount(0);
    const before = requests.filter(r => r.path.endsWith("/sales_dashboard")).length;
    const legend = page.getByRole("group", { name: "Séries das barras empilhadas" });
    await legend.getByRole("button", { name: /Unidade Alfa/ }).click();
    await expect(legend.getByRole("button", { name: /Unidade Alfa/ })).toHaveAttribute("aria-pressed", "false");
    assert.equal(requests.filter(r => r.path.endsWith("/sales_dashboard")).length, before);
    await legend.getByRole("button", { name: /Unidade Alfa/ }).click();
    await page.getByRole("radio", { name: "Stone + PIX", exact: true }).check();
    await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
    await expect(page).toHaveURL(/scope=combined/);
    await expect(page.getByLabel("Indicadores executivos")).toContainText("R$ 1.656.000,00");
    await page.reload(); await expect(page.getByRole("radio", { name: "Stone + PIX", exact: true })).toBeChecked();
    await expect(page.getByLabel("Indicadores executivos")).toContainText("R$ 1.656.000,00");
    checks.push("Tooltip por foco/Escape; legenda sem RPC; combinado exato, URL e reload");
    await page.goto(base + "/sales/dashboard?from=2026-04&to=2026-09");
    const startMonth = page.getByLabel('Mês da competência inicial');
    await startMonth.focus(); await page.keyboard.press('ArrowDown'); await expect(startMonth).toHaveValue('05');
    for (const month of ['09','11','12']) {
      await startMonth.selectOption(month);
      const fits = await startMonth.evaluate(el => {
        const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'), style = getComputedStyle(el);
        ctx.font = style.font;
        return ctx.measureText(el.selectedOptions[0].text).width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 18 <= el.clientWidth;
      });
      assert.ok(fits, `Nome do mês ${month} legível sem compressão`);
    }
    await startMonth.selectOption('04');
    const stoneRadio = page.getByRole('radio', { name: 'Stone', exact: true });
    await stoneRadio.focus(); await page.keyboard.press('ArrowRight'); await expect(page.getByRole('radio', { name: 'Stone + PIX', exact: true })).toBeChecked();
    await page.keyboard.press('ArrowLeft'); await expect(stoneRadio).toBeChecked();
    await page.setViewportSize({ width: 720, height: 500 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Sem overflow no reflow equivalente a 200% em 1440px');
    await page.locator('.sales-dashboard-filters').screenshot({ path: `${directory}/toolbar-zoom-200.png` });
    await page.setViewportSize({ width: 1440, height: 1000 });
    checks.push('Seletores/radios por teclado; reflow em 720px equivalente a 200% de 1440px sem overflow (zoom nativo não automatizado)');
    stress = true;
    for (const width of [1440,375]) {
      await page.setViewportSize({ width, height: 1000 }); await page.reload();
      await expect(page.getByLabel("Indicadores executivos")).toContainText("R$ 9.007.199.254.740.993,01");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: `${directory}/long-values-${width}.png`, fullPage: true, animations: "disabled" });
      await page.goto(base + `/sales/dashboard?from=2026-04&to=2026-09&unit=${A}`);
      const focusedReading = page.getByRole('region', { name: 'Leitura do recorte' });
      await expect(focusedReading).toContainText('Unidade sintética com denominação extensa');
      await expect(focusedReading).toContainText('R$ 9.007.199.254.740.993,01');
      await expect(focusedReading).not.toContainText('Histórica Beta');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.getByRole('figure', { name: 'Composição Stone × PIX', exact: true }).screenshot({ path: `${directory}/mix-long-values-${width}.png` });
      await page.goto(base + '/sales/dashboard?from=2026-04&to=2026-09');
    }
    stress = false;
    checks.push("Nomes extensos e total além de MAX_SAFE_INTEGER em 1440/375 sem overflow externo");
  }
  if (process.env.VEN04B_REFERENCE_DIR) {
    const reference = process.env.VEN04B_REFERENCE_DIR;
    const legacy = await context.newPage();
    await legacy.route("**/*", route => route.abort());
    await legacy.setContent(readFileSync(`${reference}/index.html`, "utf8").replace(/<link[^>]+>/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<img[^>]+>/g, ""));
    for (const file of ["styles.css", "dashboard-full.css", "brand.css"]) await legacy.addStyleTag({ content: readFileSync(`${reference}/${file}`, "utf8") });
    await legacy.addScriptTag({ content: readFileSync(`${reference}/app.js`, "utf8").replace(/init\(\);\s*$/, "") });
    await legacy.addScriptTag({ content: readFileSync(`${reference}/dashboard-enhancements.js`, "utf8") });
    await legacy.evaluate(d => {
      const names = new Map(d.units.map(u => [u.id, `${u.code} · ${u.name}`]));
      const months = d.months.map(m => ({ key: m.competency.slice(0,7), label: `${m.competency.slice(5,7)}/${m.competency.slice(0,4)}`, partial: m.partial, daysInMonth: m.days_in_month, lastDayWithData: m.last_day_with_data,
        stone: Object.fromEntries(d.unit_months.filter(c => c.competency === m.competency).map(c => [names.get(c.unit_id), c.stone])),
        pix: Object.fromEntries(d.unit_months.filter(c => c.competency === m.competency).map(c => [names.get(c.unit_id), c.pix])),
        daily: Array.from({ length: m.last_day_with_data }, (_, i) => {
          const decimal = n => `${n / 100n}.${String(n % 100n).padStart(2,"0")}`;
          const distribute = value => {
            const total = BigInt(value.replace(".", "")), perDay = total / BigInt(m.last_day_with_data);
            const dayTotal = i === m.last_day_with_data - 1 ? total - perDay * BigInt(i) : perDay;
            const first = dayTotal * 3n / 5n;
            return { [names.get(d.units[0].id)]: decimal(first), [names.get(d.units[1].id)]: decimal(dayTotal - first) };
          };
          return { day: i + 1, stone: distribute(m.stone), pix: distribute(m.pix) };
        }) }));
      // Renderização original com dados sintéticos equivalentes; nenhuma chamada ao backend legado.
      globalThis.__legacyData = { months, units: [...names.values()], metadata: { latestData: "2026-09-15" } };
    }, visualFixture(dashboardFixture()));
    await legacy.evaluate("state.dashboard = globalThis.__legacyData; state.start = state.dashboard.months[0].key; state.end = state.dashboard.months.at(-1).key; renderDashboard();");
    for (const width of [1440,1024,768,375]) {
      await legacy.setViewportSize({ width, height: 1000 });
      await legacy.screenshot({ path: `${directory}/reference-${width}.png`, fullPage: true, animations: "disabled" });
    }
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${directory}/result.json`, JSON.stringify({ baseline: baseline ?? "worktree", widths: [1440,1024,768,375], filterComparisons, checks, errors, transport: "Auth/RPC interceptados, nenhuma escrita no banco" }, null, 2));
  console.log("Screenshots PASS", directory);
} catch (error) { console.log("Page errors:", errors); throw error; } finally { await browser?.close(); await server?.close(); await baselineServer?.close(); }
