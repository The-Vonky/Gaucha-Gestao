// Fixtures exclusivas do Compose pessoal com Identity. Segredos ficam em memória.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";

export const api = "http://127.0.0.1:54321";
export const origin = "http://127.0.0.1:5173";
const project = "gaucha-gestao-local";

function inspect(service, port) {
  const [container] = JSON.parse(execFileSync("docker", ["inspect", `${project}-${service}-1`], { encoding: "utf8" }));
  assert.equal(container.Config.Labels["com.docker.compose.project"], project);
  assert.equal(container.Config.Labels["com.docker.compose.service"], service);
  assert.equal(container.State.Health.Status, "healthy");
  if (port) {
    const bindings = container.HostConfig.PortBindings[port];
    const hostPort = service === "db" ? "54322" : "54321";
    assert.ok(bindings.some((binding) => binding.HostIp === "127.0.0.1"));
    assert.ok(bindings.every((binding) => ["127.0.0.1", "::1"].includes(binding.HostIp) && binding.HostPort === hostPort));
  }
  return container;
}

// Operações administrativas limitadas à criação e à remoção das fixtures.
function internal(service, path, method, body) {
  const result = execFileSync("docker", ["exec", "-i", `${project}-identity-1`, "node", "--input-type=module", "-e", `
    import { readFileSync } from "node:fs";
    const {service, path, method, body} = JSON.parse(readFileSync(0, "utf8"));
    const upstream = service === "auth" ? "http://auth:9999" : "http://storage:5000";
    const response = await fetch(upstream + path, {
      method,
      headers: {Authorization: "Bearer " + process.env.GG_IDENTITY_AUTH_ADMIN_KEY, "Content-Type": "application/json"},
      ...(body ? {body: JSON.stringify(body)} : {}),
    });
    const data = await response.json().catch(() => null);
    process.stdout.write(JSON.stringify({status: response.status, id: data?.id}));
  `], { input: JSON.stringify({ service, path, method, body }), encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
  return JSON.parse(result);
}

async function connectBrowserDatabase() {
  const container = inspect("db", "5432/tcp");
  const entry = container.Config.Env.find((item) => item.startsWith("POSTGRES_PASSWORD="));
  assert.ok(entry, "Credencial do banco local disponível no container");
  const db = new pg.Client({
    host: "127.0.0.1", port: 54322, database: "postgres", user: "postgres",
    password: entry.slice("POSTGRES_PASSWORD=".length),
  });
  await db.connect();
  return db;
}

export async function withRoomBrowserFixtures(run) {
  inspect("identity");
  inspect("kong", "8000/tcp");
  assert.equal((await fetch(origin + "/rooms", { redirect: "error" })).status, 200, "Vite disponível no checkout local");
  const db = await connectBrowserDatabase();
  const roles = {
    manager: "room_booking_manager",
    requester: "room_booking_requester",
    admin: "platform_administrator",
  };
  const actors = Object.fromEntries(Object.keys(roles).map((role) => {
    const id = randomUUID();
    return [role, { id, email: `rooms-${role}-${id}@example.test`, password: `Rooms!9-${randomUUID()}` }];
  }));
  const ids = Object.values(actors).map(({ id }) => id);
  let initialCover;
  let setupStarted = false;
  try {
    assert.equal((await db.query("select enabled from private.identity_settings")).rows[0]?.enabled, true);
    initialCover = (await db.query(`
      select c.* from room_booking.room_covers c join room_booking.rooms r on r.id=c.room_id
      where r.active order by r.id limit 1
    `)).rows[0];
    assert.ok(initialCover, "Sala ativa com configuração de foto");
    assert.equal(initialCover.asset_id, null, "O ensaio exige uma sala sem foto atual");
    assert.equal((await db.query("select count(*)::int n from room_booking.room_contacts where room_id=$1", [initialCover.room_id])).rows[0].n, 0,
      "O ensaio exige uma sala sem contato cadastrado");
    setupStarted = true;
    for (const [role, { id, email, password }] of Object.entries(actors)) {
      const created = internal("auth", "/admin/users", "POST", { id, email, password, email_confirm: true });
      assert.ok([200, 201].includes(created.status) && created.id === id, `Criação da identidade sintética ${role}, HTTP ${created.status}`);
      await db.query("insert into private.identity_credentials(user_id,state,managed) values ($1,'active',false)", [id]);
      const assigned = await db.query(`
        insert into core.user_role_assignments(user_id,role_id,scope_type)
        select $1,id,'global' from core.roles where key=$2 and active
      `, [id, roles[role]]);
      assert.equal(assigned.rowCount, 1, "Atribuição global da fixture");

      const response = await fetch(api + "/auth/v1/token?grant_type=password", {
        method: "POST", headers: { "Content-Type": "application/json", origin },
        body: JSON.stringify({ email, password }),
      });
      assert.equal(response.status, 200, `Admissão Identity da fixture ${role}`);
      actors[role].session = await response.json();
    }
    await run(actors);
  } finally {
    try {
      if (setupStarted) await cleanup(db, ids, initialCover);
    } finally {
      await db.end();
    }
  }
}

async function cleanup(db, ids, initialCover) {
  const { rows: assets } = await db.query(
    "select id,object_key from room_booking.cover_assets where created_by=any($1::uuid[])", [ids],
  );
  const keys = assets.map(({ object_key }) => object_key);
  if (keys.length) {
    const result = internal("storage", "/object/room-covers", "DELETE", { prefixes: keys });
    assert.ok([200, 204].includes(result.status), `Remoção dos objetos sintéticos, HTTP ${result.status}`);
  }
  const assetIds = assets.map(({ id }) => id);
  const audit = `actor_user_id=any($1::uuid[]) or entity_id=any($1::text[])
    or (entity_type='user_role_assignments' and
      (before_data->>'user_id'=any($1::text[]) or after_data->>'user_id'=any($1::text[])))`;
  await db.query("begin");
  try {
    // Remove só o contato criado pela fixture. Se alguém o editou, a versão deixa de coincidir.
    await db.query(`
      delete from room_booking.room_contacts c
      where c.room_id=$1 and c.version=1 and c.responsible_name='Contato sintético do navegador' and c.extension='0042'
        and exists (select 1 from core.system_audit_log l where l.actor_user_id=any($2::uuid[])
          and l.entity_type='room_contacts' and l.entity_id=c.room_id::text and l.action='contact_save')
    `, [initialCover.room_id, ids]);
    await db.query(`
      update room_booking.room_covers set asset_id=null, position_x=$2, position_y=$3, version=$4
      where room_id=$1 and asset_id=any($5::uuid[])
    `, [initialCover.room_id, initialCover.position_x, initialCover.position_y, initialCover.version, assetIds]);
    await db.query("delete from room_booking.cover_assets where id=any($1::uuid[])", [assetIds]);
    await db.query("delete from room_booking.bookings where created_by=any($1::uuid[])", [ids]);
    await db.query("delete from room_booking.requests where requester_user_id=any($1::uuid[])", [ids]);
    await db.query("delete from core.user_role_assignments where user_id=any($1::uuid[])", [ids]);
    await db.query("delete from private.identity_admissions where user_id=any($1::uuid[])", [ids]);
    await db.query("delete from private.identity_credentials where user_id=any($1::uuid[])", [ids]);
    // A restauração do ponteiro dispara auditoria com ator nulo. Removê-la pelo ativo da fixture.
    await db.query(`
      delete from core.system_audit_log where ${audit}
        or (entity_type='room_covers' and before_data->>'asset_id'=any($2::text[]))
    `, [ids, assetIds]);
    await db.query("delete from core.profiles where id=any($1::uuid[])", [ids]);
    await db.query(`delete from core.system_audit_log where ${audit}`, [ids]);
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
  for (const id of ids) {
    const result = internal("auth", `/admin/users/${id}`, "DELETE");
    assert.ok([200, 204, 404].includes(result.status), `Remoção de identidade sintética, HTTP ${result.status}`);
  }
  const { rows: [remaining] } = await db.query(`
    select
      (select count(*)::int from auth.users where id=any($1::uuid[])) users,
      (select count(*)::int from auth.sessions where user_id=any($1::uuid[])) sessions,
      (select count(*)::int from core.profiles where id=any($1::uuid[])) profiles,
      (select count(*)::int from private.identity_admissions where user_id=any($1::uuid[])) admissions,
      (select count(*)::int from private.identity_credentials where user_id=any($1::uuid[])) credentials,
      (select count(*)::int from core.user_role_assignments where user_id=any($1::uuid[])) assignments,
      (select count(*)::int from core.system_audit_log where ${audit}
        or (entity_type='room_covers' and before_data->>'asset_id'=any($2::text[]))) audit,
      (select count(*)::int from room_booking.cover_assets where id=any($2::uuid[])) assets,
      (select count(*)::int from storage.objects where bucket_id='room-covers' and name=any($3::text[])) objects,
      (select count(*)::int from room_booking.room_contacts where room_id=$4) contact,
      (select count(*)::int from room_booking.requests where requester_user_id=any($1::uuid[])) requests,
      (select count(*)::int from room_booking.bookings where created_by=any($1::uuid[])) bookings
  `, [ids, assetIds, keys, initialCover.room_id]);
  assert.ok(Object.values(remaining).every((count) => count === 0), "Ausência das fixtures e de sua trilha");
  const restored = await db.query("select * from room_booking.room_covers where room_id=$1", [initialCover.room_id]);
  assert.deepEqual(restored.rows[0], initialCover, "Configuração original de foto restaurada");
  console.log("PASS limpeza: identidades, registros, auditoria e objetos sintéticos ausentes; configuração da foto restaurada.");
}
