import { createHash } from 'node:crypto';
import { originalIsEligible, derivativeObjectKey, DERIVATIVE_ENCODER_VERSION,
  DERIVATIVE_MAX_ORIGINAL_BYTES, DERIVATIVE_MAX_OUTPUT_BYTES } from './audit-derivative-protocol.mjs';
import { isolatedEncoder } from './audit-derivative-encoder.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// One-shot: uma única claim, sem daemon, sem identidade implícita ou credenciais criadas.
export async function runOneShot({ repository, storage, encoder = isolatedEncoder }) {
  const job = await repository.claim();
  if (!job) return { state: 'idle' };
  try {
    const e = job.evidence;
    if (!originalIsEligible(e) || job.version !== DERIVATIVE_ENCODER_VERSION) throw new Error('ineligible');
    const original = await storage.readOriginal(e.object_key, DERIVATIVE_MAX_ORIGINAL_BYTES, e.content_type);
    if (!Buffer.isBuffer(original) || original.length !== e.size_bytes) throw new Error('size');
    const result = await encoder.encode({ bytes: original, contentType: e.content_type, version: job.version });
    if (!Buffer.isBuffer(result.bytes) || result.bytes.length <= 0 || result.bytes.length >= original.length ||
        result.bytes.length > DERIVATIVE_MAX_OUTPUT_BYTES || !['image/jpeg','image/png'].includes(result.mime) ||
        !Number.isInteger(result.width) || !Number.isInteger(result.height) || result.width < 1 || result.height < 1 ||
        Math.max(result.width, result.height) > 480) throw new Error('output');
    const manifest = { evidence_id: e.id, encoder_version: job.version, original_object_key: e.object_key,
      original_sha256: hash(original), derived_sha256: hash(result.bytes), mime: result.mime,
      bytes: result.bytes.length, width: result.width, height: result.height };
    manifest.derived_object_key = derivativeObjectKey({ evidenceId: e.id, version: job.version,
      originalSha256: manifest.original_sha256, derivedSha256: manifest.derived_sha256, mime: result.mime });
    if (!await repository.prepare(job.lease, manifest)) return { state: 'stale' };
    // O adaptador aceita 409; read-back abaixo decide se os bytes são realmente idênticos.
    await storage.putDerived(manifest.derived_object_key, result.bytes, result.mime);
    const stored = await storage.readDerived(manifest.derived_object_key, DERIVATIVE_MAX_OUTPUT_BYTES, result.mime);
    if (!Buffer.isBuffer(stored) || stored.length !== result.bytes.length || hash(stored) !== manifest.derived_sha256)
      throw new Error('verify');
    if (!await repository.complete(job.lease)) return { state: 'orphan' };
    return { state: 'ready' };
  } catch {
    // Se o banco falhar, a lease expira; nunca logar exceções privadas nem alterar o original.
    try { await repository.fail(job.lease); } catch { /* recuperação por lease */ }
    return { state: 'failed' };
  }
}

// Conexão SQL já autenticada de menor privilégio; não aceita URL nem provisiona grants.
export function postgresRepository(connection) {
  const call = async (name, params = []) => (await connection.query(
    `select audit_private.${name}(${params.map((_, n) => '$' + (n + 1)).join(',')}) as result`, params)).rows[0].result;
  return { claim: () => call('claim_evidence_derivative'),
    prepare: (lease, manifest) => call('prepare_evidence_derivative', [lease, JSON.stringify(manifest)]),
    complete: lease => call('complete_evidence_derivative', [lease]), fail: lease => call('fail_evidence_derivative', [lease]) };
}

// Transporte fornecido pelo runtime; RLS/claims são validados pelo Storage instalado.
export function storageApiAdapter({ request }) {
  async function read(bucket, key, maxBytes, mime) {
    const response = await request({ method: 'GET', bucket, key, timeoutMs: 15_000 });
    try {
      if (!response.ok || response.headers.get('content-type')?.split(';')[0].trim() !== mime) throw new Error('read');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('body');
      const chunks = []; let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > maxBytes) throw new Error('limit');
          chunks.push(Buffer.from(value));
        }
      } finally { try { await reader.cancel(); } finally { reader.releaseLock(); } }
      return Buffer.concat(chunks);
    } finally { try { if (response.body && !response.body.locked) await response.body.cancel(); } finally { response.release?.(); } }
  }
  return {
    readOriginal: (key, maxBytes, mime) => read('audit-checklist-evidence', key, maxBytes, mime),
    readDerived: (key, maxBytes, mime) => read('audit-evidence-thumbnails', key, maxBytes, mime),
    putDerived: async (key, bytes, mime) => {
      const response = await request({ method: 'POST', bucket: 'audit-evidence-thumbnails', key,
        body: bytes, mime, upsert: false, timeoutMs: 15_000 });
      try { if (!response.ok && response.status !== 409) throw new Error('upload'); }
      finally { try { await response.body?.cancel(); } finally { response.release?.(); } }
    },
  };
}

// Transporte HTTP utilizável após comprovação da identidade; nenhuma credencial padrão.
export function authorizedStorageTransport({ origin, apiKey, accessToken, fetchImpl = fetch, signal }) {
  const base = new URL(origin);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname);
  if ((base.protocol !== 'https:' && !(local && base.protocol === 'http:')) || base.username || base.password ||
      base.pathname !== '/' || base.search || base.hash || !apiKey || typeof accessToken !== 'function') throw new Error('Invalid transport');
  return async ({ method, bucket, key, body, mime, upsert, timeoutMs }) => {
    if (!['audit-checklist-evidence','audit-evidence-thumbnails'].includes(bucket) ||
        !['GET','POST'].includes(method) || (method === 'POST' && (bucket !== 'audit-evidence-thumbnails' || upsert !== false)) ||
        key.split('/').some(segment => !segment || segment === '.' || segment === '..')) throw new Error('Invalid operation');
    const controller = new AbortController();
    const cancel=()=>controller.abort();
    signal?.addEventListener('abort',cancel,{once:true});
    if(signal?.aborted)cancel();
    const release=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);};
    const timer = setTimeout(cancel, timeoutMs);
    try {
      if(controller.signal.aborted)throw new Error('Cancelled');
      const token = await new Promise((resolve, reject) => {
        const abort = () => reject(new Error('Token timeout'));
        controller.signal.addEventListener('abort', abort, { once: true });
        Promise.resolve().then(() => accessToken(controller.signal, { bucket, key, method })).then(resolve, reject)
          .finally(() => controller.signal.removeEventListener('abort', abort));
      });
      // Rejeição defensiva, não validação criptográfica; o Storage é autoridade do token.
      const role = value => { try { return JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString()).role; } catch { return ''; } };
      if (!token || [token, apiKey].some(value => role(value) === 'service_role' || value.startsWith('sb_secret_'))) throw new Error('Privileged credential blocked');
      if (controller.signal.aborted) throw new Error('timeout');
      const response = await fetchImpl(new URL(`/storage/v1/object/${method === 'GET' ? 'authenticated/' : ''}${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`, base),
        { method, body, headers: { apikey: apiKey, authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'content-type': mime, 'x-upsert': 'false', 'cache-control': 'no-store' } : {}) },
          signal: controller.signal, redirect: 'error', cache: 'no-store' });
      return { ok: response.ok, status: response.status, headers: response.headers, body: response.body,
        release };
    } catch { release(); throw new Error('Storage request failed'); }
  };
}
