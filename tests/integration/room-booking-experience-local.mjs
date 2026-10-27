import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { connect } from "./room-booking-local.mjs";
export async function existingActors(db) {
  const { rows } =
    await db.query(`select p.id,array_agg(r.key) roles from core.profiles p
    join core.user_role_assignments a on a.user_id=p.id and a.active and a.scope_type='global'
    join core.roles r on r.id=a.role_id and r.active where p.active group by p.id`);
  const manager = rows.find(
    (r) =>
      r.roles.includes("room_booking_manager") &&
      !r.roles.includes("platform_administrator"),
  )?.id;
  const admin = rows.find((r) =>
    r.roles.includes("platform_administrator"),
  )?.id;
  const requester = rows.find(
    (r) =>
      r.roles.includes("room_booking_requester") &&
      !r.roles.includes("room_booking_manager"),
  )?.id;
  assert.ok(
    manager && admin && requester,
    "Contas existentes: gestor sem conflito e solicitante (pode acumular administrador D5-B)",
  );
  return { manager, admin, requester };
}
async function main() {
  const db = await connect();
  try {
    const actors = await existingActors(db);
    const snapshot = async () =>
      (
        await db.query(`select
    (select jsonb_agg(to_jsonb(a) order by id) from core.user_role_assignments a) assignments,
    (select array_agg(id order by id) from auth.users) users,
    (select jsonb_agg(to_jsonb(r) order by id) from room_booking.requests r) requests,
    (select jsonb_agg(to_jsonb(b) order by id) from room_booking.bookings b) bookings,
    (select count(*) from core.system_audit_log) audit,
    (select count(*) from storage.objects) objects`)
      ).rows;
    const before = await snapshot();
    await db.query("begin");
    for (const [role, id] of Object.entries(actors))
      await db.query("select set_config($1,$2,true)", ["test." + role, id]);
    await db.query(
      readFileSync("tests/fixtures/room-booking-experience.sql", "utf8"),
    );
    await db.query("set constraints all immediate");
    await db.query("rollback");
    assert.deepEqual(await snapshot(), before);
    console.log(
      "PASS PostgreSQL local: foto/Storage RLS, histórico/cursor/filtros, resumo, auditoria e negativos; ROLLBACK preservou estado",
    );
  } finally {
    await db.query("rollback");
    await db.end();
  }
}
if (process.argv[1]?.endsWith("room-booking-experience-local.mjs"))
  main().catch((e) => {
    console.error("FAIL experiência local:", e.code ?? e.message);
    process.exitCode = 1;
  });
