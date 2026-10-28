import { readFileSync, readdirSync } from "node:fs";
import { it } from "vitest";
import { createTestDatabase } from "./pglite";
import { STORAGE_STUB } from "./storage-stub";

// Exclusivamente PGlite isolado em memória: não conecta notebook, DEV, STAGING ou PROD.
// Testa também a sequência completa de migrations existentes para detectar regressões.
it("VEN-01: schema privado, centavos exatos, auditoria e negação de acesso", async () => {
  const db = createTestDatabase();
  try {
    await db.exec(readFileSync("tests/fixtures/room-booking-auth.sql", "utf8"));
    await db.exec(STORAGE_STUB);
    for (const file of readdirSync("supabase/migrations").sort()) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    }
    await db.exec(readFileSync("tests/fixtures/sales-foundation.sql", "utf8"));
  } finally {
    await db.close();
  }
}, 60_000);
