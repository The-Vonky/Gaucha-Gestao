// Ensaio local autorizado: preserva dados existentes e mantém somente histórico sintético.
// Não executar contra host remoto. Usa o container já existente, nunca provisiona banco.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import pg from "pg";
const container = "supabase_db_gaucha-gestao-local";
const info = JSON.parse(
  execFileSync("docker", ["inspect", container], { encoding: "utf8" }),
)[0];
assert.equal(info.Name, "/" + container);
assert.equal(info.HostConfig.PortBindings["5432/tcp"][0].HostPort, "54322");
const env = Object.fromEntries(
  info.Config.Env.map((x) => {
    const i = x.indexOf("=");
    return [x.slice(0, i), x.slice(i + 1)];
  }),
);
export const config = {
  host: "127.0.0.1",
  port: 54322,
  database: "postgres",
  user: "postgres",
  password: env.POSTGRES_PASSWORD,
};
export async function connect() {
  const db = new pg.Client(config);
  await db.connect();
  return db;
}
export async function identity(db) {
  const { rows } = await db.query(
    "select p.id from core.profiles p join core.user_role_assignments a on a.user_id=p.id join core.roles r on r.id=a.role_id where p.active and a.active and a.scope_type='global' and r.key='platform_administrator' limit 1",
  );
  assert.equal(rows.length, 1, "Conta local administradora existente");
  return rows[0].id;
}
export async function asUser(db, id) {
  await db.query("begin");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
  await db.query("set local role authenticated");
}
async function main() {
  const db = await connect(),
    a = await connect(),
    b = await connect();
  try {
    const user = await identity(db);
    await db.query("begin");
    await db.query(
      readFileSync("tests/fixtures/room-booking-operations.sql", "utf8"),
    );
    await db.query("rollback");
    console.log("PASS matriz SQL no PostgreSQL real com ROLLBACK");
    const suffix = crypto.randomUUID().slice(0, 8);
    // Data sintética distante; horários livres confirmados antes do ensaio.
    const date = "2098-11-19";
    await asUser(db, user);
    const req = [];
    for (let i = 0; i < 2; i++)
      req.push(
        (
          await db.query(
            "select public.room_booking_create_request($1,$2,$3,null,$4) id",
            [
              date + " 14:07-03",
              date + " 14:23-03",
              "Teste concorrência " + suffix,
              crypto.randomUUID(),
            ],
          )
        ).rows[0].id,
      );
    await db.query("commit");
    await asUser(a, user);
    await asUser(b, user);
    const winner = (
      await a.query(
        "select public.room_booking_decide_request($1,1,'approve') id",
        [req[0]],
      )
    ).rows[0].id;
    const second = b
      .query("select public.room_booking_decide_request($1,1,'approve')", [
        req[1],
      ])
      .then(
        () => null,
        (e) => e.code,
      );
    await a.query("commit");
    assert.equal(await second, "23P01");
    await b.query("rollback");
    console.log(
      "PASS duas aprovações concorrentes: uma confirmada, outra pendente",
    );
    await asUser(a, user);
    await asUser(b, user);
    await a.query(
      "select public.room_booking_save_booking($1,$2,$3,null,$4,1)",
      [
        date + " 14:07-03",
        date + " 14:23-03",
        "Teste editado " + suffix,
        winner,
      ],
    );
    const stale = b
      .query("select public.room_booking_save_booking($1,$2,$3,null,$4,1)", [
        date + " 14:07-03",
        date + " 14:23-03",
        "Versão antiga",
        winner,
      ])
      .then(
        () => null,
        (e) => e.code,
      );
    await a.query("commit");
    assert.equal(await stale, "40001");
    await b.query("rollback");
    console.log("PASS duas edições concorrentes: versão antiga rejeitada");
    await asUser(db, user);
    await db.query(
      "select public.room_booking_save_booking(null,null,null,null,$1,2,true)",
      [winner],
    );
    await db.query(
      "select public.room_booking_decide_request($1,1,'reject','Ensaio sintético concluído')",
      [req[1]],
    );
    await db.query("commit");
    // Aprovação e reserva direta disputam a mesma faixa.
    await asUser(db, user);
    const overlap = (
      await db.query(
        "select public.room_booking_create_request($1,$2,$3,null,$4) id",
        [
          date + " 15:07-03",
          date + " 15:23-03",
          "Teste C2 " + suffix,
          crypto.randomUUID(),
        ],
      )
    ).rows[0].id;
    await db.query("commit");
    await asUser(a, user);
    await asUser(b, user);
    const approved = (
      await a.query(
        "select public.room_booking_decide_request($1,1,'approve') id",
        [overlap],
      )
    ).rows[0].id;
    const competing = b
      .query("select public.room_booking_save_booking($1,$2,$3)", [
        date + " 15:07-03",
        date + " 15:23-03",
        "Teste C2 direta",
      ])
      .then(
        () => null,
        (e) => e.code,
      );
    await a.query("commit");
    assert.equal(await competing, "23P01");
    await b.query("rollback");
    await asUser(db, user);
    await db.query(
      "select public.room_booking_save_booking(null,null,null,null,$1,1,true)",
      [approved],
    );
    await db.query("commit");
    console.log(
      "PASS aprovação concorrente com reserva direta: somente uma confirmada",
    );
    // Reserva direta mantém trava enquanto um pedido tenta a mesma faixa (F2).
    await asUser(a, user);
    await asUser(b, user);
    const direct = (
      await a.query("select public.room_booking_save_booking($1,$2,$3) id", [
        date + " 16:07-03",
        date + " 16:23-03",
        "Teste F2 " + suffix,
      ])
    ).rows[0].id;
    const conflict = b
      .query("select public.room_booking_create_request($1,$2,$3,null,$4)", [
        date + " 16:07-03",
        date + " 16:23-03",
        "Teste F2 bloqueado",
        crypto.randomUUID(),
      ])
      .then(
        () => null,
        (e) => e.code,
      );
    await a.query("commit");
    assert.equal(await conflict, "23P01");
    await b.query("rollback");
    await asUser(db, user);
    await db.query(
      "select public.room_booking_save_booking(null,null,null,null,$1,1,true)",
      [direct],
    );
    await db.query("commit");
    console.log(
      "PASS F2 concorrente: confirmação bloqueia envio de pedido; reservas sintéticas canceladas",
    );
  } finally {
    await Promise.all([db.end(), a.end(), b.end()]);
  }
}
if (process.argv[1]?.endsWith("room-booking-local.mjs"))
  main().catch((e) => {
    console.error("FAIL ensaio local:", e.code ?? e.message);
    process.exitCode = 1;
  });
