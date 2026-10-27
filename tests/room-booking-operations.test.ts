import { readFileSync, readdirSync } from "node:fs";
import { it, expect } from "vitest";
import { createTestDatabase } from "./pglite";
import { STORAGE_STUB } from "./storage-stub";
it("AG-02: RPC, privacidade, versão, horários, transições e revogação", async () => {
  const db = createTestDatabase();
  try {
    await db.exec(readFileSync("tests/fixtures/room-booking-auth.sql", "utf8"));
    await db.exec(STORAGE_STUB);
    for (const file of readdirSync("supabase/migrations").sort())
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    await db.exec(
      readFileSync("tests/fixtures/room-booking-operations.sql", "utf8"),
    );
    const result = await db.query<{ count: number }>(
      "select count(*)::int as count from core.system_audit_log where module='room_booking'",
    );
    expect(result.rows[0].count).toBeGreaterThan(10);
  } finally {
    await db.close();
  }
}, 30000);
