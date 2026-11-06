import test from "node:test";
import assert from "node:assert/strict";
import { derivativeObjectKey, listPreviewChoice, runDerivativeAttempt } from "../scripts/audit-derivative-protocol.mjs";

const i = "11111111-1111-4111-8111-111111111111";
const e = "22222222-2222-4222-8222-222222222222";
const evidence = { id: e, inspection_id: i, object_key: `${i}/${e}`, status: "available", content_type: "image/png", size_bytes: 800 };
function fake({ crashAt = "", complete = true } = {}) {
  const originals = new Map([[evidence.object_key, Buffer.alloc(800, 11)]]);
  const derived = new Map(), held = new Set(), ready = new Map(), failed = [];
  const repository = {
    claim: async ({ evidenceId, version }) => {
      const k = `${evidenceId}:${version}`;
      if (ready.has(k) || held.has(k)) return null;
      held.add(k); return k;
    },
    complete: async (lease, manifest) => { held.delete(lease); if (!complete) return false; ready.set(lease, manifest); return true; },
    fail: async (lease, error) => { held.delete(lease); failed.push(error); },
  };
  const storage = {
    readOriginal: async key => { if (crashAt === "read") throw new Error("private credential in error"); return originals.get(key); },
    putDerived: async (key, bytes, mime, options) => {
      assert.equal(options.upsert, false); assert.match(mime, /^image\//);
      if (crashAt === "put") throw new Error("Storage failed");
      const old = derived.get(key);
      if (old && !old.equals(bytes)) throw new Error("conflict");
      derived.set(key, Buffer.from(bytes));
    },
    readDerived: async key => crashAt === "verify" ? Buffer.from("corrupt") : derived.get(key),
  };
  const encoder = { encode: async ({ bytes, maxSide }) => {
    assert.equal(maxSide, 480); assert.equal(bytes.length, 800);
    if (crashAt === "encode") throw new Error("malformed image");
    return { bytes: Buffer.alloc(120, 22), mime: "image/png", width: 480, height: 320 };
  } };
  return { originals, derived, held, ready, failed, repository, storage, encoder };
}
const attempt = (environment, row = evidence) => runDerivativeAttempt({ evidence: row, ...environment });

test("gera um único objeto técnico e preserva original e SHA dos bytes realmente lidos", async () => {
  const f = fake(), before = Buffer.from(f.originals.get(evidence.object_key));
  const first = await attempt(f);
  assert.equal(first.state, "ready");
  assert.deepEqual(f.originals.get(evidence.object_key), before);
  assert.equal(f.derived.size, 1);
  assert.equal(first.manifest.bytes, 120);
  assert.equal(first.manifest.derived_object_key, derivativeObjectKey({
    evidenceId: e, version: "img-480-v1", originalSha256: first.manifest.original_sha256,
    derivedSha256: first.manifest.derived_sha256, mime: "image/png",
  }));
  assert.equal((await attempt(f)).state, "skipped");
});

test("duas tentativas concorrentes não duplicam geração quando claim é atômico", async () => {
  const f = fake();
  const result = await Promise.all([attempt(f), attempt(f)]);
  assert.deepEqual(result.map(r => r.state).sort(), ["ready", "skipped"]);
  assert.equal(f.derived.size, 1);
});

test("falhas antes/depois da escrita não modificam original, publicam ready nem divulgam erro", async () => {
  for (const crashAt of ["read", "encode", "put", "verify"]) {
    const f = fake({ crashAt });
    assert.deepEqual(await attempt(f), { state: "failed" });
    assert.equal(f.originals.get(evidence.object_key).length, 800);
    assert.equal(f.ready.size, 0);
    assert.deepEqual(f.failed, ["derivative_generation_failed"]);
    if (crashAt === "verify") assert.equal(f.derived.size, 1); // órfão reconciliável
  }
});

test("perda da lease após upload produz órfão e nunca ready; o original fica intacto", async () => {
  const f = fake({ complete: false });
  assert.equal((await attempt(f)).state, "orphan");
  assert.equal(f.derived.size, 1);
  assert.equal(f.ready.size, 0);
  assert.equal(f.originals.get(evidence.object_key).length, 800);
});

test("não processa pending/removed, documento, key adulterada nem tamanho fora de contrato", async () => {
  const f = fake();
  for (const change of [{ status: "pending" }, { status: "removed" }, { content_type: "application/pdf" },
    { object_key: "outro" }, { size_bytes: 10_485_761 }]) {
    assert.equal((await attempt(f, { ...evidence, ...change })).state, "ineligible");
  }
  assert.equal(f.derived.size, 0);
});

test("lista nunca escolhe original quando falta derivado ou status/versão/key divergem", async () => {
  const f = fake();
  const r = await attempt(f);
  const ready = { ...r.manifest, state: "ready" };
  assert.match(listPreviewChoice(evidence, ready).cacheKey, /:thumb:/);
  assert.equal(listPreviewChoice(evidence, ready).kind, "derived");
  for (const m of [null, { ...ready, state: "pending" }, { ...ready, state: "failed" },
    { ...ready, encoder_version: "img-320-v1" }, { ...ready, derived_object_key: evidence.object_key },
    { ...ready, bytes: 800 }]) {
    assert.deepEqual(listPreviewChoice(evidence, m), { kind: "placeholder", explicitOriginalAction: true });
  }
  assert.equal(listPreviewChoice({ ...evidence, status: "removed" }, ready).kind, "placeholder");
});
