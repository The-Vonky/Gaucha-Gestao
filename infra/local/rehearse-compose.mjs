import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import sharp from "sharp";

const project = "gg-dev-lab-" + randomBytes(5).toString("hex");
const restored = project + "-restore";
const directory = mkdtempSync(join(tmpdir(), "gg-compose-proof-"));
const environment = join(directory, "backend.env");
const restoredEnvironment = join(directory, "restored.env");
const backup = join(directory, "backup");
const frontend = join(directory, "web.env");
const base = ["compose", "-f", "infra/local/compose.yaml"];
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8" }).trim();
const compose = (name, file, ...args) => docker(...base, "--project-name", name, "--env-file", file, ...args);
const dev = (name, file, ...args) => execFileSync("python3", ["-B", "infra/local/local-dev.py",
  "--project", name, "--env-file", file, ...args], { stdio: ["ignore", "inherit", "inherit"] });
const digest = data => createHash("sha256").update(data).digest("hex");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const transform = { width: 480, height: 480, resize: "contain", quality: 75, format: "origin" };
const defaults = new Set([54321, 54322, 54323, 5173]);
let fixture, server;
let phase = "isolamento inicial";

async function ports(count) {
  const listeners = [];
  try {
    while (listeners.length < count) {
      const listener = createServer();
      await new Promise((resolve, reject) => {
        listener.once("error", reject);
        listener.listen(0, "127.0.0.1", resolve);
      });
      listeners.push(listener);
    }
    const selected = listeners.map(listener => listener.address().port);
    assert.ok(selected.every(port => !defaults.has(port)));
    return selected;
  } finally {
    for (const listener of listeners) listener.close();
  }
}

function snapshotOriginals() {
  const ids = docker("ps", "-aq", "--filter", "label=com.supabase.cli.project=gaucha-gestao-local");
  const sidecar = docker("ps", "-aq", "--filter", "name=^/gaucha-gestao-local-audit-imgproxy$");
  const all = [...ids.split("\n"), ...sidecar.split("\n")].filter(Boolean);
  return all.length ? docker("inspect", "--format", "{{.Id}} {{.State.StartedAt}} {{.State.Status}}", ...all) : "";
}

async function waitHttp(url) {
  for (let attempt = 0; attempt < 70; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      await response.body?.cancel();
      if (response.ok) return;
    } catch { /* serviço em partida */ }
    await sleep(500);
  }
  assert.fail("HTTP indisponível");
}

async function portRefused(host) {
  const refused = await new Promise(resolve => {
    const socket = connect({ host, port: 8080 });
    socket.setTimeout(1200);
    socket.once("connect", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(true));
    socket.once("timeout", () => { socket.destroy(); resolve(true); });
  });
  assert.equal(refused, true);
}

function container(service) {
  return compose(project, environment, "ps", "-q", service);
}

function inspect(id, format) {
  return JSON.parse(docker("inspect", "--format", format, id));
}

