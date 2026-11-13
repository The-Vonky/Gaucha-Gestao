import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Contract check: two built-in config images, persistent volumes, native restarts.
const env = { ...process.env,
  POSTGRES_PASSWORD: "ci-local", JWT_SECRET: "ci-local",
  ANON_KEY: "ci-local", SERVICE_ROLE_KEY: "ci-local",
  S3_ACCESS_KEY_ID: "ci-local", S3_ACCESS_KEY_SECRET: "ci-local" };
const { services } = JSON.parse(execFileSync("docker",
  ["compose", "-f", "infra/local/compose.yaml", "config", "--format", "json"],
  { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }));
assert.deepEqual(Object.keys(services).sort(),
  ["auth","db","imgproxy","kong","pg-meta","rest","storage","studio"]);
for (const spec of Object.values(services)) assert.equal(spec.restart, "unless-stopped");
for (const [name, dockerfile, sources] of [
  ["db", "docker/postgres.Dockerfile", ["config/roles.sql"]],
  ["kong", "docker/kong.Dockerfile", ["config/kong.yml","config/kong-entrypoint.sh"]],
]) {
  assert.equal(services[name].build.dockerfile, dockerfile);
  assert.equal((services[name].volumes ?? []).filter(v => v.type === "bind").length, 0);
  const dockerfileText = readFileSync("infra/local/" + dockerfile, "utf8");
  assert.match(dockerfileText, /^FROM public\.ecr\.aws\/supabase\/[^\n]+@sha256:[a-f0-9]{64}$/m);
  for (const source of sources) assert.ok(dockerfileText.includes(source));
}
assert.deepEqual((services.db.volumes ?? []).map(v => v.type), ["volume"]);
assert.ok((services.storage.volumes ?? []).some(v => v.type === "volume"));
assert.ok((services.imgproxy.volumes ?? []).some(v => v.type === "volume"));
console.log("PASS: DEV Compose usa restart nativo sem bind mounts do WSL no db/kong.");
