import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";

/** Exclusão local dirigida por recibos de UUID/chave, nunca por prefixo.
 * O chamador já confirmou gaucha-gestao-local por SalesLocalDatabase.open().
 * Recusa papéis protegidos, identidade externa, grant legítimo e FK desconhecida.
 * O arquivo privado preserva somente os registros sintéticos aprovados.
 */
export async function retireSalesRoles(db, { roles, users, backupPath, requireInactive = false }) {
  const ids = roles.map(r => r.id);
  const inspect = async () => {
    const dependencies = (await db.query(`select conrelid::regclass::text relation,
      confrelid::regclass::text target from pg_constraint where contype='f'
      and confrelid in ('core.roles'::regclass,'core.role_permissions'::regclass,'core.user_role_assignments'::regclass)`)).rows;
    assert.deepEqual(dependencies.map(d => `${d.relation}>${d.target}`).sort(),
      ["core.role_permissions>core.roles", "core.user_role_assignments>core.roles"], "FK desconhecida: preservar registros");
    const records = (await db.query("select * from core.roles where id=any($1::uuid[]) order by id for update", [ids])).rows;
    for (const r of records) {
      assert.equal(r.system, false, "Papel protegido: preservar");
      if (requireInactive) assert.equal(r.active, false, "Papel reativado: preservar");
      assert.equal(r.key, roles.find(x => x.id === r.id)?.key, "UUID/chave divergente: preservar");
      assert.ok((await db.query(`select 1 from core.system_audit_log where module='core'
        and entity_type='roles' and entity_id=$1 and action='insert' and actor_user_id is null
        and after_data->>'key'=$2 and after_data->>'system'='false'`, [r.id, r.key])).rows.length,
      "Sem proveniência de criação sintética: preservar");
    }
    const permissions = (await db.query("select * from core.role_permissions where role_id=any($1::uuid[]) order by role_id,permission_key for update", [ids])).rows;
    assert.ok(permissions.every(p => ["sales.entry.read", "sales.entry.create", "sales.entry.edit", "sales.entry.delete", "sales.dashboard.read", "sales.export.filtered", "sales.export.full"].includes(p.permission_key)), "Permissão externa: preservar");
    const assignments = (await db.query("select * from core.user_role_assignments where role_id=any($1::uuid[]) order by id for update", [ids])).rows;
    for (const a of assignments) {
      const expected = users.find(u => u.id === a.user_id);
      assert.ok(expected && a.granted_by === null, "Atribuição não comprovadamente sintética: preservar");
      if (requireInactive) assert.equal(a.active, false, "Atribuição reativada: preservar");
      const person = (await db.query(`select u.email,p.display_name,p.active from auth.users u
        join core.profiles p on p.id=u.id where u.id=$1 for update of p`, [a.user_id])).rows[0];
      assert.match(expected.email, /@example\.test$/);
      assert.equal(person?.email, expected.email, "Identidade diverge do recibo: preservar");
      assert.equal(person.display_name, expected.displayName, "Identidade diverge do recibo: preservar");
      if (requireInactive) assert.equal(person.active, false, "Perfil reativado: preservar");
    }
    return { roles: records, permissions, assignments };
  };
  let saved;
  for (const commit of [false, true]) {
    await db.query("begin");
    await db.query("set local lock_timeout='3s'");
    await db.query("set local statement_timeout='15s'");
    try {
      // Serializa preparação/revalidação com qualquer concessão concorrente local.
      await db.query("lock table core.roles,core.role_permissions,core.user_role_assignments in share row exclusive mode");
      const snapshot = await inspect();
      if (!commit) {
        saved = JSON.parse(JSON.stringify(snapshot));
        writeFileSync(backupPath, JSON.stringify({ preservation: "Somente registros sintéticos; auditoria permanece no banco. Restauração requer análise e transação explícita, sem seed automático.", ...saved }, null, 2), { mode: 0o600, flag: "wx" });
      } else assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), saved, "Inventário mudou após dry-run");
      const auditIds = (await db.query("select id from core.system_audit_log")).rows.map(r => r.id);
      const removed = {};
      for (const [name, column] of [["user_role_assignments", "role_id"], ["role_permissions", "role_id"], ["roles", "id"]]) {
        removed[name] = (await db.query(`delete from core.${name} where ${column}=any($1::uuid[])`, [ids])).rowCount;
      }
      assert.equal((await db.query("select count(*)::int n from core.system_audit_log where id=any($1::uuid[])", [auditIds])).rows[0].n, auditIds.length, "Auditoria anterior preservada");
      assert.equal((await db.query("select count(*)::int n from core.roles where id=any($1::uuid[])", [ids])).rows[0].n, 0);
      await db.query(commit ? "commit" : "rollback");
      if (commit) return { dryRun: "ROLLBACK", removed, backupPath };
    } catch (error) { await db.query("rollback"); throw error; }
  }
}

/** Todas as etapas são tentadas mesmo se navegador, RPC ou outra limpeza falhar. */
export async function finishSalesLocal(steps, errors = []) {
  for (const step of steps) {
    try { await step(); } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, "Teardown local incompleto: consulte manifesto e preserve resíduos para diagnóstico.");
}