async function readImage(api, bucket, sample) {
  const preview = fixture.must(await bucket.createSignedUrl(sample.key, 60, { transform })).signedUrl;
  assert.equal(new URL(preview).origin, api);
  const response = await fetch(preview, { signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.has("expires"), false);
  const { width, height } = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
  assert.equal(Math.max(width, height), 480);
  const original = fixture.must(await bucket.createSignedUrl(sample.key, 60)).signedUrl;
  const download = await fetch(original + "&download=sintetica.jpg");
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-disposition"), /^attachment/);
  assert.equal(digest(Buffer.from(await download.arrayBuffer())), sample.hash);
}

async function inventory(db) {
  const files = readdirSync("supabase/migrations").filter(file => file.endsWith(".sql"));
  const { rows } = await db.query("select version from supabase_migrations.schema_migrations order by version");
  assert.deepEqual(rows.map(row => row.version), files.map(file => file.split("_")[0]).sort());
  const result = await db.query(`select
    (select count(*)::int from storage.buckets) as buckets,
    (select count(*)::int from storage.objects) as objects,
    (select count(*)::int from auth.users) as users,
    (select count(*)::int from audit.checklist_evidence) as evidence,
    (select count(*)::int from pg_policies where schemaname in ('audit','core','storage')) as policies,
    (select count(*)::int from pg_trigger where tgrelid='audit.checklist_evidence'::regclass) as triggers,
    (select count(*)::int from pg_roles) as roles,
    (select count(*)::int from information_schema.role_table_grants where table_schema in ('audit','core','storage')) as grants`);
  assert.equal(result.rows[0].buckets, 7);
  return result.rows[0];
}

const originalContainers = snapshotOriginals();
try {
  const [apiPort, dbPort, studioPort, restoreApi, restoreDb, restoreStudio, vitePort] = await ports(7);
  const api = "http://127.0.0.1:" + apiPort;
  phase = "provisionamento do Compose";
  dev(project, environment, "secrets", "--ports", apiPort, dbPort, studioPort);
  dev(project, environment, "install");
  await waitHttp("http://127.0.0.1:" + studioPort + "/api/platform/profile");
  compose(project, environment, "exec", "-T", "studio", "node", "-e",
    "fetch(process.env.STUDIO_PG_META_URL+'/schemas').then(r=>{if(!r.ok)process.exit(1)})");
  assert.equal(compose(project, environment, "ps", "--services", "--status", "running").split("\n").length, 8);
  const proxy = container("imgproxy");
  const storage = container("storage");
  const network = inspect(proxy, "{{json .NetworkSettings.Networks}}");
  assert.deepEqual(Object.keys(network), [project + "_transforms"]);
  assert.deepEqual(Object.keys(inspect(storage, "{{json .NetworkSettings.Networks}}")).sort(),
    [project + "_default", project + "_transforms"]);
  assert.equal(inspect(proxy, "{{json .HostConfig.NetworkMode}}").startsWith("container:"), false);
  assert.deepEqual(inspect(proxy, "{{json .HostConfig.PortBindings}}") ?? {}, {});
  assert.equal(inspect(proxy, "{{json .HostConfig.NanoCpus}}"), 1_000_000_000);
  assert.equal(inspect(proxy, "{{json .HostConfig.Memory}}"), 512 * 1024 * 1024);
  assert.equal(inspect(proxy, "{{json .Mounts}}").find(mount => mount.Destination === "/isolated/mnt").RW, false);
  for (const service of compose(project, environment, "ps", "--services").split("\n")) {
    assert.equal(inspect(container(service), "{{json .HostConfig.RestartPolicy.Name}}"), "unless-stopped");
  }
  await portRefused("127.0.0.1");
  await portRefused("::1");
  await portRefused(network[project + "_transforms"].IPAddress);
  const ip = network[project + "_transforms"].IPAddress;
  const probe = "const url=process.argv[1];fetch(url,{signal:AbortSignal.timeout(1200)})";
  compose(project, environment, "exec", "-T", "studio", "node", "-e",
    probe + ".then(()=>process.exit(1),()=>process.exit(0))", "http://" + ip + ":8080/health");
  compose(project, environment, "exec", "-T", "storage", "node", "-e",
    probe + ".then(r=>{if(!r.ok)process.exit(1)},()=>process.exit(1))", "http://imgproxy:8080/health");
  console.log("PASS oito serviços, Studio/pg_meta, volumes, limites, healthchecks e isolamento do imgproxy.");

  phase = "Auth, REST, RLS e transformação";
  process.env.GG_TEST_AUDIT_COMPOSE_ENV = environment;
  fixture = await import("../../tests/integration/audit-evidence-fixture.mjs");
  await fixture.setup();
  await inventory(fixture.db);
  const samples = [];
  for (const [width, height] of [[4000, 2250], [8160, 6120]]) {
    const bytes = await sharp({ create: { width, height, channels: 3, background: "#d1662d" } }).jpeg().toBuffer();
    const inspection = await fixture.inspection();
    const evidence = await fixture.begin("owner", inspection, "item-001", "sintetica.jpg", "image/jpeg", bytes.length);
    fixture.must(await fixture.upload("owner", evidence.object_key, fixture.blob(bytes, "image/jpeg")));
    fixture.fails(await fixture.bucket("owner").createSignedUrl(evidence.object_key, 60, { transform }));
    fixture.must(await fixture.confirm("owner", evidence.evidence_id));
    for (const user of ["anon", "inactive", "empty", "other", "sector", "editOnly"]) {
      fixture.fails(await fixture.bucket(user).createSignedUrl(evidence.object_key, 60, { transform }));
    }
    const sample = { key: evidence.object_key, hash: digest(bytes), inspection };
    await readImage(api, fixture.bucket("reader"), sample);
    samples.push(sample);
  }
  console.log("PASS login, REST, RLS, miniaturas de 9 MP e 49,94 MP, cache privado e originais íntegros.");

  phase = "reinício e recriação de serviços";
  compose(project, environment, "restart", "storage");
  await waitHttp(api + "/storage/v1/status");
  await readImage(api, fixture.bucket("reader"), samples[0]);
  assert.equal(container("imgproxy"), proxy);
  compose(project, environment, "up", "-d", "--wait", "--no-deps", "--force-recreate", "storage");
  assert.notEqual(container("storage"), storage);
  assert.equal(container("imgproxy"), proxy);
  await readImage(api, fixture.bucket("reader"), samples[1]);
  compose(project, environment, "stop", "imgproxy");
  const signed = fixture.must(await fixture.bucket("reader").createSignedUrl(samples[0].key, 90, { transform })).signedUrl;
  const broken = await fetch(signed, { signal: AbortSignal.timeout(20000) });
  assert.ok(!broken.ok);
  await broken.body?.cancel();
  const original = fixture.must(await fixture.bucket("reader").download(samples[0].key));
  assert.equal(digest(Buffer.from(await original.arrayBuffer())), samples[0].hash);
  compose(project, environment, "up", "-d", "--wait", "--no-deps", "--force-recreate", "imgproxy");
  assert.notEqual(container("imgproxy"), proxy);
  await readImage(api, fixture.bucket("reader"), samples[0]);
  console.log("PASS restart/recreate de Storage, queda/recreate de imgproxy, retomada e original no fallback.");

  phase = "npm run dev sem acesso ao Docker";
  dev(project, environment, "vite-env", "--output", frontend);
  const viteEnv = Object.fromEntries(readFileSync(frontend, "utf8").trim().split("\n").map(line => line.split("=")));
  assert.equal(viteEnv.VITE_AUDIT_EVIDENCE_STORAGE_TRANSFORMS, "true");
  const runningContainers = () => docker("inspect", "--format", "{{.Id}} {{.State.StartedAt}}",
    ...compose(project, environment, "ps", "-q").split("\n"));
  const beforeVite = runningContainers();
  for (const mode of ["backend ativo", "backend indisponível"]) {
    const backend = mode === "backend ativo" ? viteEnv.VITE_SUPABASE_URL : "http://127.0.0.1:1";
    server = spawn("npm", ["run", "dev", "--", "--port", String(vitePort)], {
      env: { ...process.env, ...viteEnv, VITE_SUPABASE_URL: backend, DOCKER_HOST: "unix:/gg-inexistente.sock" },
      detached: true, stdio: "ignore",
    });
    const closed = new Promise(resolve => server.once("close", resolve));
    try {
      await waitHttp("http://127.0.0.1:" + vitePort);
    } finally {
      if (server.exitCode === null) process.kill(-server.pid, "SIGTERM");
      await closed;
      server = undefined;
    }
  }
  assert.equal(runningContainers(), beforeVite);
  console.log("PASS npm run dev inicia e encerra o Vite com socket inacessível e com/sem backend.");

  phase = "backup a frio e restauração";
  const before = await inventory(fixture.db);
  await fixture.db.end();
  dev(project, environment, "backup", backup);
  const copy = readFileSync(environment, "utf8")
    .replace(/^GG_API_PORT=\d+/m, "GG_API_PORT=" + restoreApi)
    .replace(/^GG_DB_PORT=\d+/m, "GG_DB_PORT=" + restoreDb)
    .replace(/^GG_STUDIO_PORT=\d+/m, "GG_STUDIO_PORT=" + restoreStudio);
  writeFileSync(restoredEnvironment, copy, { mode: 0o600, flag: "wx" });
  dev(restored, restoredEnvironment, "restore", backup);
  const restoredApi = "http://127.0.0.1:" + restoreApi;
  const restoredClient = createClient(restoredApi, fixture.config.ANON_KEY, options);
  fixture.must(await restoredClient.auth.signInWithPassword({ email: fixture.users.readerEmail, password: fixture.password }));
  const restoredDb = new pg.Client({
    connectionString: fixture.config.DB_URL.replace(":" + dbPort + "/", ":" + restoreDb + "/"),
  });
  await restoredDb.connect();
  try {
    assert.deepEqual(await inventory(restoredDb), before);
    for (const sample of samples) {
      await readImage(restoredApi, restoredClient.storage.from(fixture.BUCKET), sample);
      assert.equal(fixture.must(await restoredClient.schema("audit").from("checklist_evidence")
        .select("id").eq("inspection_id", sample.inspection)).length, 1);
    }
    const anonymous = createClient(restoredApi, fixture.config.ANON_KEY, options);
    fixture.fails(await anonymous.storage.from(fixture.BUCKET).createSignedUrl(samples[0].key, 60, { transform }));
  } finally {
    await restoredDb.end();
  }
  console.log("PASS parada/retomada do Compose, backup coerente e restauração em outro conjunto de volumes.");
  await waitHttp(api + "/storage/v1/status");
  await readImage(api, fixture.bucket("reader"), samples[0]);
  assert.equal(snapshotOriginals(), originalContainers);
  console.log("PASS retorno à origem descartável e containers persistentes com os mesmos IDs, estados e horários de início.");
} catch (error) {
  // Avoid printing response bodies, assertions containing credentials, or connection strings.
  const location = error.stack?.split("\n").find(line => line.includes("rehearse-compose.mjs"))?.match(/:(\d+):\d+\)?$/)?.[1];
  console.error("FAIL ensaio Compose: " + phase + (location ? " (linha " + location + ")" : ""));
  process.exitCode = 1;
} finally {
  if (server?.pid) process.kill(-server.pid, "SIGTERM");
  if (fixture) await fixture.db.end().catch(() => {});
  for (const [name, file] of [[restored, restoredEnvironment], [project, environment]]) {
    try {
      readFileSync(file);
      compose(name, file, "down", "--volumes");
    } catch (error) {
      if (error.code !== "ENOENT") process.exitCode = 1;
    }
  }
  if (snapshotOriginals() !== originalContainers) {
    console.error("FAIL inventário persistente divergiu.");
    process.exitCode = 1;
  }
  rmSync(directory, { recursive: true, force: true });
}
