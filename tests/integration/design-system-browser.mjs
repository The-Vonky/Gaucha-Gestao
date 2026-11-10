import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { createServer } from "vite";

// Galeria isolada do Design System em Chromium real: contraste calculado pelo navegador,
// teclado, responsividade, movimento reduzido e troca de marca/modo sem recarregar.
// Sem backend, Auth ou dados. Capturas opcionais: DS_ARTIFACT_DIR=<pasta>.
// CHROMIUM_PATH permite usar um Chromium já instalado com outra versão do Playwright.
const artifactDir = process.env.DS_ARTIFACT_DIR;
const brands = ["hub", "empresa-a", "empresa-b"];
let browser, server, phase = "iniciar servidor";
try {
  server = await createServer({ configFile: "apps/web/vite.config.ts", root: "apps/web", logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}/design-system/`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  if (artifactDir) await mkdir(artifactDir, { recursive: true });
  const requests = [];
  const open = async (query, options = {}) => {
    const context = await browser.newContext({ locale: "pt-BR", viewport: { width: 1440, height: 900 }, ...options });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("request", (r) => !r.url().startsWith(base.replace("/design-system/", "")) && !r.url().startsWith("data:") && requests.push(r.url()));
    await page.goto(`${base}${query}`);
    await page.locator(".ds-section").first().waitFor();
    return { page, context, errors };
  };
  const summary = (page) => page.getByTestId("contrast-summary").innerText();

  for (const brand of brands)
    for (const mode of ["light", "dark"]) {
      phase = `contraste ${brand}/${mode}`;
      const { page, context, errors } = await open(`?brand=${brand}&mode=${mode}`);
      assert.equal(await page.locator(".hub-theme").getAttribute("data-theme"), mode);
      const text = await summary(page);
      const [, ok, total] = /(\d+) de (\d+)/.exec(text) ?? [];
      assert.ok(Number(total) >= 28 && ok === total, `${brand}/${mode}: ${text}`);
      if (artifactDir) {
        await page.screenshot({ path: `${artifactDir}/${brand}-${mode}-1440.png` });
        await page.locator("#botoes").evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
        await page.screenshot({ path: `${artifactDir}/${brand}-${mode}-componentes-1440.png` });
      }
      assert.deepEqual(errors, [], `Sem erros de console em ${brand}/${mode}`);
      await context.close();
    }

  phase = "troca em tempo real sem recarregar";
  {
    const { page, context } = await open("?brand=hub&mode=light");
    await page.evaluate(() => (window.__semRecarga = true));
    await page.getByRole("group", { name: "Marca da organização" }).getByRole("radio", { name: "Empresa B" }).check();
    await page.getByRole("group", { name: "Modo de cor" }).getByRole("radio", { name: "Escuro" }).check();
    assert.equal(await page.locator(".hub-theme").getAttribute("data-brand"), "empresa-b");
    assert.equal(await page.locator(".hub-theme").getAttribute("data-theme"), "dark");
    assert.equal(await page.evaluate(() => window.__semRecarga), true, "A página não foi recarregada");
    assert.match(page.url(), /brand=empresa-b&mode=dark/);
    const action = await page.locator(".hub-theme").evaluate((el) => getComputedStyle(el).getPropertyValue("--color-action").trim());
    assert.equal(action, "#3fb584", "Ação primária escura da Empresa B");
    await context.close();
  }

  phase = "modo automático segue o sistema";
  {
    const { page, context } = await open("?mode=system", { colorScheme: "dark" });
    assert.equal(await page.locator(".hub-theme").getAttribute("data-theme"), "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForFunction(() => document.querySelector(".hub-theme").dataset.theme === "light");
    await context.close();
  }

  phase = "teclado";
  {
    const { page, context } = await open("?brand=empresa-a&mode=light");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.textContent), "Pular para o conteúdo");
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => document.activeElement.id), "ds-main");
    await page.goto(`${base}?brand=empresa-a&mode=light`);
    const missing = [];
    let visited = 0;
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        // Radios visually hidden: the indicator is on the sibling span.
        const target = el.matches(".segmented-option input") ? el.nextElementSibling : el;
        const s = getComputedStyle(target);
        const visible = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2) || (s.boxShadow !== "none" && s.boxShadow.includes("0px 0px 0px"));
        return { name: `${el.tagName.toLowerCase()} ${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40)}`, visible };
      });
      if (!info) continue;
      visited++;
      if (!info.visible) missing.push(info.name);
    }
    assert.ok(visited >= 60, `Percorridos ${visited} elementos por Tab`);
    assert.deepEqual(missing, [], "Todo elemento focado tem indicador visível");
    // Setas trocam a marca dentro do grupo de rádio.
    await page.getByRole("group", { name: "Marca da organização" }).getByRole("radio").nth(1).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator(".hub-theme").getAttribute("data-brand"), "empresa-b");
    // Diálogo: foco interno, Esc fecha e devolve o foco.
    const opener = page.getByRole("button", { name: "Abrir formulário" });
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Nova solicitação" });
    await dialog.waitFor();
    assert.ok(await dialog.evaluate((d) => d.contains(document.activeElement)), "Foco dentro do diálogo");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await opener.evaluate((b) => b === document.activeElement), true, "Foco volta ao acionador");
    await context.close();
  }

  phase = "responsividade";
  for (const brand of brands) {
    const { page, context } = await open(`?brand=${brand}&mode=${brand === "empresa-a" ? "dark" : "light"}`);
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${brand}: sem overflow horizontal em ${width}px`);
      if (width < 1024) {
        const small = await page.evaluate(() =>
          [...document.querySelectorAll("main button, .segmented-option span, .ds-sidebar a")]
            .filter((el) => el.getBoundingClientRect().width > 0 && !el.closest("dialog"))
            .filter((el) => el.getBoundingClientRect().height < 43.5)
            .map((el) => el.textContent.trim()),
        );
        assert.deepEqual(small, [], `${brand}: alvos de toque ≥44px em ${width}px`);
      }
    }
    if (artifactDir) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: `${artifactDir}/${brand}-mobile-390.png` });
    }
    await context.close();
  }

  phase = "movimento reduzido";
  {
    const { page, context } = await open("?brand=hub&mode=light", { reducedMotion: "reduce" });
    assert.match(await page.locator(".ds-facts").innerText(), /Movimento reduzido: ativo/);
    await page.getByRole("button", { name: "Abrir formulário" }).click();
    const dialog = page.getByRole("dialog", { name: "Nova solicitação" });
    await dialog.waitFor();
    const durations = await page.evaluate(() => ({
      dialog: getComputedStyle(document.querySelector("dialog[open]")).animationDuration,
      button: getComputedStyle(document.querySelector("button.primary")).transitionDuration.split(",")[0],
      loader: getComputedStyle(document.querySelector(".loader .org-mark")).animationName,
      scroll: getComputedStyle(document.documentElement).scrollBehavior,
    }));
    assert.ok(parseFloat(durations.dialog) <= 0.00001, `Diálogo sem animação: ${durations.dialog}`);
    assert.ok(parseFloat(durations.button) <= 0.00001, `Botão sem transição: ${durations.button}`);
    assert.equal(durations.loader, "none");
    assert.equal(durations.scroll, "auto");
    await context.close();
  }
  assert.deepEqual(requests, [], "A galeria não acessa hosts externos");
  console.log("Design System: contraste AA (3 marcas × 2 modos), teclado, responsividade, movimento reduzido e troca ao vivo aprovados.");
} catch (error) {
  console.error(`Falha na fase: ${phase}`);
  throw error;
} finally {
  await browser?.close();
  await server?.close();
}
