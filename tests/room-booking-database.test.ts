import { readFileSync, readdirSync } from "node:fs";
import { it } from "vitest";
import { createTestDatabase } from "./pglite";
import { STORAGE_STUB } from "./storage-stub";

it("AG-01: integridade, intervalos, grants, RLS, delegação e revogação", async () => {
  const db = createTestDatabase();
  try {
    await db.exec(readFileSync("tests/fixtures/room-booking-auth.sql", "utf8"));
    await db.exec(STORAGE_STUB);
    for (const file of readdirSync("supabase/migrations").sort())
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    await db.exec(readFileSync("tests/fixtures/room-booking.sql", "utf8"));
  } finally {
    await db.close();
  }
}, 30000);
