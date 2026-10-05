import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { assert, config, db, password, users, BUCKET, PDF, bytes, blob, must, fails, api, list, row, inspection, fill, begin, upload, confirm, attach, countEvents, state, service } from "./audit-evidence-fixture.mjs";

export async function runBrowser() {
  state.phase = "Chromium real file flow";
  // Chromium against the compiled application and real local API at desktop and 375px.
  const port = await new Promise((done, fail) => {
    const probe = createServer();
    probe.once("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      const assigned = probe.address().port;
      probe.close(() => done(assigned));
    });
  });
  const origin = "http://127.0.0.1:" + port;
  const outDir = mkdtempSync(join(tmpdir(), "audit-evidence-e2e-"));
  const vite = (args, stdio) => spawn(process.execPath, [resolve("node_modules/vite/bin/vite.js"), ...args], {
    cwd: "apps/web",
    env: { ...process.env, VITE_SUPABASE_URL: config.API_URL, VITE_SUPABASE_PUBLISHABLE_KEY: config.ANON_KEY },
    stdio,
  });
  const build = vite(["build", "--outDir", outDir, "--emptyOutDir"], "inherit");
  assert.equal(await new Promise((done) => build.on("exit", done)), 0, "Build real browser fixture");
  const server = vite(["preview", "--outDir", outDir, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], "ignore");
  let browser;
  try {
    const deadline = Date.now() + 60000;
    for (;;) {
      try { if ((await fetch(origin)).ok) break; } catch { /* preview starting */ }
      if (Date.now() > deadline) throw Error("Local preview did not become ready");
      await new Promise((done) => setTimeout(done, 100));
    }
    browser = await chromium.launch();
    for (const width of [1280, 375]) {
      const context = await browser.newContext({ viewport: { width, height: 812 }, hasTouch: width === 375, acceptDownloads: true });
      const page = await context.newPage();
      page.on("dialog", () => assert.fail("Removal must use the application dialog"));
      page.on("popup", () => assert.fail("Download must use a same-tab attachment"));
      await page.goto(origin);
      await page.getByLabel(/E-mail/i).fill(users.uiEmail);
      await page.getByLabel(/^Senha$/i).fill(password);
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await page.getByLabel(/^Senha$/i).waitFor({ state: "detached" });
      const uiInspection = await inspection();
      await page.goto(origin + "/audit/inspections/" + uiInspection + "/checklist");
      const section = page.getByRole("region", { name: "Evidências do critério 1", exact: true });
      await section.waitFor();
      const add = section.getByRole("button", { name: "Anexar arquivo ao critério 1", exact: true });
      await add.focus();
      assert.equal(await add.evaluate((element) => element === document.activeElement), true, "Add is keyboard-focusable");
      const input = section.locator('input[type="file"]');
      assert.ok((await input.getAttribute("aria-label")) || (await input.getAttribute("id") &&
        await section.locator('label[for="' + await input.getAttribute("id") + '"]').count()), "File input has an accessible label");
      const name = "Relatório_" + "critério_longo_".repeat(9) + ".pdf";
      await input.setInputFiles({ name, mimeType: PDF, buffer: bytes });
      const file = section.locator(".audit-evidence-list .file-item").filter({ hasText: name });
      await file.waitFor();
      const downloadButton = file.getByRole("button", { name: "Baixar " + name, exact: true });
      const removeButton = file.getByRole("button", { name: "Remover " + name, exact: true });
      await downloadButton.waitFor();
      assert.equal(await downloadButton.isEnabled(), true);
      assert.equal(await removeButton.isEnabled(), true);
      assert.equal(await file.locator("img,iframe,object,embed,video,canvas").count(), 0, "Evidence has no inline preview");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Evidence fits viewport");
      await downloadButton.focus();
      assert.equal(await downloadButton.evaluate((element) => element === document.activeElement), true);
      const [downloaded] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
      assert.equal(downloaded.suggestedFilename(), name);
      assert.ok(readFileSync(await downloaded.path()).equals(bytes), "Browser download original bytes");
      assert.equal(page.url(), origin + "/audit/inspections/" + uiInspection + "/checklist", "Download retains current route");
      const available = await list("ui", uiInspection);
      assert.equal(available.length, 1);
      assert.equal(available[0].original_name, name);
      // Change a response through the API: existing evidence stays independent.
      must(await api("ui").from("inspection_answers").update({ response: "NAT" }).eq("inspection_id", uiInspection).eq("item_key", "item-001"));
      assert.equal((await list("ui", uiInspection)).length, 1);

      await removeButton.click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= 812, "Removal dialog fits");
      assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true, "Dialog receives focus");
      assert.ok(await dialog.evaluate((element)=>element.scrollWidth<=element.clientWidth), "Long filename causes no dialog horizontal overflow");
      await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
      await dialog.waitFor({ state: "detached" });
      await removeButton.click();
      await dialog.getByRole("button", { name: "Confirmar", exact: true }).click();
      await file.waitFor({ state: "detached" });
      assert.deepEqual(await list("ui", uiInspection), []);

      // Lost upload response: actual bytes were stored; retry reuses the pending ID/key (409 -> confirm).
      let loseUpload = true;
      await page.route("**/storage/v1/object/audit-checklist-evidence/**", async (route) => {
        if (loseUpload && route.request().method() === "POST") {
          loseUpload = false;
          await route.fetch();
          await route.abort("failed");
        } else await route.continue();
      });
      await input.setInputFiles({ name: "upload retry.pdf", mimeType: PDF, buffer: bytes });
      await section.getByRole("button", { name: "Tentar novamente", exact: true }).waitFor();
      const uploadRetry = (await db.query("select id,object_key from audit.checklist_evidence where inspection_id=$1 and original_name=$2",
        [uiInspection, "upload retry.pdf"])).rows;
      assert.equal(uploadRetry.length, 1);
      await section.getByRole("button", { name: "Tentar novamente", exact: true }).click();
      await section.getByRole("button", { name: "Baixar upload retry.pdf", exact: true }).waitFor();
      await page.unroute("**/storage/v1/object/audit-checklist-evidence/**");
      assert.equal((await db.query("select count(*)::int n from audit.checklist_evidence where inspection_id=$1 and original_name=$2",
        [uiInspection, "upload retry.pdf"])).rows[0].n, 1);
      assert.equal(await countEvents(uploadRetry[0].id, "evidence_add"), 1);

      // Lost confirm response: actual business confirmation succeeds, retry emits no duplicate event.
      let loseConfirm = true;
      await page.route("**/rest/v1/rpc/confirm_checklist_evidence_upload", async (route) => {
        if (loseConfirm) {
          loseConfirm = false;
          await route.fetch();
          await route.abort("failed");
        } else await route.continue();
      });
      await input.setInputFiles({ name: "confirm retry.pdf", mimeType: PDF, buffer: bytes });
      await section.getByRole("button", { name: "Tentar novamente", exact: true }).waitFor();
      const confirmRetry = (await db.query("select id from audit.checklist_evidence where inspection_id=$1 and original_name=$2",
        [uiInspection, "confirm retry.pdf"])).rows;
      assert.equal(confirmRetry.length, 1);
      assert.equal(await countEvents(confirmRetry[0].id, "evidence_add"), 1);
      await section.getByRole("button", { name: "Tentar novamente", exact: true }).click();
      await section.getByRole("button", { name: "Baixar confirm retry.pdf", exact: true }).waitFor();
      await page.unroute("**/rest/v1/rpc/confirm_checklist_evidence_upload");
      assert.equal(await countEvents(confirmRetry[0].id, "evidence_add"), 1);

      // Missing actual Storage object remains a visible file with an explicit download error.
      must(await service.storage.from(BUCKET).remove([uploadRetry[0].object_key]));
      await section.getByRole("button", { name: "Baixar upload retry.pdf", exact: true }).click();
      await section.getByText("Arquivo indisponível.", { exact: true }).waitFor();
      must(await service.storage.from(BUCKET).upload(uploadRetry[0].object_key, blob(), { cacheControl: "0" }));
      // Remove retry fixtures through the real application dialog before lifecycle assertions.
      for (const retryName of ["upload retry.pdf", "confirm retry.pdf"]) {
        await section.getByRole("button", { name: "Remover " + retryName, exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Confirmar", exact: true }).click();
        await section.getByRole("button", { name: "Remover " + retryName, exact: true }).waitFor({ state: "detached" });
      }

      // Real client magic-byte and HEIC rejections do not create pending rows.
      const beforeInvalid = (await db.query("select count(*)::int n from audit.checklist_evidence where inspection_id=$1", [uiInspection])).rows[0].n;
      for (const invalid of [
        { name: "camera.heic", mimeType: "image/heic", buffer: Buffer.from("heic") },
        { name: "renamed.pdf", mimeType: PDF, buffer: Buffer.from("not a PDF") },
        { name: "foto.png", mimeType: "image/png", buffer: bytes },
      ]) {
        await input.setInputFiles(invalid);
        await section.getByRole("alert").waitFor();
      }
      assert.equal((await db.query("select count(*)::int n from audit.checklist_evidence where inspection_id=$1", [uiInspection])).rows[0].n, beforeInvalid);
      await input.setInputFiles({ name: "valid.pdf", mimeType: "", buffer: bytes });
      await section.getByRole("button", { name: "Baixar valid.pdf", exact: true }).waitFor();

      // Client normalizes the basename; v1's ZIP signature intentionally cannot prove OOXML content.
      await input.setInputFiles({ name: "e\u0301.pdf", mimeType: PDF, buffer: bytes });
      await section.getByRole("button", { name: "Baixar é.pdf", exact: true }).waitFor();
      await input.setInputFiles({
        name: "limitação.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]),
      });
      await section.getByRole("button", { name: "Baixar limitação.docx", exact: true }).waitFor();
      for (const normalizedName of ["é.pdf", "limitação.docx"]) {
        await section.getByRole("button", { name: "Remover " + normalizedName, exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Confirmar", exact: true }).click();
        await section.getByRole("button", { name: "Remover " + normalizedName, exact: true }).waitFor({ state: "detached" });
      }

      // Lifecycle UI: finalized is readable, then reopen permits a new upload.
      await fill(uiInspection);
      await page.reload();
      await section.waitFor();
      // Pending uploads from another section warn at review; concurrent available evidence causes a visible conflict.
      const hiddenPending = await begin("owner", uiInspection, "item-128", "pendente fora da seção.pdf");
      must(await upload("owner", hiddenPending.object_key));
      await page.getByRole("button", { name: "Finalizar", exact: true }).click();
      await page.getByRole("dialog").getByText(/Há envios pendentes/).waitFor();
      const remoteFile = await attach("owner", uiInspection, "item-128", "fora da seção.pdf");
      await page.getByRole("dialog").getByRole("button", { name: "Confirmar", exact: true }).click();
      await page.getByText("O conjunto de evidências foi alterado.", { exact: false }).first().waitFor();
      assert.equal((await row(uiInspection)).status, "draft", "Visible conflict never silently finalizes");
      await page.getByRole("button", { name: "Recarregar evidências e revisar", exact: true }).click();
      await section.getByRole("button", { name: "Baixar valid.pdf", exact: true }).waitFor();
      await page.getByRole("button", { name: "Finalizar", exact: true }).click();
      await page.getByRole("dialog").getByText("fora da seção.pdf", { exact: true }).waitFor();
      await page.getByRole("dialog").getByRole("button", { name: "Confirmar", exact: true }).click();
      // The finalize dialog itself says "somente leitura"; wait for the finalized page notice instead.
      await page.getByText(/^Auditoria finalizada em .+ Somente leitura\.$/).waitFor();
      await page.getByRole("dialog").waitFor({ state: "detached" });
      fails(await confirm("owner", hiddenPending.evidence_id), "55000");
      const browserSnapshot = (await db.query(
        "select metadata->'evidence_ids' ids from core.system_audit_log where module='audit' and action='finalize' and entity_id=$1",
        [uiInspection],
      )).rows[0].ids;
      assert.ok(browserSnapshot.includes(remoteFile.evidence_id), "Finalization includes the reviewed hidden section file");
      assert.ok(await add.count() === 0 || await add.isDisabled(), "Finalized has no enabled upload control");
      const readOnlyRemove = section.getByRole("button", { name: "Remover valid.pdf", exact: true });
      assert.ok(await readOnlyRemove.count() === 0 || await readOnlyRemove.isDisabled(), "Finalized has no enabled removal");
      const [finalDownload] = await Promise.all([
        page.waitForEvent("download"), section.getByRole("button", { name: "Baixar valid.pdf", exact: true }).click(),
      ]);
      assert.ok(readFileSync(await finalDownload.path()).equals(bytes));
      await page.getByRole("button", { name: "Reabrir", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Confirmar", exact: true }).click();
      await add.waitFor();
      assert.equal(await add.isEnabled(), true);
      await input.setInputFiles({ name: "reopened.pdf", mimeType: PDF, buffer: bytes });
      await section.getByRole("button", { name: "Baixar reopened.pdf", exact: true }).waitFor();
      assert.equal((await list("ui", uiInspection)).length, 3);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Reopened evidence fits viewport");
      await context.close();
    }
    console.log("PASS Chromium desktop/375px real upload/download/remove, long UTF-8 names, focus/labels, app dialog, no overflow/preview/popup, MIME/signature/NFC/OOXML limits, actual interrupted responses and idempotent retry, missing download, full-section review/conflict/pending warning and finalized/reopen file flow");
  } finally {
    await browser?.close();
    server.kill();
    rmSync(outDir, { recursive: true, force: true });
  }
}
