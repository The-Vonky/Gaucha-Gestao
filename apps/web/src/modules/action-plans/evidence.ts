import { client } from "../../core/client";
import { message } from "../../shared/errors";
import { db } from "./api";
import type { Evidence, EvidenceKind } from "./types";
// Evidence / Storage v1 contract (docs/briefs/EVIDENCE_STORAGE_V1.md). The database and the
// bucket enforce every rule; these checks only give early, specific feedback.
export const BUCKET = "action-plan-evidence";
export const MAX_BYTES = 10 * 1024 * 1024;
const JPEG = {
  mime: "image/jpeg",
  label: "Imagem",
  magic: [[0xff, 0xd8, 0xff]],
};
const PNG = {
  mime: "image/png",
  label: "Imagem",
  magic: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
};
const ZIP = [[0x50, 0x4b, 0x03, 0x04]];
const TYPES: Record<
  string,
  { mime: string; label: string; magic: number[][] }
> = {
  jpg: JPEG,
  jpeg: JPEG,
  png: PNG,
  pdf: { mime: "application/pdf", label: "PDF", magic: [] },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    label: "Planilha",
    magic: ZIP,
  },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "Documento",
    magic: ZIP,
  },
};
export const ACCEPT = [
  ...Object.keys(TYPES).map((e) => `.${e}`),
  ...new Set(Object.values(TYPES).map((t) => t.mime)),
].join(",");
export const FORMATS_HINT = "JPG, PNG, PDF, XLSX ou DOCX, até 10 MB.";
export function typeLabel(mime: string) {
  return Object.values(TYPES).find((t) => t.mime === mime)?.label ?? "Arquivo";
}
export function formatSize(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1
    ? `${mb.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
// Control and bidi/format characters the server rejects (evidence_file_error).
const HIDDEN = [
  [0x00, 0x1f],
  [0x7f, 0x9f],
  [0x200e, 0x200f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
];
const hidden = (c: string) => {
  const n = c.codePointAt(0) ?? 0;
  return HIDDEN.some(([from, to]) => n >= from && n <= to);
};
const extension = (name: string) =>
  /\.([^.]+)$/.exec(name)?.[1].toLowerCase() ?? "";
/** Proposes a valid display/download name; never used in the storage path. */
export function normalizeName(raw: string) {
  let name = raw.normalize("NFC");
  name = name.slice(
    Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\")) + 1,
  );
  name = Array.from(name)
    .filter((c) => !hidden(c))
    .join("")
    .replace(/[:*?"<>|]/g, "_")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[ .]+$/, "");
  const chars = Array.from(name);
  if (chars.length > 180) {
    const ext = `.${extension(name)}`;
    name =
      chars
        .slice(0, 180 - ext.length)
        .join("")
        .replace(/[ .]+$/, "") + ext;
  }
  return name;
}
/** Mirrors action_plans_private.evidence_file_error for names. */
function validName(name: string) {
  const length = Array.from(name).length;
  return (
    length >= 1 &&
    length <= 180 &&
    name === name.normalize("NFC") &&
    !Array.from(name).some(hidden) &&
    !/[/\\:*?"<>|]/.test(name) &&
    !name.startsWith(".") &&
    !/[ .]$/.test(name)
  );
}
function readHead(file: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file.slice(0, 1024));
  });
}
function matches(head: Uint8Array, ext: string) {
  if (ext === "pdf")
    // %PDF- may appear anywhere in the first 1024 bytes.
    return new TextDecoder("latin1").decode(head).includes("%PDF-");
  return TYPES[ext].magic.some((sig) => sig.every((b, i) => head[i] === b));
}
export class EvidenceFileError extends Error {}
/** Validates type (extension + magic bytes), size and name before anything is sent. */
export async function checkFile(file: File) {
  if (file.size === 0) throw new EvidenceFileError("O arquivo está vazio.");
  if (file.size > MAX_BYTES)
    throw new EvidenceFileError("O arquivo excede o limite de 10 MB.");
  const name = normalizeName(file.name);
  const ext = extension(name);
  if (!TYPES[ext])
    throw new EvidenceFileError(
      `Formato não permitido. Use ${FORMATS_HINT.replace(", até 10 MB.", ".")}`,
    );
  if (!validName(name))
    throw new EvidenceFileError(
      "Nome de arquivo inválido. Renomeie o arquivo e tente novamente.",
    );
  if (!matches(await readHead(file), ext))
    throw new EvidenceFileError(
      `O conteúdo do arquivo não corresponde ao formato .${ext}.`,
    );
  return { name, type: TYPES[ext].mime };
}
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
/** Uploads (write-once; an existing object from a lost response is accepted) then confirms. */
export async function finishUpload(a: Attempt) {
  if (!client) throw new Error("Configuração de desenvolvimento indisponível.");
  if (!a.uploaded) {
    const { error } = await client.storage
      .from(BUCKET)
      .upload(a.key, a.body, { upsert: false, cacheControl: "0" });
    if (error && !alreadyStored(error)) throw error;
    // A confirm that committed before its response was lost makes the key uninsertable.
    a.uploaded = true;
  }
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
