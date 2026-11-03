import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";

/** Exclusivamente fixtures locais com recibos, após SalesLocalDatabase.open().
 * Não adota unidades preexistentes nem remove dados de outros domínios.
 * A autorização MEL-01 cobre o histórico destas unidades sintéticas.
 */
export async function retireSalesUnits(db, { units, users, backupPath, statuses = [] }) {
  const ids = units.map(u => u.id), userIds = users.map(u => u.id);
  for (const unit of units) {
    assert.match(unit.tag, /^VEN(?:03|04A|04B)-[0-9a-f]{8}$/);
    assert.ok(["A", "B", "C"].some(suffix => unit.code === `${unit.tag}-${suffix}`));
    assert.equal(unit.name, unit.code, "UUID/código/nome divergente: preservar");
  }
  const months = statuses.map(s => s.competency);
  const dependencies = ["core.unit_sectors", "core.user_role_assignments", "core.system_audit_log",
    "audit.inspections", "action_plans.plans", "core.unit_cover_assets", "abc.source_files",
    "abc.report_series", "abc.report_revisions", "abc.revision_lines", "sales.entries", "sales.legacy_monthly_adjustments"];
  const triggers = [["core.units", "record_change"], ["core.unit_sectors", "record_change"],
    ["core.user_role_assignments", "record_change"], ["sales.entries", "guard_entry_mutation"],
    ["sales.legacy_monthly_adjustments", "adjustments_immutable"], ["sales.month_statuses", "month_statuses_immutable"]];
  const inspect = async () => {
    assert.deepEqual((await db.query(`select conrelid::regclass::text relation from pg_constraint
      where contype='f' and confrelid='core.units'::regclass`)).rows.map(r => r.relation).sort(), dependencies.slice().sort(), "FK desconhecida: preservar fixture");
    assert.deepEqual((await db.query(`select conrelid::regclass::text||'>'||confrelid::regclass::text dependency
      from pg_constraint where contype='f' and confrelid in ('core.unit_sectors'::regclass,
      'core.user_role_assignments'::regclass,'sales.entries'::regclass,'sales.legacy_monthly_adjustments'::regclass,
      'sales.month_statuses'::regclass,'core.system_audit_log'::regclass)`)).rows.map(r => r.dependency).sort(),
    ["action_plans.plans>core.unit_sectors", "core.user_role_assignments>core.unit_sectors"], "FK indireta desconhecida: preservar fixture");
    for (const u of users) {
      assert.match(u.email, /@example\.test$/);
      const row = (await db.query(`select u.email,p.display_name from auth.users u join core.profiles p on p.id=u.id where u.id=$1`, [u.id])).rows[0];
      assert.equal(row?.email, u.email);
      assert.equal(row.display_name, u.displayName);
    }
    const records = {};
    records["core.units"] = (await db.query("select * from core.units where id=any($1::uuid[]) order by id for update", [ids])).rows;
    for (const row of records["core.units"]) {
      const receipt = units.find(u => u.id === row.id);
      assert.equal(row.code, receipt.code, "UUID/código diverge: preservar");
      assert.equal(row.name, receipt.name, "UUID/nome diverge: preservar");
      assert.ok(row.created_by === null || userIds.includes(row.created_by));
      assert.ok((await db.query(`select 1 from core.system_audit_log where module='core' and entity_type='units'
        and action='insert' and entity_id=$1 and after_data->>'code'=$2
        and (actor_user_id is null or actor_user_id=any($3::uuid[]))`, [row.id, receipt.code, userIds])).rows.length, "Sem proveniência sintética");
      assert.equal(row.cover_asset_id, null, "Capa externa: preservar");
    }
    for (const relation of dependencies.filter(r => r !== "core.system_audit_log")) {
      records[relation] = (await db.query(`select * from ${relation} where unit_id=any($1::uuid[]) order by unit_id for update`, [ids])).rows;
      if (!["sales.entries", "sales.legacy_monthly_adjustments", "core.user_role_assignments", "core.unit_sectors"].includes(relation))
        assert.equal(records[relation].length, 0, `Dependência fora da fixture: ${relation}`);
    }
    for (const row of records["sales.entries"]) {
      assert.ok(userIds.includes(row.created_by), "Autoria externa: preservar lançamento");
      assert.equal(row.import_batch_id, null, "Importação externa: preservar");
    }
    for (const row of records["sales.legacy_monthly_adjustments"])
      assert.ok(row.import_batch_id === null && row.reason.startsWith(units[0].tag), "Ajuste externo: preservar");
    for (const row of records["core.user_role_assignments"])
      assert.ok(userIds.includes(row.user_id) && row.granted_by === null, "Atribuição externa: preservar");
    records["sales.month_statuses"] = (await db.query("select * from sales.month_statuses where competency=any($1::date[]) order by competency for update", [months])).rows;
    for (const row of records["sales.month_statuses"]) {
      const date = row.competency instanceof Date ? row.competency.toISOString().slice(0, 10) : row.competency;
      const receipt = statuses.find(s => s.competency === date);
      assert.equal(row.source, receipt.source, "Snapshot externo: preservar");
      assert.equal(row.is_closed, receipt.is_closed);
      assert.equal(row.last_day_with_data, receipt.last_day_with_data);
      assert.equal(row.import_batch_id, null);
    }
    assert.equal((await db.query(`select count(*)::int n from sales.entries where date_trunc('month',sale_date)::date=any($1::date[]) and not(unit_id=any($2::uuid[]))`, [months, ids])).rows[0].n, 0, "Snapshot usado fora da fixture: preservar");
    assert.equal((await db.query(`select count(*)::int n from sales.legacy_monthly_adjustments where competency=any($1::date[]) and not(unit_id=any($2::uuid[]))`, [months, ids])).rows[0].n, 0, "Snapshot usado fora da fixture: preservar");
    const entities = [...ids, ...records["sales.entries"].map(r => r.id), ...records["sales.legacy_monthly_adjustments"].map(r => r.id)];
    records["core.system_audit_log"] = (await db.query(`select * from core.system_audit_log where unit_id=any($1::uuid[])
      or (module='sales' and entity_type='month_statuses' and entity_id=any($2::text[]))
      or (module in ('core','sales') and entity_id=any($3::text[])) order by id for update`, [ids, months, entities])).rows;
    assert.ok(records["core.system_audit_log"].every(r => r.actor_user_id === null || userIds.includes(r.actor_user_id)), "Ator externo: preservar auditoria");
    // Ordenação canônica para comparar dry-run/execução mesmo após planos diferentes.
    for (const rows of Object.values(records)) rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return JSON.parse(JSON.stringify(records));
  };
  let saved;
  for (const commit of [false, true]) {
    await db.query("begin");
    await db.query("set local lock_timeout='3s'");
    await db.query("set local statement_timeout='15s'");
    try {
      await db.query(`lock table ${[...dependencies, "core.units", "sales.month_statuses"].sort().join(",")} in share row exclusive mode`);
      const snapshot = await inspect();
      if (!commit) {
        saved = snapshot;
        writeFileSync(backupPath, JSON.stringify({ target: "gaucha-gestao-local", ...snapshot }, null, 2), { mode: 0o600, flag: "wx" });
      } else assert.deepEqual(snapshot, saved, "Fixture mudou após dry-run: preservar");
      const unrelatedAudit = (await db.query("select id from core.system_audit_log where not(id=any($1::uuid[])) order by id", [snapshot["core.system_audit_log"].map(r => r.id)])).rows;
      for (const [relation, trigger] of triggers) {
        assert.equal((await db.query("select tgenabled from pg_trigger where tgrelid=$1::regclass and tgname=$2", [relation, trigger])).rows[0]?.tgenabled, "O");
        await db.query(`alter table ${relation} disable trigger ${trigger}`);
      }
      const removed = {};
      const remove = async (relation, sql, values) => {
        const result = await db.query(sql, values);
        removed[relation] = result.rowCount ?? result.affectedRows;
      };
      for (const relation of ["sales.entries", "sales.legacy_monthly_adjustments", "core.user_role_assignments", "core.unit_sectors"])
        await remove(relation, `delete from ${relation} where unit_id=any($1::uuid[])`, [ids]);
      await remove("sales.month_statuses", "delete from sales.month_statuses where competency=any($1::date[])", [months]);
      await remove("core.system_audit_log", "delete from core.system_audit_log where id=any($1::uuid[])", [snapshot["core.system_audit_log"].map(r => r.id)]);
      await remove("core.units", "delete from core.units where id=any($1::uuid[])", [ids]);
      for (const [relation, trigger] of triggers) {
        await db.query(`alter table ${relation} enable trigger ${trigger}`);
        assert.equal((await db.query("select tgenabled from pg_trigger where tgrelid=$1::regclass and tgname=$2", [relation, trigger])).rows[0]?.tgenabled, "O");
      }
      await db.query("set constraints all immediate");
      assert.deepEqual((await db.query("select id from core.system_audit_log order by id")).rows, unrelatedAudit);
      assert.equal((await db.query("select count(*)::int n from core.units where id=any($1::uuid[])", [ids])).rows[0].n, 0);
      await db.query(commit ? "commit" : "rollback");
      if (commit) return { dryRun: "ROLLBACK", removed, backupPath, protectionsRestored: true };
    } catch (error) { await db.query("rollback"); throw error; }
  }
}
