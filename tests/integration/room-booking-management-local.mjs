// Ensaio de schema no PostgreSQL local existente. O ledger nunca é escrito.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const versions = [
  "20261110131044_room_booking_contact",
  "20261110131045_room_booking_direct_history",
];
const absent = `
  select to_regclass('room_booking.room_contacts') is null
    and to_regprocedure('public.room_booking_contact()') is null
    and to_regprocedure('public.room_booking_save_contact(uuid,text,text,integer)') is null
    and to_regprocedure('public.room_booking_direct_history(text,date,date,timestamptz,uuid)') is null
    and to_regclass('room_booking.bookings_direct_history_order') is null
    and not exists (
      select 1 from supabase_migrations.schema_migrations
      where version in ('20261110131044', '20261110131045')
    );
`;
function psql(input, silent = false) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_gaucha-gestao-local",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-XqAt",
      "-v",
      "ON_ERROR_STOP=1",
      ...(silent ? ["-o", "/dev/null"] : []),
    ],
    { input, encoding: "utf8" },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr.trim());
  return result.stdout.trim();
}

const migrations = versions.map((name) => {
  const lines = readFileSync(`supabase/migrations/${name}.sql`, "utf8")
    .trim()
    .split(/\r?\n/);
  assert.equal(lines[0], "begin;");
  assert.equal(lines.at(-1), "commit;");
  return lines.slice(1, -1).join("\n");
});
const fixture = readFileSync(
  "tests/fixtures/room-booking-management.sql",
  "utf8",
);
const preflight = psql(`
  begin read only;
  select not exists (
    select 1 from pg_stat_activity where datname = current_database()
      and pid <> pg_backend_pid() and backend_type = 'client backend'
      and state in ('active', 'idle in transaction', 'idle in transaction (aborted)')
  );
  ${absent}
  rollback;
`);
assert.equal(
  preflight,
  "t\nt",
  "O ambiente local deve estar livre e sem as duas migrations.",
);
try {
  psql(
    [
      "begin;",
      "set local lock_timeout = '750ms';",
      "set local statement_timeout = '5s';",
      ...migrations,
      fixture,
      "set constraints all immediate;",
      "rollback;",
    ].join("\n"),
    true,
  );
} finally {
  assert.equal(
    psql(`begin read only; ${absent} rollback;`),
    "t",
    "O schema e o ledger devem permanecer sem GG-08/GG-09.",
  );
}
console.log(
  "PASS PostgreSQL local: fixture sintético GG-08/GG-09, ROLLBACK e ausência das migrations no schema e no ledger.",
);
