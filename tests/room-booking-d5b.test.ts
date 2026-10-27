import { readFileSync, readdirSync } from "node:fs";
import { it, expect } from "vitest";
import { createTestDatabase } from "./pglite";
import { STORAGE_STUB } from "./storage-stub";

it("D5-B: separação, nomes preservados e provisionamento técnico auditado", async () => {
  const db = createTestDatabase();
  try {
    await db.exec(readFileSync("tests/fixtures/room-booking-auth.sql", "utf8"));
    await db.exec(STORAGE_STUB);
    const migrations = readdirSync("supabase/migrations").sort();
    for (const file of migrations.filter((f) => !f.includes("d5b_access")))
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    const before = await db.query("select id,key,system,active,global_only from core.roles order by key");
    for (const file of migrations.filter((f) => f.includes("d5b_access")))
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    expect((await db.query("select id,key,system,active,global_only from core.roles order by key")).rows).toEqual(before.rows);
    await db.exec(readFileSync("tests/fixtures/room-booking-operations.sql", "utf8"));
    await db.exec(readFileSync("tests/fixtures/room-booking-d5b.sql", "utf8"));
    await db.exec("select set_config('request.jwt.claim.sub','',false)");
    await db.exec(`select set_config('room_booking.operator_id','a9020000-0000-0000-0000-000000000004',false),
      set_config('room_booking.target_id','a9020000-0000-0000-0000-000000000003',false),
      set_config('room_booking.authorization_ref','teste D5-B',false),
      set_config('room_booking.provision_action','grant',false)`);
    const procedure = readFileSync("scripts/ops/room-booking-manager.sql", "utf8");
    await db.exec(procedure);
    await db.exec("select set_config('room_booking.provision_action','revoke',false)");
    await db.exec(procedure);
    expect((await db.query("select action from core.system_audit_log where action in ('technical_grant','technical_revoke') order by occurred_at")).rows).toEqual([{action:"technical_grant"},{action:"technical_revoke"}]);
    await db.exec("select set_config('room_booking.target_id','a9020000-0000-0000-0000-000000000004',false), set_config('room_booking.provision_action','grant',false)");
    await expect(db.exec(procedure)).rejects.toMatchObject({code:"42501"});
  } finally { await db.close(); }
}, 30000);
