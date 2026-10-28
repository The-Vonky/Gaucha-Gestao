import assert from "node:assert/strict";
import pg from "pg";
import { salesCiUrl } from "./sales-ci.mjs";

// Exclusivo do serviço PostgreSQL vazio do CI; não consulta config/.env/Supabase local.
const url = salesCiUrl();
const a = new pg.Client({ connectionString: url });
const b = new pg.Client({ connectionString: url });
const observer = new pg.Client({ connectionString: url });
const user = "00000000-0000-0000-0000-000000000003";
const A = "10000000-0000-0000-0000-000000000001";
const B = "10000000-0000-0000-0000-000000000002";
let pending;
let sequence = 0;
const date = () => `2090-01-${String(++sequence).padStart(2, "0")}`;
const sql = {
  create: (d, unit = A) => ({ text: "select public.sales_entry_create($1,$2,'Stone','0.01') result", values: [d, unit] }),
  update: (e, unit = e.unit_id) => ({ text: "select public.sales_entry_update($1,$2,$3,$4,'Stone','0.29') result", values: [e.id, e.version, e.sale_date, unit] }),
  delete: e => ({ text: "select public.sales_entry_delete($1,$2) result", values: [e.id, e.version] }),
};
const result = r => r.rows[0].result;
async function begin(client, identity = user) {
  await client.query("begin");
  await client.query("set local statement_timeout='12s'");
  if (identity) {
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [identity]);
    await client.query("set local role authenticated");
  }
}
async function seed(unit = A) {
  await begin(a, "00000000-0000-0000-0000-000000000002");
  const e = result(await a.query(sql.create(date(), unit)));
  await a.query("commit");
  return e;
}
async function blocked(waiter, blocker) {
  const waiterPid = (await observer.query("select pid from pg_stat_activity where application_name=$1", [waiter])).rows[0].pid;
  const blockerPid = (await observer.query("select pid from pg_stat_activity where application_name=$1", [blocker])).rows[0].pid;
  for (let i = 0; i < 100; i++) {
    const pids = (await observer.query("select pg_blocking_pids($1) pids", [waiterPid])).rows[0].pids;
    if (pids.includes(blockerPid)) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail(`${waiter} deveria estar bloqueado por ${blocker}`);
}
function launch(client, query) {
  // Captura imediata para que uma falha rápida continue observável, sem rejection solta.
  return client.query(query).then(value => ({ value }), error => ({ error }));
}
async function race(label, first, second, expectedCode) {
  await begin(a);
  await begin(b);
  const winner = result(await a.query(first));
  pending = launch(b, second);
  await blocked("ven02-b", "ven02-a");
  await a.query("commit");
  const loser = await pending;
  if (expectedCode) {
    assert.equal(loser.error?.code, expectedCode, label);
    await b.query("rollback");
  } else {
    assert.equal(loser.error, undefined, label);
    await b.query("commit");
  }
  console.log(`PASS ${label}: bloqueio PostgreSQL observado; ${expectedCode ?? "sucesso"}`);
  return { winner, loser: loser.value && result(loser.value) };
}
async function auditCount(id) {
  return Number((await observer.query("select count(*) n from core.system_audit_log where module='sales' and entity_id=$1", [id])).rows[0].n);
}

try {
  await Promise.all([a.connect(), b.connect(), observer.connect()]);
  await a.query("set application_name='ven02-a'");
  await b.query("set application_name='ven02-b'");
  const d = date();
  const { winner: created } = await race("duas criações da mesma chave", sql.create(d), sql.create(d), "23505");
  assert.equal(await auditCount(created.id), 1);
  const { winner: edited } = await race("duas edições da mesma versão", sql.update(created), sql.update(created), "40001");
  assert.equal(edited.version, 2);
  assert.equal(await auditCount(created.id), 2);
  const { winner: editedAgain } = await race("edição antes da exclusão", sql.update(edited), sql.delete(edited), "40001");
  assert.equal(await auditCount(created.id), 3);
  await race("exclusão antes da edição", sql.delete(editedAgain), sql.update(editedAgain), "P0002");
  assert.equal(await auditCount(created.id), 4);
  const e = await seed();
  await race("exclusão repetida", sql.delete(e), sql.delete(e), "P0002");
  assert.equal(await auditCount(e.id), 2);
  const replace = await seed();
  const replacement = await race("nova chave aguarda exclusão concorrente", sql.delete(replace), sql.create(replace.sale_date));
  assert.notEqual(replacement.loser.id, replace.id);
  const rows = (await observer.query("select id from sales.entries where sale_date=$1 and unit_id=$2 and payment_method='Stone' and deleted_at is null", [d, A])).rows;
  assert.equal(rows.length, 0);

  const revocations = [
    { name: "atribuição", revoke: `update core.user_role_assignments set active=false where user_id='${user}'`, restore: `update core.user_role_assignments set active=true where user_id='${user}'` },
    { name: "perfil", revoke: `update core.profiles set active=false where id='${user}'`, restore: `update core.profiles set active=true where id='${user}'; update core.user_role_assignments set active=true where user_id='${user}'` },
    { name: "papel", revoke: "update core.roles set active=false where key='ven02_operator'", restore: "update core.roles set active=true where key='ven02_operator'" },
    { name: "capacidade no papel", revoke: "delete from core.role_permissions where role_id='30000000-0000-0000-0000-000000000001' and permission_key='sales.entry.create'", restore: "insert into core.role_permissions(role_id,permission_key) values('30000000-0000-0000-0000-000000000001','sales.entry.create')" },
    { name: "catálogo", revoke: "update core.permissions set active=false where key='sales.entry.create'", restore: "update core.permissions set active=true where key='sales.entry.create'" },
  ];
  for (const scenario of revocations) {
    const day = date();
    // Operação chega primeiro: revogação aguarda commit, próxima chamada nega.
    await begin(a);
    const successful = result(await a.query(sql.create(day)));
    await begin(b, null);
    pending = launch(b, scenario.revoke);
    await blocked("ven02-b", "ven02-a");
    await a.query("commit");
    assert.equal((await pending).error, undefined);
    await b.query("commit");
    await begin(a);
    await assert.rejects(a.query(sql.create(day)), { code: "42501" });
    await a.query("rollback");
    assert.equal(await auditCount(successful.id), 1);
    await observer.query(scenario.restore);
    // Revogação chega primeiro: operação espera e reavalia o estado confirmado.
    await begin(b, null);
    await b.query(scenario.revoke);
    await begin(a);
    pending = launch(a, sql.create(day));
    await blocked("ven02-a", "ven02-b");
    await b.query("commit");
    assert.equal((await pending).error?.code, "42501", scenario.name);
    await a.query("rollback");
    await observer.query(scenario.restore);
    assert.equal(await auditCount(successful.id), 1);
    console.log(`PASS revogação de ${scenario.name}: ambas as ordens e sem auditoria falsa`);
  }

  for (const transfer of [false, true]) {
    const target = transfer ? B : A;
    const original = transfer ? await seed() : null;
    const query = transfer ? sql.update(original, B) : sql.create(date());
    const who = transfer ? "00000000-0000-0000-0000-000000000002" : user;
    await begin(a, who);
    const changed = result(await a.query(query));
    await begin(b, null);
    pending = launch(b, { text: "update core.units set active=false where id=$1", values: [target] });
    await blocked("ven02-b", "ven02-a");
    await a.query("commit");
    assert.equal((await pending).error, undefined);
    await b.query("commit");
    await observer.query("update core.units set active=true where id=$1", [target]);
    // Para transferência, retornar à origem antes do ensaio inverso.
    const reverseSource = transfer ? await seed() : null;
    const deniedQuery = transfer ? sql.update(reverseSource, B) : sql.create(date());
    await begin(b, null);
    await b.query("update core.units set active=false where id=$1", [target]);
    await begin(a, who);
    pending = launch(a, deniedQuery);
    await blocked("ven02-a", "ven02-b");
    await b.query("commit");
    assert.equal((await pending).error?.code, "23514");
    await a.query("rollback");
    if (transfer) assert.equal(await auditCount(reverseSource.id), 1);
    assert.equal(await auditCount(changed.id), transfer ? 2 : 1);
    await observer.query("update core.units set active=true where id=$1", [target]);
    console.log(`PASS inativação concorrente: ${transfer ? "transferência" : "criação"}, ambas as ordens`);
  }
  console.log("PASS VEN-02: concorrência real, centavos, versão e revogação transacional");
} finally {
  // Libera bloqueios mesmo se uma asserção falhar; nada aponta para banco persistente.
  await a.query("rollback").catch(() => {});
  await b.query("rollback").catch(() => {});
  await pending?.catch(() => {});
  await Promise.all([a.end(), b.end(), observer.end()]);
}
