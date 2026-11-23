// Smoke do Vite real no localhost; Auth/REST sintéticos, sem gravações persistentes.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, expect } from "playwright/test";
const origin = "http://127.0.0.1:5173";
const artifacts = process.env.ROOM_UX_ARTIFACTS ?? "/tmp/room-booking-ux";
mkdirSync(artifacts, { recursive: true });
const user = { id: "00000000-0000-4000-8000-000000000098", email: "ux@example.test", aud: "authenticated" };
const exp = Math.floor(Date.now() / 1000) + 3600;
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const session = { access_token: `${encode({ alg: "HS256" })}.${encode({ sub: user.id, exp, role: "authenticated" })}.fixture`, refresh_token: "fixture", expires_at: exp, expires_in: 3600, token_type: "bearer", user };
const upcoming = [1, 2].map((n) => ({ booked_for: `Reserva de pessoa ${n}`, starts_at: `2096-0${n}-01T13:00:00Z`, ends_at: `2096-0${n}-01T14:00:00Z` }));
const errors = [];
const browser = await chromium.launch();
try {
  for (const role of ["requester", "manager", "admin"]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "pt-BR" });
    await context.addInitScript((fixture) => localStorage.setItem("sb-127-auth-token", JSON.stringify(fixture)), session);
    let empty = false;
    let contact = { room_id: "fixture", responsible_name: "Contato sintético da sala", extension: "1234", version: 1 };
    await context.route("**/*", async (route) => {
      const { pathname } = new URL(route.request().url());
      const endpoint = pathname.split("/").at(-1);
      const json = (value) => route.fulfill({ json: value, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
      if (route.request().method() === "OPTIONS") return json({});
      if (pathname.includes("/identity/me")) return json({ passwordChangeRequired: false, provision: false, resetPassword: false });
      if (pathname.includes("/auth/v1/user")) return json(user);
      if (pathname.includes("/rest/v1/")) {
        switch (endpoint) {
          case "profiles": return json({ id: user.id, active: true, display_name: "Pessoa sintética" });
          case "my_access": return json(["schedule.read", "request.create", "request.read_own", ...(role !== "requester" ? ["manage"] : [])].map((p) => ({ permission: `room_booking.${p}`, scope_type: "global", unit_id: null, sector_id: null })));
          case "announcements_published": return json({ version: 1, enabled: false, announcements: [], serverNow: new Date().toISOString(), nextRefreshAt: null });
          case "room_booking_admin_context": return json(role === "admin");
          case "room_booking_summary": return json({ name: "Sala de Reunião", server_now: new Date().toISOString(), in_use: false, today_count: empty ? 0 : 2, next_start: empty ? null : upcoming[0].starts_at, upcoming: empty ? [] : upcoming, pending_count: 0 });
          case "room_booking_contact": return json(contact);
          case "room_booking_save_contact": {
            assert.notEqual(role, "requester");
            const args = route.request().postDataJSON();
            assert.equal(args.p_version, contact.version);
            contact = { ...contact, responsible_name: args.p_responsible_name, extension: args.p_extension, version: contact.version + 1 };
            return json(contact);
          }
          case "room_booking_cover": return json({ asset_id: null, version: 0 });
          case "room_booking_history": case "room_booking_direct_history": return json({ items: [], has_more: false });
          case "room_booking_schedule": case "room_booking_requests": return json([]);
          default: throw new Error(`Endpoint inesperado: ${endpoint}`);
        }
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/rooms`);
    const hero = page.locator(".room-hero");
    await expect(hero.getByText("Reserva de pessoa 2")).toBeVisible();
    await expect(hero.getByText("Contato sintético da sala")).toBeVisible();
    await expect(page.getByText("ADMINISTRATIVO · AGENDAMENTO DE SALAS")).toHaveCount(0);
    await expect(page.getByText("Situação atual")).toHaveCount(0);
    await expect(page.locator(".room-panel.room-contact")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Modo de atuação" })).toHaveCount(role === "admin" ? 1 : 0);
    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      if (role === "admin") await page.getByRole("button", { name: "Room Booking Requester", exact: true }).click();
      const actions = page.getByRole("group", { name: "Ações da sala" });
      if (role !== "manager") await expect(actions).toHaveCount(0);
      if (role === "admin") await page.getByRole("button", { name: "Room Booking Manager", exact: true }).click();
      if (role !== "requester") {
        await expect(actions.getByRole("button")).toHaveCount(2);
        assert.equal(await actions.evaluate((bar) => bar.nextElementSibling.classList.contains("room-hero")), true);
        if (role === "admin") assert.equal(await actions.evaluate((bar) => bar.previousElementSibling.classList.contains("room-mode-switch")), true);
        await expect(hero.getByRole("button", { name: "Editar contato" })).toHaveCount(0);
        await expect(hero.getByRole("button", { name: "Alterar foto da sala" })).toHaveCount(0);
        const barBounds = await actions.boundingBox();
        const heroBounds = await hero.boundingBox();
        for (const button of await actions.getByRole("button").all()) {
          const bounds = await button.boundingBox();
          assert.ok(bounds.x >= barBounds.x && bounds.x + bounds.width <= barBounds.x + barBounds.width + 1);
          assert.ok(bounds.y + bounds.height <= heroBounds.y);
        }
        await actions.getByRole("button", { name: "Editar contato" }).click();
        await expect(page.getByLabel("Nome da responsável")).toBeFocused();
        await page.getByLabel("Nome da responsável").fill("Contato sintético da sala");
        await page.getByRole("button", { name: "Salvar contato" }).click();
        await expect(page.getByText("Contato atualizado.", { exact: true })).toBeVisible();
        const photo = actions.getByRole("button", { name: "Alterar foto da sala" });
        await photo.click();
        await expect(page.getByRole("dialog", { name: "Foto da sala" })).toBeVisible();
        await expect(page.getByLabel("Arquivo da foto da sala")).toBeVisible();
        await page.getByRole("dialog").getByRole("button", { name: "Fechar", exact: true }).click();
        await expect(photo).toBeFocused();
        await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
        await page.screenshot({ path: `${artifacts}/${role}-${width}-actions.png`, fullPage: true });
      }
      if (role === "admin") await page.getByRole("button", { name: "Room Booking Requester", exact: true }).click();
      const trigger = page.getByRole("button", { name: role === "manager" ? "Criar reserva direta" : "Solicitar horário", exact: true });
      if (role !== "manager") assert.equal(await trigger.evaluate((button) => button.closest("section").querySelector("h2").textContent), "Agenda");
      await trigger.click();
      const modal = page.getByRole("dialog");
      await expect(modal).toBeVisible();
      assert.equal(await modal.evaluate((dialog) => dialog.contains(document.activeElement)), true);
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press("Tab");
        assert.equal(await modal.evaluate((dialog) => dialog.contains(document.activeElement)), true, "Foco contido no modal");
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Sem overflow ${role} ${width}`);
      assert.equal(await modal.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth), true, `Modal sem overflow interno ${role} ${width}`);
      await page.screenshot({ path: `${artifacts}/${role}-${width}-modal.png` });
      await page.keyboard.press("Escape");
      await expect(modal).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await page.getByRole("dialog").getByRole("button", { name: "Fechar", exact: true }).click();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await page.mouse.click(2, 2);
      await expect(modal).toHaveCount(0);
      if (role === "admin") {
        await page.getByRole("button", { name: "Room Booking Manager", exact: true }).click();
        await page.getByRole("button", { name: "Criar reserva direta" }).click();
        await expect(page.getByRole("dialog", { name: "Reserva direta" })).toBeVisible();
        await page.keyboard.press("Escape");
      }
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      await page.screenshot({ path: `${artifacts}/${role}-${width}.png`, fullPage: true });
    }
    empty = true;
    await page.getByRole("button", { name: "Atualizar agenda" }).click();
    await expect(hero.getByText("Nenhuma prevista")).toBeVisible();
    await context.close();
    console.log(`PASS ${role}: desktop/mobile, hero, agenda, modal, foco, Escape, botão, overlay e vazio`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
