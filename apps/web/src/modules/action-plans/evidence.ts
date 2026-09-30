import { client } from "../../core/client";
import { message } from "../../shared/errors";
import { checkFile, FORMATS_HINT, FileValidationError as EvidenceFileError } from "../../shared/evidenceFiles";
export { ACCEPT, MAX_BYTES, FORMATS_HINT, checkFile, normalizeName, typeLabel, formatSize, FileValidationError as EvidenceFileError } from "../../shared/evidenceFiles";
import { db } from "./api";
import type { Evidence, EvidenceKind } from "./types";
export const BUCKET = "action-plan-evidence";
export async function listEvidence(planId: string): Promise<Evidence[]> {
  const { data, error } = await db().rpc("plan_evidence", { p_plan: planId });
  if (error) throw error;
  return data ?? [];
}
/** An upload in progress; kept so a network failure can be retried with the same id. */
export type Attempt = {
  evidenceId: string;
  key: string;
  body: Blob;
  /** Storage holds the object; a retry only needs the (idempotent) confirm. */
  uploaded?: boolean;
};
export async function beginUpload(
  planId: string,
  kind: EvidenceKind,
  file: File,
): Promise<Attempt> {
  const { name, type } = await checkFile(file);
  const { data, error } = await db().rpc("begin_evidence_upload", {
    p_plan: planId,
    p_kind: kind,
    p_original_name: name,
    p_content_type: type,
    p_size: file.size,
  });
  if (error) throw error;
  const [row] = data;
  // storage-js sends a Blob's own type and ignores `contentType`, so re-type it canonically.
  return {
    evidenceId: row.evidence_id,
    key: row.object_key,
    body: file.slice(0, file.size, type),
  };
}
const alreadyStored = (e: unknown) =>
  (e as { statusCode?: string } | null)?.statusCode === "409";
/**
 * Uploads (write-once; an existing object from a lost response is accepted) then confirms.
 * `onStored` reports the switch to the confirm step, for progress display only.
 */
export async function finishUpload(a: Attempt, onStored?: () => void) {
  if (!client) throw new Error("Configuração de desenvolvimento indisponível.");
  if (!a.uploaded) {
    const { error } = await client.storage
      .from(BUCKET)
      .upload(a.key, a.body, { upsert: false, cacheControl: "0" });
    if (error && !alreadyStored(error)) throw error;
    // A confirm that committed before its response was lost makes the key uninsertable.
    a.uploaded = true;
  }
  onStored?.();
  const confirm = await db().rpc("confirm_evidence_upload", {
    p_evidence: a.evidenceId,
  });
  if (confirm.error) throw confirm.error;
}
export async function removeEvidence(id: string) {
  const { error } = await db().rpc("remove_evidence", { p_evidence: id });
  if (error) throw error;
}
/** 60-second signed URL answered as an attachment with the original name. */
export async function downloadUrl(e: Evidence) {
  if (!client) throw new Error("Configuração de desenvolvimento indisponível.");
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(e.object_key, 60);
  if (error) throw error;
  // Set here: storage-js double-encodes its own `download` option, breaking accented names.
  const url = new URL(data.signedUrl);
  url.searchParams.set("download", e.original_name);
  return url.href;
}
/** Same-tab navigation: no popup after an await, and the attachment keeps the page. */
export function openDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
}
/** Network failures keep the attempt for retry; server/Storage rejections do not. */
export function retryable(e: unknown) {
  if (e instanceof EvidenceFileError) return false;
  // supabase-js reports network failures without a server code/status (PostgREST: code "";
  // Storage: StorageUnknownError with an undefined statusCode).
  const r = (e ?? {}) as { code?: unknown; statusCode?: unknown };
  return !r.code && !r.statusCode;
}
const MESSAGES: [RegExp, string][] = [
  [
    /limit reached/,
    "Limite de 20 evidências ativas neste plano atingido. Remova uma evidência antes de anexar outra.",
  ],
  [
    /type not allowed|does not match type|mime type/,
    `Formato não permitido. Use ${FORMATS_HINT.replace(", até 10 MB.", ".")}`,
  ],
  [
    /size not allowed|maximum allowed size/,
    "O arquivo excede o limite de 10 MB.",
  ],
  [
    /name not allowed/,
    "Nome de arquivo inválido. Renomeie o arquivo e tente novamente.",
  ],
  [/Upload expired/, "O envio expirou. Anexe o arquivo novamente."],
  [
    /object does not match/,
    "O arquivo enviado não confere com o registro. Anexe o arquivo novamente.",
  ],
  [
    /Verified plan is locked/,
    "A eficácia deste plano já foi verificada; as evidências da execução não podem mais ser alteradas.",
  ],
  [
    /round is closed/,
    "Esta verificação já foi registrada; as evidências dela não podem ser alteradas.",
  ],
  [
    /Only completed plans/,
    "Evidências da verificação só podem ser anexadas a planos concluídos.",
  ],
];
export function evidenceMessage(e: unknown) {
  if (e instanceof EvidenceFileError) return e.message;
  const text = String((e as { message?: unknown } | null)?.message ?? "");
  return MESSAGES.find(([re]) => re.test(text))?.[1] ?? message(e);
}
