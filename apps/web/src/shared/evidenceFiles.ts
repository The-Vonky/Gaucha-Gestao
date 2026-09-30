// Neutral file rules shared by Audit and Action Plans. Client checks are bypassable (E3).
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
/** Mirrors the server filename contract for names. */
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
export class FileValidationError extends Error {}
/** Validates type (extension + magic bytes), size and name before anything is sent. */
export async function checkFile(file: File) {
  if (file.size === 0) throw new FileValidationError("O arquivo está vazio.");
  if (file.size > MAX_BYTES)
    throw new FileValidationError("O arquivo excede o limite de 10 MB.");
  const name = normalizeName(file.name);
  const ext = extension(name);
  if (!TYPES[ext])
    throw new FileValidationError(
      `Formato não permitido. Use ${FORMATS_HINT.replace(", até 10 MB.", ".")}`,
    );
  if (!validName(name))
    throw new FileValidationError(
      "Nome de arquivo inválido. Renomeie o arquivo e tente novamente.",
    );
  if (!matches(await readHead(file), ext))
    throw new FileValidationError(
      `O conteúdo do arquivo não corresponde ao formato .${ext}.`,
    );
  return { name, type: TYPES[ext].mime };
}
