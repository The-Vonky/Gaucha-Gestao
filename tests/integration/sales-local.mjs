import { execFileSync } from "node:child_process";
import pg from "pg";

/** Opt-in exclusivo do notebook autorizado. Nunca descobre um projeto remoto. */
export class SalesLocalDatabase {
  static async open() {
    if (process.env.VEN03_LOCAL_TEST !== "gaucha-gestao-local")
      throw new Error("Validação local exige opt-in explícito gaucha-gestao-local.");
    const name = "supabase_db_gaucha-gestao-local";
    const info = JSON.parse(execFileSync("docker", ["inspect", name], { encoding: "utf8" }))[0];
    if (info.Name !== `/${name}` || !info.State.Running
      || !info.Config.Image.includes("supabase/postgres:")) throw new Error("Container local inesperado.");
    const port = info.NetworkSettings.Ports["5432/tcp"];
    if (!port.some(p => p.HostIp === "127.0.0.1" && p.HostPort === "54322"))
      throw new Error("Binding local inesperado.");
    const password = info.Config.Env.find(v => v.startsWith("POSTGRES_PASSWORD="))?.slice("POSTGRES_PASSWORD=".length);
    if (!password) throw new Error("Credencial local indisponível.");
    const client = new pg.Client({ host: "127.0.0.1", port: 54322, user: "postgres", database: "postgres", password });
    await client.connect();
    try {
      const db = new SalesLocalDatabase(client);
      const state = (await client.query(`select current_database() db,
        to_regprocedure('public.sales_dashboard(date,date,uuid[],text,date)') is not null analytics,
        (select count(*)::int from core.units) units,
        (select count(*)::int from core.profiles) profiles,
        (select count(*)::int from supabase_migrations.schema_migrations) migrations`)).rows[0];
      if (state.db !== "postgres" || !state.analytics) throw new Error("Schema local VEN-03 ausente.");
      // Sem ON CONFLICT: qualquer colisão aborta antes de alterar registros.
      const collisions = (await client.query(`select exists(select 1 from auth.users where id::text like '00000000-0000-0000-0000-%')
        or exists(select 1 from core.units where id::text like '10000000-0000-0000-0000-%' or code like 'VEN02-%')
        or exists(select 1 from core.roles where id::text like '30000000-0000-0000-0000-%' or key like 'ven02_%' or key='ven03_dashboard')
        or exists(select 1 from core.sectors where id::text like '20000000-0000-0000-0000-%' or code='VEN02-S') collision`)).rows[0].collision;
      if (collisions) throw new Error("Colisão de fixture: nenhum dado existente foi sobrescrito.");
      db.before = state;
      console.log("VEN-03 local: destino confirmado; contagens anteriores", state);
      await client.query("begin; set local statement_timeout='15s'; set local lock_timeout='3s'");
      return db;
    } catch (error) { await client.end(); throw error; }
  }
  constructor(client) { this.client = client; this.rollbackOnly = true; }
  async query(sql, args) {
    // Casos negativos não abortam o restante da transação de ensaio.
    await this.client.query("savepoint ven03_case");
    try {
      const result = await this.client.query(sql, args);
      await this.client.query("release savepoint ven03_case");
      return result;
    } catch (error) {
      await this.client.query("rollback to savepoint ven03_case; release savepoint ven03_case");
      throw error;
    }
  }
  exec(sql) { return this.query(sql); }
  async close() {
    if (this.rollbackOnly) {
      await this.client.query("rollback");
      const after = (await this.client.query(`select (select count(*)::int from core.units) units,
        (select count(*)::int from core.profiles) profiles,
        (select count(*)::int from supabase_migrations.schema_migrations) migrations`)).rows[0];
      if (["units", "profiles", "migrations"].some(key => after[key] !== this.before[key]))
        throw new Error("Estado local mudou durante a validação; inspecione antes de repetir.");
      console.log("VEN-03 local: ROLLBACK confirmado; contagens anteriores preservadas.");
    }
    await this.client.end();
  }
}
