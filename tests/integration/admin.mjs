import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";
import { chromium } from "playwright";

// Administration UI (Quality UI v1 phase 3 polish) against real Supabase Auth,
// PostgREST and PostgreSQL. Only the disposable Supabase CLI cluster is supported.
// Adds uniquely tagged rows only; no reset needed. ADMIN_SCREENSHOTS=<dir> saves pages.
const config = JSON.parse(
  execFileSync("npx", ["--yes", "supabase@2.117.0", "status", "-o", "json"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  }),
);
for (const url of [config.API_URL, config.DB_URL])
  assert.equal(new URL(url).hostname, "127.0.0.1");
const shots = process.env.ADMIN_SCREENSHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const db = new pg.Client({ connectionString: config.DB_URL });
await db.connect();
const tag = randomUUID().slice(0, 8);
const password = `Local-${randomUUID()}-aA1!`;
const LONG_NAME = `Maria Aparecida dos Santos Albuquerque Figueiredo ${tag}`;
const LONG_UNIT = `Cozinha Central Industrial de Refeições Coletivas ${tag}`;
async function authUser(name) {
  const email = `admin-ui-${name}-${tag}@example.test`;
  const res = await fetch(`${config.API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: config.SERVICE_ROLE_KEY,
      Authorization: `Bearer ${config.SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  assert.equal(res.status, 200);
  return { id: (await res.json()).id, email };
}
let server;
let browser;
const outDir = mkdtempSync(join(tmpdir(), "admin-e2e-"));
try {
  const admin = await authUser("admin");
  const other = await authUser("other");
  await db.query("update core.profiles set display_name=$2 where id=$1", [
    admin.id,
    `Admin UI ${tag}`,
  ]);
  await db.query("update core.profiles set display_name=$2 where id=$1", [
    other.id,
    LONG_NAME,
  ]);
  await db.query(
    "insert into core.user_role_assignments(user_id,role_id,scope_type) select $1,id,'global' from core.roles where key='platform_administrator'",
    [admin.id],
  );
  const unit = randomUUID();
  const sector = randomUUID();
  await db.query("insert into core.units(id,code,name) values ($1,$2,$3)", [
    unit,
    `ADM-${tag}`,
    LONG_UNIT,
  ]);
  await db.query("insert into core.sectors(id,code,name) values ($1,$2,$3)", [
    sector,
    `SET-${tag}`,
    `Estoque ${tag}`,
  ]);
  await db.query(
    "insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id) select $1,id,'unit',$2 from core.roles where key='quality'",
    [other.id, unit],
  );

  // ------------------------------------------------------------ Real bundle
  const port = await new Promise((done, fail) => {
    const probe = createServer();
    probe.once("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  const vite = (args, stdio) =>
    spawn(
      process.execPath,
      [resolve("node_modules/vite/bin/vite.js"), ...args],
      {
        cwd: "apps/web",
        env: {
          ...process.env,
          VITE_SUPABASE_URL: config.API_URL,
          VITE_SUPABASE_PUBLISHABLE_KEY: config.ANON_KEY,
        },
        stdio,
      },
    );
  const build = vite(["build", "--outDir", outDir, "--emptyOutDir"], "inherit");
  assert.equal(await new Promise((r) => build.on("exit", r)), 0);
  server = vite(
    [
      "preview",
      "--outDir",
      outDir,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    ["ignore", "pipe", "pipe"],
  );
  const deadline = Date.now() + 60000;
  for (;;) {
    try {
      const res = await fetch(origin);
      if (res.ok && (await res.text()).includes('id="root"')) break;
    } catch {
      /* Not listening yet. */
    }
    if (Date.now() > deadline) throw Error("Preview server not ready");
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch();

  const noOverflow = async (page, what) =>
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `Page overflow: ${what}`,
    );
  /** Every visible enabled control in `scope` meets the target for this width.
   * A native checkbox/radio is targeted through its label, which toggles it. */
  const targets = async (page, scope, width, what) => {
    // Measure the settled UI, not the dialog entrance scale (0.985), which can
    // make a correct 44px target temporarily render at ~43.3px.
    await page.evaluate(async () => {
      const animations = document.getAnimations().filter(
        (animation) => animation.effect?.getComputedTiming().iterations !== Infinity,
      );
      await Promise.all(
        animations.map((animation) => animation.finished.catch(() => undefined)),
      );
    });
    const min = width < 1024 ? 44 : 32;
    const small = await page.locator(scope).evaluateAll(
      (els, min) =>
        els
          .filter((e) => e.getClientRects().length && !e.disabled)
          .map((e) => [
            e.textContent.trim() ||
              e.getAttribute("aria-label") ||
              e.closest("label")?.textContent.trim(),
            (/^(checkbox|radio)$/.test(e.type) && e.closest("label")) ||
              e,
          ])
          .map(([n, e]) => [n, e.getBoundingClientRect()])
          .filter(
            ([, r]) =>
              Math.round(r.height) < min || Math.round(r.width) < min - 12,
          )
          .map(
            ([n, r]) => `${n} ${Math.round(r.width)}x${Math.round(r.height)}`,
          ),
      min,
    );
    assert.deepEqual(small, [], `Small targets (${what} @${width})`);
  };
  const dialogFits = async (page, width, height, what) => {
    const box = await page.getByRole("dialog").boundingBox();
    assert.ok(
      box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= width + 0.5 &&
        box.y + box.height <= height + 0.5,
      `Dialog outside viewport (${what}): ${JSON.stringify(box)}`,
    );
    await noOverflow(page, `${what} dialog`);
  };
  /** Walk the pager (shown only for more than one page) until `target` is on screen. */
  const reach = async (page, target) => {
    const pager = page.getByRole("navigation", { name: "Paginação" });
    const first = () =>
      page.evaluate(() => document.querySelector("main li")?.textContent);
    for (let n = 1; !(await target.count()); n++) {
      assert.ok(n < 40, "Row not found on any page");
      const before = await first();
      await pager.getByRole("button", { name: "Próxima" }).click();
      // The pager label changes before the rows load: wait for new rows.
      await page.waitForFunction(
        ([b, n]) =>
          !document.body.innerText.includes("Carregando") &&
          document
            .querySelector('nav[aria-label="Paginação"] span')
            ?.textContent?.includes(`Página ${n} de `) &&
          document.querySelector("main li")?.textContent !== b,
        [before, n + 1],
      );
    }
  };
  const settle = (page) =>
    page
      .getByText("Carregando", { exact: false })
      .first()
      .waitFor({ state: "hidden" });

  for (const [width, height] of [
    [375, 812],
    [768, 1024],
    [1024, 768],
    [1440, 900],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: width < 1024,
    });
    const page = await context.newPage();
    page.on("dialog", () => assert.fail("Native dialog opened"));
    await page.goto(origin);
    await page.getByLabel(/E-mail/i).fill(admin.email);
    await page.getByLabel(/^Senha$/i).fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.getByLabel(/^Senha$/i).waitFor({ state: "detached" });
    const visit = async (route, name) => {
      await page.goto(`${origin}${route}`);
      await page.locator("h1").waitFor();
      await settle(page);
      await noOverflow(page, route);
      await targets(page, "main button, main select, main input", width, route);
      if (shots)
        await page.screenshot({
          path: join(shots, `${name}-${width}.png`),
          fullPage: true,
        });
    };

    // Users: readable list, diagnostic UUID in assignments, no self toggle.
    await visit("/admin/users", "users");
    const row = page.getByRole("listitem").filter({ hasText: LONG_NAME });
    await reach(page, row);
    await noOverflow(page, "users page with long name");
    assert.equal(await row.locator("code", { hasText: other.id }).count(), 0);
    assert.equal(
      await row.getByRole("button", { name: `Desativar ${LONG_NAME}` }).count(),
      1,
    );
    // Keyboard: focus + Enter opens the assignments dialog with focus inside.
    await row
      .getByRole("button", { name: `Atribuições de ${LONG_NAME}` })
      .focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Atribuições vigentes").waitFor();
    await dialog.getByText(LONG_UNIT).waitFor();
    const id = dialog.locator("code", { hasText: other.id });
    assert.ok(
      await id.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      "Diagnostic UUID must wrap in the assignments dialog",
    );
    assert.ok(
      await page.evaluate(() =>
        document.activeElement?.closest("dialog")?.hasAttribute("open"),
      ),
      "Focus moves into the dialog",
    );
    await dialogFits(page, width, height, "assignments");
    await targets(page, "dialog button, dialog select", width, "assignments");
    if (shots)
      await page.screenshot({ path: join(shots, `assignments-${width}.png`) });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });

    // Roles: system role opens read-only.
    await visit("/admin/roles", "roles");
    const system = page.getByRole("button", {
      name: "Consultar Platform Administrator",
    });
    await reach(page, system);
    await system.click();
    await page.getByText("Somente consulta.").waitFor();
    assert.equal(
      await page.getByRole("dialog").getByRole("checkbox").count(),
      0,
    );
    await dialogFits(page, width, height, "system role");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Novo perfil" }).click();
    await page.getByRole("dialog").getByRole("checkbox").first().waitFor();
    await dialogFits(page, width, height, "new role");
    if (shots)
      await page.screenshot({ path: join(shots, `role-editor-${width}.png`) });
    await page.keyboard.press("Escape");

    // Permissions: read-only catalog grouped by domain, on one screen (no buttons).
    await visit("/admin/permissions", "permissions");
    assert.deepEqual(await page.locator("main button").allTextContents(), []);
    await page
      .locator("main")
      .getByRole("heading", { name: /^Administração/ })
      .waitFor();

    // Units and sectors.
    await visit("/admin/units", "units");
    await visit("/admin/sectors", "sectors");
    const sectorRow = page
      .getByRole("listitem")
      .filter({ hasText: `Estoque ${tag}` });
    await reach(page, sectorRow);
    await sectorRow.getByRole("button", { name: /^Unidades de/ }).click();
    await page.getByText(/unidades? vinculadas?/).waitFor();
    await dialogFits(page, width, height, "sector units");
    await targets(page, "dialog button", width, "sector units");
    await page.keyboard.press("Escape");

    // Logs: filter bar, rows and JSON details that never widen the page.
    await visit("/admin/logs", "logs");
    await page.getByLabel("Módulo").selectOption("core");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await page.getByText("1 filtro aplicado").waitFor();
    await settle(page);
    await page
      .getByRole("button", { name: /^Detalhes:/ })
      .first()
      .click();
    const details = page.getByRole("dialog");
    const json = details.getByRole("region", { name: "Depois" });
    await json.waitFor();
    assert.ok(
      await json.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      "JSON wraps inside its region",
    );
    await dialogFits(page, width, height, "log details");
    if (shots)
      await page.screenshot({ path: join(shots, `log-details-${width}.png`) });
    await page.keyboard.press("Escape");
    await context.close();
  }

  // ------------------------------------------------ Real CRUD through the UI
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(origin);
  await page.getByLabel(/E-mail/i).fill(admin.email);
  await page.getByLabel(/^Senha$/i).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByLabel(/^Senha$/i).waitFor({ state: "detached" });
  // The signed-in administrator never gets an activation toggle on their own row.
  await page.goto(`${origin}/admin/users`);
  await settle(page);
  const self = page
    .getByRole("listitem")
    .filter({ hasText: `Admin UI ${tag}` });
  await reach(page, self);
  await self.getByText("Você").waitFor();
  assert.equal(
    await self.getByRole("button", { name: /Desativar|Ativar/ }).count(),
    0,
  );
  await page.goto(`${origin}/admin/units`);
  await settle(page);
  await page.getByRole("button", { name: "Nova unidade" }).tap();
  const code = `NEW-${tag}`;
  await page.getByLabel("Código").fill(code);
  await page.getByLabel("Nome").fill(`Unidade Nova ${tag}`);
  await page.getByRole("button", { name: "Salvar" }).tap();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  const created = (
    await db.query("select id,active from core.units where code=$1", [code])
  ).rows[0];
  assert.equal(created.active, true);
  // The search matches the business code or the name, case-insensitively, and
  // treats LIKE wildcards and filter delimiters literally.
  await page.goto(`${origin}/admin/units`);
  await settle(page);
  for (const term of [code.toLowerCase(), `unidade nova ${tag}`]) {
    await page.getByRole("searchbox").fill(term);
    await page
      .getByRole("list", { name: "Unidades" })
      .getByText(`Unidade Nova ${tag}`)
      .waitFor();
    await page.getByText("1 unidade ativa").waitFor();
  }
  await page.getByRole("searchbox").fill(`${tag},%_\\"()`);
  await page.getByText("Nenhuma unidade encontrada").waitFor();
  // Deactivation needs the application dialog; cancelling does not mutate.
  await page.goto(`${origin}/admin/units`);
  await settle(page);
  const deactivate = page.getByRole("button", {
    name: `Desativar Unidade Nova ${tag}`,
  });
  await reach(page, deactivate);
  await deactivate.tap();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar" })
    .tap();
  assert.equal(
    (await db.query("select active from core.units where id=$1", [created.id]))
      .rows[0].active,
    true,
  );
  await deactivate.tap();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar" })
    .tap();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(
    (await db.query("select active from core.units where id=$1", [created.id]))
      .rows[0].active,
    false,
  );
  // The change is logged and readable in Logs with the actor.
  await page.goto(`${origin}/admin/logs`);
  await page.getByLabel("Ator (UUID)").fill(admin.id);
  await page.getByRole("button", { name: "Filtrar" }).tap();
  await settle(page);
  await page
    .getByRole("button", { name: /^Detalhes:/ })
    .first()
    .tap();
  const actor = page
    .getByRole("dialog")
    .locator("dt", { hasText: /^Ator$/ })
    .locator("xpath=following-sibling::dd");
  assert.equal((await actor.textContent()).trim(), admin.id);
  await noOverflow(page, "actor log details");
  console.log(
    "PASS admin UI at 375/768/1024/1440: no page overflow, touch targets, UUID wrap, self toggle hidden, keyboard dialog, system role read-only, read-only permissions, sector links, log filters and wrapped JSON; create/deactivate with confirm/cancel and actor log",
  );
} finally {
  await browser?.close();
  server?.kill();
  rmSync(outDir, { recursive: true, force: true });
  await db.end();
}
