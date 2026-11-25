// Vite, GoTrue, Identity, PostgREST e Storage reais no Compose pessoal existente.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, expect } from "playwright/test";
import sharp from "sharp";
import { api, origin, withRoomBrowserFixtures } from "./room-booking-browser-fixtures.mjs";

const output = process.env.ROOM_SCREENSHOTS || "/tmp/room-experience-screenshots";
mkdirSync(output, { recursive: true });

async function call(path, session, json) {
  return fetch(api + path, {
    method: json === undefined ? "GET" : "POST",
    headers: {
      origin,
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(json === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    redirect: "error",
  });
}

async function rpc(session, name, args = {}, expectedCode) {
  const response = await call("/rest/v1/rpc/room_booking_" + name, session, args);
  if (expectedCode) {
    assert.ok(!response.ok, `RPC ${name} deveria negar a operação`);
    assert.equal((await response.json()).code, expectedCode, name);
  } else {
    assert.ok(response.ok, `RPC ${name}: HTTP ${response.status}`);
    if (response.status !== 204) return response.json();
  }
}

function action(page, name) {
  return page.getByRole("button", { name, exact: true });
}
function section(page, name) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name, exact: true }) });
}
function entry(container, name) {
  return container.getByRole("listitem").filter({ has: container.page().getByText(name, { exact: true }) });
}
function dialog(page, name) {
  return page.getByRole("dialog", { name, exact: true });
}

async function verifyContact(page, manager, requester) {
  const contact = await rpc(manager, "contact");
  const input = {
    p_room_id: contact.room_id,
    p_responsible_name: "Contato sintético do navegador",
    p_extension: "0042",
    p_version: contact.version,
  };
  assert.equal(contact.version, 0);
  await rpc(requester, "save_contact", input, "42501");
  const edit = page.getByRole("group", { name: "Ações da sala" });
  await action(edit, "Editar contato").click();
  const modal = dialog(page, "Editar contato");
  await modal.getByLabel("Nome da responsável").fill(input.p_responsible_name);
  await modal.getByLabel(/^Ramal/).fill(input.p_extension);
  await action(modal, "Salvar contato").click();
  await expect(modal).toBeHidden();
  await expect(page.getByText("Contato atualizado.", { exact: true })).toBeVisible();
  await expect(action(edit, "Editar contato")).toBeFocused();
  const persisted = await rpc(requester, "contact");
  assert.equal(persisted.responsible_name, input.p_responsible_name);
  assert.equal(persisted.extension, input.p_extension);
  assert.equal(persisted.version, 1);
  await rpc(manager, "save_contact", input, "40001");
  await page.reload();
  await expect(page.getByText(input.p_responsible_name, { exact: true })).toBeVisible();
  await expect(page.getByText(input.p_extension, { exact: true })).toBeVisible();
}

async function verifyPhoto(page, manager, requester) {
  const png = await sharp({
    create: { width: 900, height: 350, channels: 3, background: "#376e62" },
  }).png().toBuffer();
  const modal = dialog(page, "Foto da sala");
  const open = () => action(page.getByRole("group", { name: "Ações da sala" }), "Alterar foto da sala").click();
  async function setPhoto() {
    await open();
    await modal.getByLabel("Arquivo da foto da sala", { exact: true }).setInputFiles({
      name: "ensaio.png", mimeType: "image/png", buffer: png,
    });
    await action(modal, "Salvar foto").click();
    await expect(modal).toBeHidden();
    await expect(page.locator(".room-hero-photo")).toBeVisible();
    return rpc(manager, "cover");
  }
  await rpc(requester, "begin_cover_upload", {
    p_byte_size: 3, p_width: 1, p_height: 1, p_mime_type: "image/jpeg",
  }, "42501");
  const first = await setPhoto();
  assert.ok(first.object_key.endsWith(".jpg"));
  const object = (cover) => "/storage/v1/object/authenticated/room-covers/" + cover.object_key;
  const readable = await call(object(first), requester);
  assert.equal(readable.status, 200);
  assert.match(readable.headers.get("content-type"), /^image\/jpeg\b/i);
  assert.equal((await sharp(Buffer.from(await readable.arrayBuffer())).metadata()).format, "jpeg");
  assert.equal((await call(object(first))).status, 401);
  assert.equal((await call("/storage/v1/object/sign/room-covers/" + first.object_key, requester, { expiresIn: 60 })).status, 404);
  const replaced = await setPhoto();
  assert.notEqual(first.asset_id, replaced.asset_id);
  assert.ok([400, 403, 404].includes((await call(object(first), requester)).status), "Objeto aposentado deve deixar de ser legível");
  await open();
  await modal.getByLabel("Posição horizontal", { exact: true }).fill("70");
  await modal.getByLabel("Posição vertical", { exact: true }).fill("30");
  await action(modal, "Salvar enquadramento").click();
  await expect(modal).toBeHidden();
  const framed = await rpc(manager, "cover");
  assert.equal(Number(framed.position_x), 70);
  assert.equal(Number(framed.position_y), 30);
  await rpc(manager, "save_cover", {
    p_action: "position", p_asset: framed.asset_id, p_version: replaced.version, p_x: 5, p_y: 5,
  }, "40001");
  await rpc(requester, "save_cover", {
    p_action: "position", p_asset: framed.asset_id, p_version: framed.version, p_x: 5, p_y: 5,
  }, "42501");
  await page.reload();
  await expect(page.locator(".room-hero-photo")).toHaveCSS("object-position", "70% 30%");
}

