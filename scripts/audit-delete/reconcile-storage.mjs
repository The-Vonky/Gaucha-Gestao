// Executado por reconcile-local.py dentro da imagem fixada. Não inicia servidor.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const runtime = createRequire("/app/package.json");
const { getConfig } = runtime("./dist/config");
const { SEPARATOR } = runtime("./dist/storage/backend/adapter");
// Carrega o grafo na mesma ordem do processo Storage, sem iniciar listener.
runtime("./dist/app");
const { ObjectAdminDelete } = runtime("./dist/storage/events/objects/object-admin-delete");
const uuid = "[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}";
const uuidKey = new RegExp("^" + uuid + "$");
const thumbnail = /^img-480-v1\/[0-9a-f]{64}\/[0-9a-f]{64}\.(?:jpg|png)$/;

function drained() {
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    if (!fs.existsSync(file)) continue;
    const active = fs.readFileSync(file, "utf8").trim().split("\n").slice(1).some(line => {
      const [, local, , state] = line.trim().split(/\s+/);
      return local.endsWith(":1388") && state === "01";
    });
    assert.ok(!active, "Aguarde a drenagem das conexões no Storage.");
  }
}

async function main() {
  const { scopes, apply } = JSON.parse(fs.readFileSync(0, "utf8"));
  const config = getConfig();
  assert.equal(config.storageBackendType, "file");
  assert.equal(config.tenantId, "stub");
  assert.equal(config.storageS3Bucket, "stub");
  assert.equal(config.storageFilePath, "/mnt");
  assert.equal(SEPARATOR, "/");
  const root = "/mnt/stub/stub";
  async function scan() {
    drained();
    const versions = new Map();
    for (const [bucket, prefix] of scopes) {
      assert.ok(["audit-checklist-evidence", "audit-evidence-thumbnails", "action-plan-evidence"].includes(bucket));
      assert.match(prefix, uuidKey);
      const directory = path.join(root, bucket, prefix);
      // Mesmo diretórios ancestrais precisam estar dentro do volume aprovado.
      for (const parent of [root, path.join(root, bucket), directory]) {
        if (fs.existsSync(parent)) assert.equal(fs.realpathSync(parent), parent);
      }
      if (!fs.existsSync(directory)) continue;
      async function walk(dir, depth) {
        assert.ok(depth <= 5);
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const file = path.join(dir, entry.name);
          if (entry.isDirectory()) { await walk(file, depth + 1); continue; }
          assert.ok(entry.isFile());
          const name = path.relative(path.join(root, bucket), dir).split(path.sep).join("/");
          const suffix = name.slice(prefix.length + 1);
          assert.match(suffix, bucket === "audit-evidence-thumbnails" ? thumbnail : uuidKey);
          const version = entry.name.replace(/\.info$/, "");
          assert.match(version, uuidKey);
          versions.set([bucket, name, version].join("|"), { bucketId: bucket, name, version });
        }
      }
      await walk(directory, 0);
    }
    return [...versions.values()];
  }
  const before = await scan();
  if (apply) {
    for (const object of before) {
      // Mesmo manipulador do Storage API que compensa falhas de completeUpload.
      // Opera sobre uma única versão. Não remove uma pasta nem percorre outro bucket.
      await ObjectAdminDelete.handle({ data: { ...object, tenant: { ref: "stub", host: "localhost" } } });
    }
  }
  const after = await scan();
  process.stdout.write(JSON.stringify({ found: before.length, remaining: after.length }) + "\n");
}
main().then(() => process.exit(0), () => process.exit(1));
