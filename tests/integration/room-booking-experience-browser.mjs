// Contas e serviços locais existentes; não cria identidades nem altera atribuições.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { connect } from "./room-booking-local.mjs";
import { existingActors } from "./room-booking-experience-local.mjs";
const origin = "http://127.0.0.1:5173";
const local = JSON.parse(
  execFileSync(
    process.env.SUPABASE_CLI || "supabase",
    ["status", "-o", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ),
);
assert.equal(local.API_URL, "http://127.0.0.1:54321");
const output =
  process.env.ROOM_SCREENSHOTS || "/tmp/room-experience-screenshots";
mkdirSync(output, { recursive: true });
const db = await connect();
let browser, manager, testAsset;
const must = (r, label) => {
  assert.equal(r.error?.code ?? (r.error ? "error" : null), null, label);
  return r.data;
};
try {
  const actors = await existingActors(db);
  const privileged = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sessions = {};
  const clients = {};
  for (const role of ["manager", "requester"]) {
    const { rows } = await db.query(
      "select email from auth.users where id=$1",
      [actors[role]],
    );
    const link = must(
      await privileged.auth.admin.generateLink({
        type: "magiclink",
        email: rows[0].email,
      }),
      "Sessão local existente",
    );
    const client = createClient(local.API_URL, local.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const verified = must(
      await client.auth.verifyOtp({
        token_hash: link.properties.hashed_token,
        type: "magiclink",
      }),
      "Auth local",
    );
    sessions[role] = verified.session;
    clients[role] = client;
  }
  manager = clients.manager;
  const initial = must(await manager.rpc("room_booking_cover"), "Foto inicial");
  assert.equal(
    initial.asset_id,
    null,
    "Ensaio só altera foto inicialmente ausente; nunca substitui foto real",
  );
  const forbidden = await clients.requester.rpc(
    "room_booking_begin_cover_upload",
    { p_byte_size: 3, p_width: 1, p_height: 1, p_mime_type: "image/jpeg" },
  );
  assert.equal(forbidden.error?.code, "42501");
  assert.equal(
    (await clients.requester.rpc("room_booking_history")).error?.code,
    "42501",
  );
  browser = await chromium.launch();
  for (const width of [1440, 390]) {
    for (const role of ["manager", "requester"]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        locale: "pt-BR",
      });
      await context.addInitScript(
        (session) =>
          localStorage.setItem("sb-127-auth-token", JSON.stringify(session)),
        sessions[role],
      );
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("dialog", (d) => d.accept());
      await page.goto(origin + "/rooms");
      await page
        .getByRole("heading", { name: "Agenda", exact: true })
        .waitFor();
      await page.waitForFunction(
        () => !document.querySelector(".room-toolbar button")?.disabled,
      );
      if (role === "manager") {
        await page
          .getByRole("heading", {
            name: "Histórico de solicitações",
            exact: true,
          })
          .waitFor();
        assert.equal(
          await page
            .getByRole("heading", { name: "Meus pedidos", exact: true })
            .count(),
          0,
        );
        assert.equal(
          await page
            .getByRole("button", { name: "Novo pedido", exact: true })
            .count(),
          0,
        );
        await page
          .getByRole("button", { name: "Criar reserva direta", exact: true })
          .click();
        await page
          .getByRole("heading", { name: "Reserva direta", exact: true })
          .waitFor();
        await page
          .getByRole("button", { name: "Fechar formulário", exact: true })
          .click();
        if (width === 1440) {
          const png = await page.evaluate(() => {
            const c = document.createElement("canvas");
            c.width = 900;
            c.height = 350;
            const g = c.getContext("2d");
            g.fillStyle = "#376e62";
            g.fillRect(0, 0, 900, 350);
            g.fillStyle = "#d6b876";
            g.fillRect(450, 0, 450, 350);
            return c.toDataURL("image/png").split(",")[1];
          });
          const setPhoto = async () => {
            await page
              .getByRole("button", {
                name: "Alterar foto da sala",
                exact: true,
              })
              .click();
            await page
              .getByLabel("Arquivo da foto da sala", { exact: true })
              .setInputFiles({
                name: "ensaio.png",
                mimeType: "image/png",
                buffer: Buffer.from(png, "base64"),
              });
            await page
              .getByRole("button", { name: "Salvar foto", exact: true })
              .click();
            await page.getByRole("dialog").waitFor({ state: "hidden" });
            await page.locator(".room-hero-photo").waitFor();
            const cover = must(
              await manager.rpc("room_booking_cover"),
              "Foto pronta",
            );
            testAsset = cover.asset_id;
            return cover;
          };
          const first = await setPhoto();
          assert.ok(first.object_key.endsWith(".jpg"));
          const signed = must(
            await clients.requester.storage
              .from("room-covers")
              .createSignedUrl(first.object_key, 60),
            "Leitor assina foto",
          );
          assert.equal((await fetch(signed.signedUrl)).status, 200);
          const anon = createClient(local.API_URL, local.ANON_KEY, {
            auth: { persistSession: false },
          });
          assert.ok(
            (
              await anon.storage
                .from("room-covers")
                .createSignedUrl(first.object_key, 60)
            ).error,
          );
          const replaced = await setPhoto();
          assert.notEqual(first.asset_id, replaced.asset_id);
          assert.ok(
            (
              await clients.requester.storage
                .from("room-covers")
                .createSignedUrl(first.object_key, 60)
            ).error,
            "Aposentada não recebe nova URL",
          );
          await page
            .getByRole("button", { name: "Alterar foto da sala", exact: true })
            .click();
          await page
            .getByLabel("Posição horizontal", { exact: true })
            .fill("70");
          await page.getByLabel("Posição vertical", { exact: true }).fill("30");
          await page
            .getByRole("button", { name: "Salvar enquadramento", exact: true })
            .click();
          await page.getByRole("dialog").waitFor({ state: "hidden" });
          const framed = must(
            await manager.rpc("room_booking_cover"),
            "Enquadramento",
          );
          assert.equal(Number(framed.position_x), 70);
          assert.equal(Number(framed.position_y), 30);
          assert.equal(
            (
              await manager.rpc("room_booking_save_cover", {
                p_action: "position",
                p_asset: framed.asset_id,
                p_version: replaced.version,
                p_x: 5,
                p_y: 5,
              })
            ).error?.code,
            "40001",
          );
          console.log(
            "PASS Auth/Storage: upload PNG convertido em JPEG, substituição, enquadramento, leitura autorizada, anônimo negado, versão obsoleta recusada",
          );
        }
        await page
          .getByLabel("Status do pedido", { exact: true })
          .selectOption("rejected");
        await page
          .getByLabel("Data inicial", { exact: true })
          .fill("2090-01-01");
        await page.getByLabel("Data final", { exact: true }).fill("2090-01-02");
        await page
          .getByText("Nenhuma solicitação encontrada.", { exact: true })
          .waitFor();
      } else {
        await page
          .getByRole("heading", { name: "Meus pedidos", exact: true })
          .waitFor();
        assert.equal(
          await page
            .getByRole("heading", {
              name: "Histórico de solicitações",
              exact: true,
            })
            .count(),
          0,
        );
        assert.equal(
          await page
            .getByRole("button", { name: "Alterar foto da sala", exact: true })
            .count(),
          0,
        );
        await page
          .getByRole("button", { name: "Novo pedido", exact: true })
          .click();
        await page
          .getByRole("heading", { name: "Novo pedido", exact: true })
          .waitFor();
        await page
          .getByRole("button", { name: "Fechar formulário", exact: true })
          .click();
        await page.locator(".room-hero-photo").waitFor();
      }
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
      );
      assert.deepEqual(errors, []);
      // Captura só do módulo; listas potencialmente pessoais ficam mascaradas.
      await page
        .locator(".rooms-page")
        .screenshot({
          path: `${output}/${role}-${width}.png`,
          mask: [page.locator(".room-list")],
        });
      console.log(
        `PASS navegador ${role} ${width}px: visão por permissão, foto, formulários, filtros e responsividade; captura sem dados pessoais`,
      );
      await context.close();
    }
  }
} finally {
  if (manager && testAsset) {
    const cover = must(
      await manager.rpc("room_booking_cover"),
      "Foto ao encerrar",
    );
    if (cover.asset_id === testAsset)
      must(
        await manager.rpc("room_booking_save_cover", {
          p_action: "remove",
          p_asset: testAsset,
          p_version: cover.version,
        }),
        "Remover somente foto sintética",
      );
    console.log(
      "PASS foto sintética removida logicamente; fallback restaurado, auditoria e arquivos aposentados preservados",
    );
  }
  await browser?.close();
  await db.end();
}
