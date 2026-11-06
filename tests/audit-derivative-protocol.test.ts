import { describe, expect, it } from "vitest";
import { derivativeObjectKey, listPreviewChoice, originalIsEligible } from "../scripts/audit-derivative-protocol.mjs";

const inspection = "11111111-1111-4111-8111-111111111111";
const evidenceId = "22222222-2222-4222-8222-222222222222";
const original = { id: evidenceId, inspection_id: inspection, object_key: `${inspection}/${evidenceId}`,
  status: "available", content_type: "image/png", size_bytes: 800 };
const hash = "a".repeat(64);
const key = derivativeObjectKey({ evidenceId, version: "img-480-v1", originalSha256: hash,
  derivedSha256: hash, mime: "image/png" });
const ready = { state: "ready", evidence_id: evidenceId, original_object_key: original.object_key,
  encoder_version: "img-480-v1", original_sha256: hash, derived_sha256: hash,
  derived_object_key: key, mime: "image/png", width: 480, height: 320, bytes: 120 };

describe("protocolo offline AUD-IMG-02 (sem backend)", () => {
  it("somente status e identidade completos permitem seleção de miniatura separada", () => {
    expect(originalIsEligible(original)).toBe(true);
    expect(listPreviewChoice(original, ready)).toMatchObject({ kind: "derived",
      cacheKey: expect.stringContaining(":thumb:") });
  });
  it.each([null, { ...ready, state: "pending" }, { ...ready, derived_object_key: original.object_key },
    { ...ready, encoder_version: "img-320-v1" }, { ...ready, bytes: 800 }])(
    "nunca faz fallback implícito para original em estado incoerente", manifest => {
      expect(listPreviewChoice(original, manifest)).toEqual({ kind: "placeholder", explicitOriginalAction: true });
    });
  it("recusa evidência não disponível e chave original adulterada", () => {
    expect(listPreviewChoice({ ...original, status: "removed" }, ready).kind).toBe("placeholder");
    expect(originalIsEligible({ ...original, object_key: "alterada" })).toBe(false);
  });
});