async function verifyOperations(requester, manager, admin, actors, width) {
  const month = (Number.parseInt(actors.requester.id.slice(0, 2), 16) % 12) + 1;
  const date = `2097-${String(month).padStart(2, "0")}-${width === 1440 ? "17" : "18"}`;
  const prefix = `Ensaio Salas ${actors.requester.id.slice(0, 8)} ${width}`;
  const privateText = `Finalidade privada ${prefix}`;
  const own = section(requester, "Meus pedidos");
  const agenda = section(manager, "Agenda");
  const queue = section(manager, "Solicitações pendentes");
  await requester.getByLabel("Data", { exact: true }).fill(date);
  await expect(section(requester, "Agenda").getByText("Nenhuma reserva confirmada nesta data.")).toBeVisible();

  const create = async (name, start, end) => {
    await action(requester, "Solicitar horário").click();
    const modal = dialog(requester, "Novo pedido");
    await expect(modal.getByLabel("Data da reunião")).toHaveValue(date);
    await modal.getByLabel("Início", { exact: true }).fill(start);
    await modal.getByLabel("Término", { exact: true }).fill(end);
    const reservedFor = modal.getByLabel("Reservado para", { exact: true });
    const submit = action(modal, "Enviar pedido");
    await submit.click();
    await expect(modal).toBeVisible();
    assert.equal(await reservedFor.evaluate((input) => input.validity.valueMissing), true);
    await reservedFor.fill(name);
    await modal.getByLabel("Finalidade privada (somente você e a gestão)").fill(privateText);
    await submit.click();
    await expect(modal).toBeHidden();
    await expect(requester.getByText("Pedido enviado. Aguarde aprovação: o horário ainda não está reservado.", { exact: true })).toBeVisible();
    await expect(entry(own, name)).toBeVisible();
  };

  const cancelled = prefix + " cancelado";
  await create(cancelled, "13:07", "13:23");
  await action(entry(own, cancelled), "Cancelar meu pedido").click();
  await expect(requester.getByText("Pedido cancelado.", { exact: true })).toBeVisible();
  await expect(entry(own, cancelled).getByText("Cancelado", { exact: true })).toBeVisible();

  const approved = prefix + " aprovado";
  const rejected = prefix + " recusado";
  await create(approved, "14:07", "14:23");
  await create(rejected, "15:07", "15:23");
  // O administrador começa em Requester. A API continua autorizando sua fila.
  await expect(admin.getByRole("heading", { name: "Meus pedidos", exact: true })).toBeVisible();
  await expect(section(admin, "Meus pedidos").getByText(approved, { exact: true })).toHaveCount(0);
  assert.ok(!(await rpc(actors.admin.session, "requests", { p_queue: false })).some((r) => r.booked_for === approved));
  assert.ok((await rpc(actors.admin.session, "requests", { p_queue: true })).some((r) => r.booked_for === approved));
  await action(manager, "Atualizar agenda").click();
  const approval = entry(queue, approved);
  const rejection = entry(queue, rejected);
  await action(approval, "Aprovar pedido").click();
  await approval.getByLabel("Observações públicas da secretaria").fill("<b>Observação em texto</b>");
  await action(approval, "Confirmar aprovação").click();
  await expect(manager.getByText("Pedido aprovado. Reserva confirmada.", { exact: true })).toBeVisible();
  await action(rejection, "Recusar pedido").click();
  await rejection.getByLabel("Motivo da recusa (opcional)").fill("Recusa sintética");
  await action(rejection, "Confirmar recusa").click();
  await expect(manager.getByText("Pedido recusado.", { exact: true })).toBeVisible();

  await manager.getByLabel("Data", { exact: true }).fill(date);
  const confirmed = entry(agenda, approved);
  await expect(confirmed.getByText("<b>Observação em texto</b>", { exact: true })).toBeVisible();
  await expect(confirmed.getByText("14:07 — 14:23", { exact: false })).toBeVisible();
  await action(confirmed, "Editar reserva").click();
  const edit = dialog(manager, "Editar reserva");
  await edit.getByLabel("Reservado para").fill(approved + " editado");
  await edit.getByLabel("Observações públicas da secretaria").fill("Observação atualizada");
  await action(edit, "Salvar reserva").click();
  const edited = entry(agenda, approved + " editado");
  await expect(edited.getByText("Observação atualizada", { exact: true })).toBeVisible();
  await action(edited, "Cancelar reserva").click();
  await expect(manager.getByText("Reserva cancelada.", { exact: true })).toBeVisible();
  await expect(edited).toHaveCount(0);
  await action(requester, "Atualizar agenda").click();
  await expect(entry(own, approved).getByText("Reserva cancelada pela secretaria")).toBeVisible();
  await expect(entry(own, rejected).getByText("Motivo da recusa: Recusa sintética")).toBeVisible();

  const directName = prefix + " direta";
  await action(manager, "Criar reserva direta").click();
  const direct = dialog(manager, "Reserva direta");
  await direct.getByLabel("Início", { exact: true }).fill("16:07");
  await direct.getByLabel("Término", { exact: true }).fill("16:23");
  await direct.getByLabel("Reservado para").fill(directName);
  await action(direct, "Salvar reserva").click();
  await expect(entry(agenda, directName)).toBeVisible();
  await manager.reload();
  await manager.getByLabel("Data", { exact: true }).fill(date);
  await action(entry(agenda, directName), "Cancelar reserva").click();
  await expect(manager.getByText("Reserva cancelada.", { exact: true })).toBeVisible();
  const history = manager.getByRole("region", { name: "Histórico do agendamento" });
  await history.getByLabel("Data inicial").fill(date);
  await history.getByLabel("Data final").fill(date);
  await expect(history.getByText(rejected, { exact: true })).toBeVisible();
  await history.getByRole("tab", { name: "Reservas diretas" }).click();
  await history.getByLabel("Data inicial").fill(date);
  await history.getByLabel("Data final").fill(date);
  await expect(history.getByText(directName, { exact: true })).toBeVisible();
  await expect(history.getByText(rejected, { exact: true })).toHaveCount(0);
  console.log(`PASS operações reais a ${width}px: criação, privacidade, decisão, cancelamentos, reserva direta, edição e históricos.`);
}

