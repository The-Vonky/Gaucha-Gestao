import type { SupabaseClient } from "@supabase/supabase-js";
import { client } from "../../core/client";
import { message } from "../../shared/errors";
import type { ReportPayload, RevisionDetail, SeriesSummary, UnitSummary } from "./types";

export const BUCKET = "abc-source-files";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function storage() {
  if (!client) throw new Error("Configuração de desenvolvimento indisponível.");
  return client.storage.from(BUCKET);
}
export function db() {
  if (!client) throw new Error("Configuração de desenvolvimento indisponível.");
  return (client as unknown as SupabaseClient).schema("abc");
}

export async function units(): Promise<UnitSummary[]> {
  const { data, error } = await db().rpc("units");
  if (error) throw error;
  return (data ?? []) as UnitSummary[];
}

export async function unitSeries(unitId: string): Promise<SeriesSummary[]> {
  const { data, error } = await db().rpc("unit_series", { p_unit: unitId });
  if (error) throw error;
  return (data ?? []) as SeriesSummary[];
}

export async function revisionDetail(revisionId: string): Promise<RevisionDetail> {
  const { data, error } = await db().rpc("revision_detail", { p_revision: revisionId });
  if (error) throw error;
  return data as RevisionDetail;
}

const alreadyStored = (e: unknown) => (e as { statusCode?: string } | null)?.statusCode === "409";

/** Stores the original (write-once), confirms it and publishes the parsed report. */
export async function publish(args: {
  unitId: string;
  file: File;
  payload: ReportPayload;
  expectedVersion: number;
  reason: string | null;
  acceptWarnings: boolean;
}): Promise<string> {
  const begin = await db().rpc("begin_source_upload", {
    p_unit: args.unitId,
    p_name: args.file.name,
    p_sha256: args.payload.file_sha256,
    p_size: args.file.size,
  });
  if (begin.error) throw begin.error;
  const [row] = begin.data as { file_id: string; object_key: string }[];
  // storage-js sends the Blob's own type: re-type it with the only accepted MIME.
  const upload = await storage().upload(row.object_key, args.file.slice(0, args.file.size, XLSX), {
    upsert: false,
    cacheControl: "0",
  });
  if (upload.error && !alreadyStored(upload.error)) throw upload.error;
  const confirm = await db().rpc("confirm_source_upload", { p_file: row.file_id });
  if (confirm.error) throw confirm.error;
  const result = await db().rpc("publish_revision", {
    p_file: row.file_id,
    p_payload: args.payload,
    p_expected_version: args.expectedVersion,
    p_reason: args.reason,
    p_accept_warnings: args.acceptWarnings,
  });
  if (result.error) throw result.error;
  return result.data as string;
}

export async function downloadOriginal(objectKey: string): Promise<Uint8Array> {
  const { data, error } = await storage().download(objectKey);
  if (error) throw error;
  return new Uint8Array(await data.arrayBuffer());
}

export async function downloadUrl(objectKey: string, name: string) {
  const { data, error } = await storage().createSignedUrl(objectKey, 60);
  if (error) throw error;
  // Set here: storage-js double-encodes its own `download` option, breaking accented names.
  const url = new URL(data.signedUrl);
  url.searchParams.set("download", name);
  return url.href;
}

export async function recordFileCheck(revisionId: string, contentHash: string): Promise<boolean> {
  const { data, error } = await db().rpc("record_file_check", { p_revision: revisionId, p_content_hash: contentHash });
  if (error) throw error;
  return data as boolean;
}

/** Business-rule rejections from abc_private.fail are already in Portuguese; map the rest. */
export function abcMessage(e: unknown): string {
  const text = String((e as { message?: unknown } | null)?.message ?? "");
  const code = String((e as { code?: unknown } | null)?.code ?? "");
  if (/Warnings must be accepted/.test(text)) return "Confirme a leitura dos avisos antes de publicar.";
  if (/Upload expired/.test(text)) return "O envio expirou. Selecione o arquivo novamente.";
  if (/object does not match/.test(text)) return "O arquivo enviado não confere com o registro. Selecione o arquivo novamente.";
  if (code === "23514" && text && !/violates|new row/.test(text)) return text;
  return message(e);
}
