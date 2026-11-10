// Chromium sobre o bundle, com Auth/REST sintéticos interceptados. Não usa portas nem banco.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { extname } from "node:path";
import { chromium, expect } from "playwright/test";

const app = "http://127.0.0.1:5173";
const api = "http://127.0.0.1:54321";
const artifacts =
  process.env.GG0809_ARTIFACT_DIR ?? "/tmp/gaucha-gg0809-evidence";
mkdirSync(artifacts, { recursive: true });

const user = {
  id: "00000000-0000-4000-8000-000000000098",
  email: "gestora@example.test",
  aud: "authenticated",
};
const exp = Math.floor(Date.now() / 1000) + 3600;
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const session = {
  access_token: `${encode({ alg: "HS256" })}.${encode({ sub: user.id, exp, role: "authenticated" })}.fixture`,
  refresh_token: "fixture",
  expires_at: exp,
  expires_in: 3600,
  token_type: "bearer",
  user,
};
const profile = {
  id: user.id,
  active: true,
  display_name: "Gestora sintética",
};
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "*",
};
const mime = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const start = "2026-10-25T02:40:00Z";
const meeting = {
  starts_at: start,
  ends_at: "2026-10-25T02:59:00Z",
  created_at: "2026-10-10T15:00:00Z",
};
const requests = [
  {
    ...meeting,
    id: "solicitacao-1",
    booked_for: "Reunião de planejamento",
    requester_name: "Solicitante sintética",
    status: "approved",
    decided_at: "2026-10-10T18:00:00Z",
    decided_by_name: profile.display_name,
    booking_status: "cancelled",
    booking_cancelled_at: "2026-10-11T11:00:00Z",
  },
  {
    ...meeting,
    id: "solicitacao-2",
    booked_for: "Encontro de integração",
    requester_name: "Solicitante sintético",
    status: "rejected",
    decided_at: "2026-10-10T19:00:00Z",
    decided_by_name: profile.display_name,
    decision_reason: "Reunião transferida para outro espaço.",
  },
];
const direct = {
  ...meeting,
  id: "direta-1",
  booked_for: "Alinhamento interno da equipe",
  created_by_name: profile.display_name,
  status: "cancelled",
  updated_at: "2026-10-12T14:30:00Z",
  cancelled_at: "2026-10-12T14:30:00Z",
  cancelled_by_name: "Substituta sintética",
  cancel_reason: "Reunião reagendada.",
  secretary_notes: "Separar materiais da apresentação.",
};