let phase = "preparação do Compose/Identity";
try {
  await withRoomBrowserFixtures(async (actors) => {
    const browser = await chromium.launch();
    const errors = [];
    try {
      async function open(role, width) {
        const context = await browser.newContext({
          viewport: { width, height: 1000 }, locale: "pt-BR",
          timezoneId: width === 390 ? "Asia/Tokyo" : "UTC",
        });
        await context.addInitScript((session) => {
          if (session && !localStorage.getItem("sb-127-auth-token"))
            localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
        }, actors[role]?.session ?? null);
        const page = await context.newPage();
        page.on("pageerror", (e) => errors.push(e.name));
        page.on("dialog", (d) => d.accept());
        await page.goto(origin + "/rooms");
        if (role) await expect(page.getByRole("heading", { name: "Agenda", exact: true })).toBeVisible();
        return page;
      }

      phase = "vistas e RPCs no modo Requester do administrador";
      const manager = await open("manager", 1440);
      const requester = await open("requester", 1440);
      const admin = await open("admin", 1440);
      const modes = admin.getByRole("group", { name: "Modo de atuação" });
      await expect(action(modes, "Room Booking Requester")).toHaveAttribute("aria-pressed", "true");
      await expect(action(admin, "Criar reserva direta")).toHaveCount(0);
      await action(modes, "Room Booking Manager").click();
      await expect(action(modes, "Room Booking Manager")).toHaveAttribute("aria-pressed", "true");
      await expect(action(admin, "Criar reserva direta")).toBeVisible();
      await action(modes, "Room Booking Requester").click();
      await expect(action(modes, "Room Booking Requester")).toHaveAttribute("aria-pressed", "true");
      await expect(action(admin, "Criar reserva direta")).toHaveCount(0);
      await rpc(actors.requester.session, "history", {}, "42501");
      await rpc(actors.requester.session, "requests", { p_queue: true }, "42501");
      await expect(action(await open(null, 320), "Entrar")).toBeVisible();
      assert.ok(!(await call("/rest/v1/rpc/room_booking_summary", null, {})).ok);

      phase = "contato real";
      await verifyContact(manager, actors.manager.session, actors.requester.session);
      console.log("PASS contato real: gravação, releitura, recarga, versão e negativa de solicitante.");

      phase = "foto real";
      await verifyPhoto(manager, actors.manager.session, actors.requester.session);
      console.log("PASS foto real: bytes JPEG, substituição, enquadramento, recarga, versão e negativas de leitura/escrita.");

      phase = "operações reais a 1440px";
      await verifyOperations(requester, manager, admin, actors, 1440);
      phase = "operações reais a 390px";
      const mobileRequester = await open("requester", 390);
      const mobileManager = await open("manager", 390);
      await verifyOperations(mobileRequester, mobileManager, admin, actors, 390);
      await mobileRequester.context().close();
      await mobileManager.context().close();

      for (const width of [1440, 390, 320]) {
        for (const role of ["manager", "requester"]) {
          phase = `vista ${role} a ${width}px`;
          const page = await open(role, width);
          const manage = role === "manager";
          const modal = dialog(page, manage ? "Reserva direta" : "Novo pedido");
          const launch = action(page, manage ? "Criar reserva direta" : "Solicitar horário");
          await expect(page.getByRole("group", { name: "Modo de atuação" })).toHaveCount(0);
          await expect(page.getByRole("heading", { name: "Meus pedidos", exact: true })).toHaveCount(manage ? 0 : 1);
          await expect(page.getByRole("heading", { name: "Histórico de solicitações", exact: true })).toHaveCount(manage ? 1 : 0);
          await expect(action(page, "Solicitar horário")).toHaveCount(manage ? 0 : 1);
          for (const name of ["Editar contato", "Alterar foto da sala", "Criar reserva direta"])
            await expect(action(page, name)).toHaveCount(manage ? 1 : 0);
          await launch.click();
          await expect(modal).toBeVisible();
          assert.equal(await modal.evaluate((el) => el.scrollWidth <= el.clientWidth), true);
          await action(modal, "Fechar formulário").click();
          await expect(modal).toBeHidden();
          await expect(launch).toBeFocused();
          await expect(page.locator(".room-hero-photo")).toBeVisible();
          if (manage) {
            const history = page.getByRole("region", { name: "Histórico do agendamento" });
            await history.getByLabel("Status do pedido").selectOption("rejected");
            await expect(history.getByText(`Ensaio Salas ${actors.requester.id.slice(0, 8)} 1440 recusado`, { exact: true })).toBeVisible();
            await history.getByLabel("Data inicial").fill("2090-01-01");
            await history.getByLabel("Data final").fill("2090-01-02");
            await expect(history.getByText("Nenhuma solicitação encontrada.", { exact: true })).toBeVisible();
          }
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          // Registros anteriores à fixture ficam mascarados, inclusive projeções no banner.
          await page.locator(".rooms-page").screenshot({
            path: `${output}/${role}-${width}.png`,
            mask: [page.locator(".room-hero, .room-list, .room-history")],
          });
          console.log(`PASS ${role} a ${width}px: vista, foto, formulário, foco e largura.`);
          await page.context().close();
        }
      }
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
} catch (error) {
  console.error(`FAIL navegador real | ${phase} | ${error.code ?? error.message.split("\n")[0]}`);
  console.error(error.stack?.split("\n").find((line) => /^\s+at .*room-booking-.*\.mjs:\d+/.test(line)) ?? "");
  process.exitCode = 1;
}
