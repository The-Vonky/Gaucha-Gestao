// AUD-IMG-02: protocolo executável OFFLINE. Não é worker, API nem autorização de Storage.
// O adaptador futuro deve implementar locks/leases, leitura limitada, decoder seguro e RLS reais.
import { createHash } from "node:crypto";

export const DERIVATIVE_ENCODER_VERSION = "img-480-v1";
export const DERIVATIVE_MAX_ORIGINAL_BYTES = 10_485_760;
export const DERIVATIVE_MAX_OUTPUT_BYTES = 1_048_576; // teto de segurança, NÃO meta de qualidade
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[a-f0-9]{64}$/;
const VERSION = /^[a-z0-9][a-z0-9-]{2,63}$/;
const MIME = new Set(["image/jpeg", "image/png"]);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

export function derivativeObjectKey({ evidenceId, version, originalSha256, derivedSha256, mime }) {
  if (!UUID.test(evidenceId) || !VERSION.test(version) || !SHA.test(originalSha256) || !SHA.test(derivedSha256) || !MIME.has(mime))
    throw new Error("Identidade do derivado inválida.");
  const extension = mime === "image/png" ? "png" : "jpg";
  return `${evidenceId}/${version}/${originalSha256}/${derivedSha256}.${extension}`;
}

export function originalIsEligible(evidence) {
  return evidence?.status === "available" && MIME.has(evidence.content_type) &&
    UUID.test(evidence.id ?? "") && UUID.test(evidence.inspection_id ?? "") &&
    evidence.object_key === `${evidence.inspection_id}/${evidence.id}` &&
    Number.isInteger(evidence.size_bytes) && evidence.size_bytes > 0 && evidence.size_bytes <= DERIVATIVE_MAX_ORIGINAL_BYTES;
}

// A escolha da lista é só apresentação. Não autoriza objeto nem cria URL: o backend deve
// assinar a partir de evidence_id e conferir perfil ativo, grant/unidade e estado disponível.
export function listPreviewChoice(evidence, manifest, version = DERIVATIVE_ENCODER_VERSION) {
  const placeholder = { kind: "placeholder", explicitOriginalAction: true };
  if (!originalIsEligible(evidence) || manifest?.state !== "ready" ||
      manifest.evidence_id !== evidence.id || manifest.original_object_key !== evidence.object_key ||
      manifest.encoder_version !== version || !MIME.has(manifest.mime) ||
      !Number.isInteger(manifest.bytes) || manifest.bytes <= 0 || manifest.bytes >= evidence.size_bytes ||
      manifest.bytes > DERIVATIVE_MAX_OUTPUT_BYTES ||
      !Number.isInteger(manifest.width) || !Number.isInteger(manifest.height) ||
      manifest.width <= 0 || manifest.height <= 0 || Math.max(manifest.width, manifest.height) > 480 ||
      !SHA.test(manifest.original_sha256 ?? "") || !SHA.test(manifest.derived_sha256 ?? "")) return placeholder;
  try {
    if (manifest.derived_object_key !== derivativeObjectKey({
      evidenceId: evidence.id, version, originalSha256: manifest.original_sha256,
      derivedSha256: manifest.derived_sha256, mime: manifest.mime,
    })) return placeholder;
  } catch { return placeholder; }
  // Identidade distinta de original; nunca retornar caminho/URL do original como fallback.
  return { kind: "derived", cacheKey: `audit:${evidence.inspection_id}:thumb:${evidence.id}:${version}:${manifest.derived_sha256}`,
    evidenceId: evidence.id, encoderVersion: version };
}

/**
 * Ensaio da sequência de efeitos com adaptadores explícitos; não conecta a ambiente algum.
 * repository.claim é atômico e devolve lease opaca ou null; complete é CAS com lease.
 * storage.readOriginal deve impor teto de bytes DURANTE o streaming; encode é isolado e limitado.
 * Nenhuma implementação de autenticação/decoder/Storage está embutida neste módulo.
 */
export async function runDerivativeAttempt({ evidence, version = DERIVATIVE_ENCODER_VERSION, repository, storage, encoder }) {
  if (!originalIsEligible(evidence) || !VERSION.test(version)) return { state: "ineligible" };
  const lease = await repository.claim({ evidenceId: evidence.id, originalObjectKey: evidence.object_key, version });
  if (!lease) return { state: "skipped" };
  try {
    const original = await storage.readOriginal(evidence.object_key, DERIVATIVE_MAX_ORIGINAL_BYTES);
    if (!Buffer.isBuffer(original) || original.length !== evidence.size_bytes)
      throw new Error("Bytes do original divergentes.");
    const originalSha256 = digest(original);
    const result = await encoder.encode({ bytes: original, contentType: evidence.content_type, maxSide: 480, version });
    if (!Buffer.isBuffer(result?.bytes) || !MIME.has(result.mime) ||
        !Number.isInteger(result.width) || !Number.isInteger(result.height) ||
        result.width <= 0 || result.height <= 0 || Math.max(result.width, result.height) > 480 ||
        result.bytes.length <= 0 || result.bytes.length >= original.length ||
        result.bytes.length > DERIVATIVE_MAX_OUTPUT_BYTES) throw new Error("Derivado inválido.");
    const derivedSha256 = digest(result.bytes);
    const derivedObjectKeyValue = derivativeObjectKey({
      evidenceId: evidence.id, version, originalSha256, derivedSha256, mime: result.mime,
    });
    // Escrita exclusivamente via Storage API, sem upsert; conflito só aceita objeto idêntico.
    await storage.putDerived(derivedObjectKeyValue, result.bytes, result.mime, { upsert: false });
    const stored = await storage.readDerived(derivedObjectKeyValue, DERIVATIVE_MAX_OUTPUT_BYTES);
    if (!Buffer.isBuffer(stored) || digest(stored) !== derivedSha256)
      throw new Error("Objeto derivado inconsistente.");
    const ready = {
      evidence_id: evidence.id, original_object_key: evidence.object_key, encoder_version: version,
      original_sha256: originalSha256, derived_sha256: derivedSha256,
      derived_object_key: derivedObjectKeyValue, mime: result.mime,
      width: result.width, height: result.height, bytes: stored.length,
    };
    // O backend faz CAS checando lease e evidência ainda 'available'; falso deixa órfão reconciliável.
    if (!await repository.complete(lease, ready)) return { state: "orphan", key: derivedObjectKeyValue };
    return { state: "ready", manifest: ready };
  } catch {
    // Não altera evidência original; DB persiste failed, next_attempt_at/backoff e erro sanitizado.
    await repository.fail(lease, "derivative_generation_failed");
    return { state: "failed" };
  }
}
