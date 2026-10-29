// Intervenção autorizada da PR #94, SOMENTE notebook. Não é migration/seed.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { SalesLocalDatabase } from "./sales-local.mjs";
import { retireSalesRoles } from "./sales-role-cleanup.mjs";

assert.equal(process.env.VEN04B_LOCAL_TEST, "gaucha-gestao-local");
const directory = "tmp/ven04b-correction"; // Ignorado pelo Git; preservar no notebook.
mkdirSync(directory, { recursive: true, mode: 0o700 });
const path = `${directory}/catalog-inventory.json`;
const local = await SalesLocalDatabase.open(), db = local.client;
await db.query("rollback"); local.rollbackOnly = false;
try {
  if (process.argv[2] === "inventory") {
    const sources = [
      { tag: "VEN03-542fa7d6", suffixes: ["op", "read"], people: ["global", "reader", "denied"], doc: "docs/modules/sales/VEN03_LOCAL_VALIDATION.md" },
      ...["c3ee065b", "65d16aa2", "db29681c", "52472d04", "8e9668d6", "3d364035", "8b441b99"].map(t => ({
        tag: `VEN04A-${t}`, suffixes: ["operator", "creator", "reader", "editor", "deleter", "denied", "sector"],
        people: ["operator", "creator", "reader", "editor", "deleter", "denied", "sector"], doc: "docs/modules/sales/VEN04A_LOCAL_VALIDATION.md",
      })),
      { tag: "VEN04B-8b441b99", suffixes: ["global", "unita", "unitb", "operations", "creator", "denied", "sector"], people: [], doc: "docs/modules/sales/VEN04B_LOCAL_VALIDATION.md" },
    ];
    const roles = [], users = [];
    for (const source of sources) {
      assert.ok(readFileSync(source.doc, "utf8").includes(source.tag), "Tag não documentada");
      for (const suffix of source.suffixes) {
        const key = `${source.tag}-${suffix}`.toLowerCase();
        const row = (await db.query("select * from core.roles where key=$1", [key])).rows[0];
        assert.ok(row && !row.system && !row.active, `Papel não descartável: ${key}`);
        assert.equal(row.name.toLowerCase(), source.tag.startsWith("VEN03") ? key : `${source.tag} ${suffix}`.toLowerCase());
        const creation = (await db.query(`select id,occurred_at from core.system_audit_log
          where entity_type='roles' and entity_id=$1 and action='insert'
          and actor_user_id is null and after_data->>'key'=$2`, [row.id, key])).rows;
        assert.equal(creation.length, 1, "Criação sintética inequívoca exigida");
        roles.push({ id: row.id, key, tag: source.tag, source: source.doc, creation: creation[0] });
      }
      for (const name of source.people) {
        const email = `${source.tag}-${name}@example.test`.toLowerCase(), displayName = `${source.tag} ${name}`;
        const person = (await db.query(`select p.id,p.active,p.display_name,u.raw_user_meta_data->>'display_name' auth_name
          from auth.users u join core.profiles p on p.id=u.id where u.email=$1`, [email])).rows[0];
        assert.ok(person && !person.active);
        assert.equal(person.display_name, displayName); assert.equal(person.auth_name, displayName);
        users.push({ id: person.id, email, displayName });
      }
    }
    assert.equal(roles.length, 58);
    const state = (await db.query(`select (select count(*)::int from core.roles) roles,
      (select count(*)::int from core.role_permissions where role_id=any($1::uuid[])) permissions,
      (select count(*)::int from core.user_role_assignments where role_id=any($1::uuid[])) assignments,
      (select count(*)::int from core.user_role_assignments where role_id=any($1::uuid[]) and active) active_assignments`, [roles.map(r => r.id)])).rows[0];
    assert.equal(state.active_assignments, 0);
    const inventory = { target: "gaucha-gestao-local", date: "2026-10-29", state, roles, users,
      preservation: "Auditoria, usuários, unidades, permissões do catálogo e histórico financeiro permanecem. Backup privado das três relações antes do dry-run. Exclusões exclusivamente por UUID revalidado; sem CASCADE. Restauração somente após análise explícita do backup e FKs." };
    writeFileSync(path, JSON.stringify(inventory, null, 2), { mode: 0o600, flag: "wx" });
    console.log("Inventário salvo", { path, ...state, candidates: roles.length });
  } else if (process.argv[2] === "apply") {
    const inventory = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(inventory.target, "gaucha-gestao-local"); assert.equal(inventory.roles.length, 58);
    const result = await retireSalesRoles(db, { roles: inventory.roles, users: inventory.users, requireInactive: true, backupPath: `${directory}/catalog-preserved.json` });
    writeFileSync(`${directory}/catalog-result.json`, JSON.stringify(result, null, 2), { mode: 0o600, flag: "wx" });
    console.log("Limpeza direcionada confirmada", result);
  } else throw new Error("Use inventory para preparar e revisar; apply para dry-run/ROLLBACK e limpeza transacional.");
} finally { await local.close(); }
