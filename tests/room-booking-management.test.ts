import { readFileSync, readdirSync } from "node:fs";
import { it } from "vitest";
import { createTestDatabase } from "./pglite";
import { STORAGE_STUB } from "./storage-stub";

it("GG-08 e GG-09 aplicam D5-B, versionamento, auditoria e histórico por origem no banco", async () => {
  const db = createTestDatabase();
  try {
    await db.exec(readFileSync("tests/fixtures/room-booking-auth.sql", "utf8"));
    await db.exec(STORAGE_STUB);
    for (const file of readdirSync("supabase/migrations").sort())
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    await db.exec("begin");
    await db.exec(
      readFileSync("tests/fixtures/room-booking-management.sql", "utf8"),
    );
    await db.exec("set constraints all immediate; rollback");
  } finally {
    await db.close();
  }
}, 30000);
