import { readFileSync, readdirSync } from "node:fs";
import { it } from "vitest";
import { createTestDatabase } from "./pglite";
import { STORAGE_STUB } from "./storage-stub";
it("Foto, histórico e resumo: autorização, Storage, versão, auditoria, filtros e cursor", async () => {
  const db = createTestDatabase();
  try {
    await db.exec(readFileSync("tests/fixtures/room-booking-auth.sql", "utf8"));
    await db.exec(STORAGE_STUB);
    for (const file of readdirSync("supabase/migrations").sort())
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    await db.exec(`insert into auth.users(id) values ('a9030000-0000-0000-0000-000000000001'),('a9030000-0000-0000-0000-000000000002'),('a9030000-0000-0000-0000-000000000003');
      insert into core.user_role_assignments(user_id,role_id,scope_type) select 'a9030000-0000-0000-0000-000000000001',id,'global' from core.roles where key='room_booking_manager';
      insert into core.user_role_assignments(user_id,role_id,scope_type) select 'a9030000-0000-0000-0000-000000000002',id,'global' from core.roles where key='room_booking_requester';
      insert into core.user_role_assignments(user_id,role_id,scope_type) select 'a9030000-0000-0000-0000-000000000003',id,'global' from core.roles where key='platform_administrator';
      select set_config('test.manager','a9030000-0000-0000-0000-000000000001',false),set_config('test.requester','a9030000-0000-0000-0000-000000000002',false),set_config('test.admin','a9030000-0000-0000-0000-000000000003',false);`);
    await db.exec("begin");
    await db.exec(
      readFileSync("tests/fixtures/room-booking-experience.sql", "utf8"),
    );
    await db.exec("rollback");
  } finally {
    await db.close();
  }
}, 30000);