let manage = true;
let contact = {
  room_id: "00000000-0000-4000-8000-000000000099",
  responsible_name: null,
  extension: null,
  version: 0,
};
const historyCalls = [];
const pageErrors = [];
const unexpected = [];
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "pt-BR",
    timezoneId: "Asia/Tokyo",
    reducedMotion: "reduce",
  });
  await context.addInitScript((fixture) => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify(fixture));
  }, session);
  await context.route("**/*", async (route) => {
    const request = route.request();
    const { origin, pathname } = new URL(request.url());
    if (origin === app) {
      const asset = pathname === "/rooms" ? "/index.html" : pathname;
      if (/^\/(?:index\.html|favicon\.svg|assets\/[\w.-]+)$/.test(asset)) {
        return route.fulfill({
          path: `apps/web/dist${asset}`,
          contentType: mime[extname(asset)],
        });
      }
    }
    if (origin === api) {
      if (request.method() === "OPTIONS") return route.fulfill({ headers });
      const json = (data) => route.fulfill({ json: data, headers });
      const endpoint = pathname.split("/").at(-1);
      switch (endpoint) {
        case "user":
          return json(user);
        case "profiles":
          return json(profile);
        case "my_access":
          return json(
            (manage ? ["schedule.read", "manage"] : ["schedule.read"]).map(
              (permission) => ({
                permission: `room_booking.${permission}`,
                scope_type: "global",
                unit_id: null,
                sector_id: null,
              }),
            ),
          );
        case "announcements_published":
          return json({
            version: 1,
            enabled: true,
            announcements: [],
            serverNow: new Date().toISOString(),
            nextRefreshAt: null,
          });
        case "room_booking_summary":
          return json({
            name: "Sala de Reunião",
            server_now: new Date().toISOString(),
            in_use: false,
            today_count: 0,
            next_start: null,
            ...(manage ? { pending_count: 0 } : {}),
          });
        case "room_booking_schedule":
        case "room_booking_requests":
          return json([]);
        case "room_booking_cover":
          return json({ asset_id: null, version: 1 });
        case "room_booking_contact":
          return json(contact);
        case "room_booking_save_contact": {
          const data = request.postDataJSON();
          assert.equal(manage, true);
          assert.equal(data.p_room_id, contact.room_id);
          assert.equal(data.p_version, contact.version);
          contact = {
            ...contact,
            responsible_name: data.p_responsible_name,
            extension: data.p_extension,
            version: contact.version + 1,
          };
          return json(contact);
        }
        case "room_booking_history":
        case "room_booking_direct_history": {
          historyCalls.push(endpoint);
          assert.equal(manage, true);
          const filters = request.postDataJSON();
          if (endpoint === "room_booking_history")
            return json({ items: requests, has_more: false });
          if (filters.p_before_id) {
            assert.equal(filters.p_before_id, direct.id);
            assert.equal(filters.p_before_start, start);
            return json({
              items: [
                {
                  ...direct,
                  id: "direta-2",
                  booked_for: "Segunda página de teste",
                },
              ],
              has_more: false,
            });
          }
          return json({ items: [direct], has_more: !filters.p_status });
        }
      }
    }
    unexpected.push(pathname);
    return route.abort();
  });

  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${app}/rooms`);
  const contactRegion = page.getByRole("region", { name: "Contato da sala" });
  const history = page.getByRole("region", {
    name: "Histórico do agendamento",
  });
  const edit = contactRegion.getByRole("button", { name: "Editar contato" });
  const name = contactRegion.getByLabel("Nome da responsável");
  const requestsTab = history.getByRole("tab", { name: "Solicitações" });
  const directTab = history.getByRole("tab", { name: "Reservas diretas" });
  const assertNoOverflow = async (width) => {
    const overflow = await page.evaluate(() =>
      [
        document.documentElement,
        ...document.querySelectorAll(
          ".room-contact, .room-history, .room-history-entry",
        ),
      ].some((el) => el.scrollWidth > el.clientWidth + 1),
    );
    assert.equal(overflow, false, `Overflow horizontal a ${width}px`);
  };

  await expect(
    contactRegion.getByText("Contato ainda não informado."),
  ).toBeVisible();
  await edit.click();
  await expect(name).toBeFocused();
  await name.fill("Nome institucional de exemplo");
  const extension = contactRegion.getByLabel(/^Ramal/);
  await extension.fill("teste");
  assert.equal(
    await extension.evaluate((input) => input.validity.valid),
    false,
  );
  await extension.fill("0042");
  await contactRegion.screenshot({ path: `${artifacts}/contato-desktop.png` });
  await contactRegion.getByRole("button", { name: "Salvar contato" }).click();
  await expect(contactRegion.getByText("Contato atualizado.")).toBeVisible();
  await expect(edit).toBeFocused();
  await expect(contactRegion.getByText("0042")).toBeVisible();
  await page.reload();
  await expect(
    contactRegion.getByText("Nome institucional de exemplo"),
  ).toBeVisible();
  await expect(
    history.getByText("Cancelada posteriormente", { exact: false }),
  ).toBeVisible();
  await history
    .getByText("Detalhes da solicitação", { exact: true })
    .last()
    .click();
  await expect(history.getByText(/Reunião transferida/)).toBeVisible();
  await assertNoOverflow(1440);
  await history.screenshot({ path: `${artifacts}/solicitacoes-desktop.png` });

  await requestsTab.focus();
  await requestsTab.press("ArrowRight");
  await expect(directTab).toBeFocused();
  await expect(directTab).toHaveAttribute("aria-selected", "true");
  await expect(
    history.getByText("Alinhamento interno da equipe"),
  ).toBeVisible();
  await expect(history.getByText("24/10/2026, 23:40")).toBeVisible();
  await history.getByRole("button", { name: "Próxima" }).click();
  await expect(history.getByText("Segunda página de teste")).toBeVisible();
  await expect(history.getByText("Página 2")).toBeVisible();
  await history.getByLabel("Status da reserva").selectOption("cancelled");
  await expect(
    history.getByText("Alinhamento interno da equipe"),
  ).toBeVisible();
  await expect(history.getByText("Página 1")).toBeVisible();
  await history.getByText("Detalhes da reserva", { exact: true }).click();
  await expect(history.getByText(/Reunião reagendada/)).toBeVisible();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    await assertNoOverflow(width);
    await edit.click();
    await expect(name).toBeVisible();
    await assertNoOverflow(width);
    await contactRegion
      .getByRole("button", { name: "Cancelar edição" })
      .click();
    await history.screenshot({
      path: `${artifacts}/diretas-${width}.png`,
      style: ".topbar, .skip { visibility: hidden; }",
    });
  }

  manage = false;
  const calls = historyCalls.length;
  await page.reload();
  await expect(contactRegion.getByText("0042")).toBeVisible();
  await expect(edit).toHaveCount(0);
  await expect(history).toHaveCount(0);
  assert.equal(historyCalls.length, calls);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(unexpected, []);
  console.log(
    "PASS Chromium sintético: contato, filtros/cursor, teclado, fuso, leitor e 1440/390/320 px sem overflow.",
  );
} finally {
  await browser.close();
}
