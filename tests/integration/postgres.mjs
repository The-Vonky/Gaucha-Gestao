import { randomBytes } from "node:crypto";
import pg from "pg";
// The SQL suite uses a separate empty database on the disposable local cluster.
export class Postgres {
  constructor(url) {
    // A role técnica é global ao cluster. O banco auxiliar executa os mesmos
    // grants e restrições sob um nome sem conflito com a aplicação já iniciada.
    this.identityRole = `gg_identity_review_${randomBytes(8).toString("hex")}`;
    this.client = new pg.Client({ connectionString: url });
    this.ready = this.client.connect();
  }
  async exec(sql) {
    await this.ready;
    return this.client.query(
      sql.replace(
        "create role anon nologin; create role authenticated nologin;",
        "",
      ).replace(/\bgg_identity\b/g, this.identityRole),
    );
  }
  async query(sql, params) {
    await this.ready;
    return this.client.query(sql, params);
  }
  async close() {
    await this.client.end();
  }
}
