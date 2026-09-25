import pg from "pg";
// The SQL suite uses a separate empty database on the disposable local cluster.
export class Postgres {
  constructor(url) {
    this.client = new pg.Client({ connectionString: url });
    this.ready = this.client.connect();
  }
  async exec(sql) {
    await this.ready;
    return this.client.query(
      sql.replace(
        "create role anon nologin; create role authenticated nologin;",
        "",
      ),
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
