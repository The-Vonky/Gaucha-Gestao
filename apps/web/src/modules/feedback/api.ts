import type { SupabaseClient } from "@supabase/supabase-js";
import { client } from "../../core/client";

export const feedbackLabel = "Relatar problema ou sugerir melhoria";
export const kinds = { problem: "Problema", suggestion: "Sugestão" } as const;
export const modules = {
  home: "Página inicial", audit: "Auditorias", "action-plans": "Planos de Ação",
  abc: "Curva ABC", sales: "Vendas / Maquininhas", rooms: "Agendamento de Salas",
  admin: "Administração", other: "Outro",
} as const;
export type Kind = keyof typeof kinds;
export type Module = keyof typeof modules;
export type Filters = { kind: Kind | ""; module: Module | ""; from: string; until: string };
type Report = { id: string; kind: Kind; module: Module; received_at: string; display_name: string };
export type ReportSummary = Report & { summary: string };
export type ReportDetail = Report & {
  description: string; origin: Module; app_version: string | null; attachment_key: string | null;
};
type Receipt = { id: string; receivedAt: string | null };
type Attachment = { file: File; extension: "png" | "jpg"; mime: string };
export type Submission = { id: string; kind: Kind; module: Module; description: string; origin: Module; attachment: Attachment | null };

export function originModule(path: string): Module {
  const segment = path.split("/")[1];
  if (!segment) return "home";
  return Object.hasOwn(modules, segment) ? segment as Module : "other";
}

const storageBucket = "feedback-attachments";
const maxBytes = 5 * 1024 * 1024;
export async function validateAttachment(file: File): Promise<Attachment> {
  if (file.size === 0 || file.size > maxBytes) throw new Error("Escolha uma imagem de até 5 MiB.");
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const matches = (signature: number[]) => signature.every((value, i) => head[i] === value);
  if (/\.png$/i.test(file.name) && file.type === "image/png" && matches([137,80,78,71,13,10,26,10])) {
    return { file, extension: "png", mime: "image/png" };
  }
  if (/\.jpe?g$/i.test(file.name) && file.type === "image/jpeg" && matches([255,216,255])) {
    return { file, extension: "jpg", mime: "image/jpeg" };
  }
  throw new Error("Escolha uma imagem PNG ou JPEG válida.");
}

async function rpc<T>(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  if (!client) throw new Error("Canal interno indisponível.");
  const request = (client as unknown as SupabaseClient).schema("public").rpc(name, args);
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error) throw error;
  return data as T;
}

export async function submitFeedback(input: Submission, signal: AbortSignal): Promise<string> {
  const appVersion: unknown = import.meta.env.VITE_APP_VERSION;
  const version = typeof appVersion === "string" && /^[a-zA-Z0-9._+-]{1,64}$/.test(appVersion) ? appVersion : null;
  const prepared = await rpc<Receipt & { attachmentKey: string | null }>("feedback_prepare", {
    p_id: input.id, p_kind: input.kind, p_module: input.module, p_description: input.description,
    p_origin: input.origin, p_app_version: version, p_extension: input.attachment?.extension ?? null,
  }, signal);
  signal.throwIfAborted();
  if (prepared?.id !== input.id) throw new Error("Resposta de envio incompatível.");
  if (prepared.receivedAt) return prepared.id;
  if (input.attachment) {
    if (!client || prepared.attachmentKey !== `${input.id}.${input.attachment.extension}`) throw new Error("Reserva de anexo incompatível.");
    // Se a resposta do upload se perdeu ou houve repetição, somente o banco confirma o objeto.
    const body = input.attachment.file.slice(0, input.attachment.file.size, input.attachment.mime);
    await client.storage.from(storageBucket).upload(prepared.attachmentKey, body, {
      upsert: false, contentType: input.attachment.mime, cacheControl: "0",
    }).catch(() => undefined);
  }
  signal.throwIfAborted();
  const receipt = await rpc<Receipt>("feedback_receive", { p_id: input.id }, signal);
  if (receipt?.id !== input.id || !receipt.receivedAt) throw new Error("Confirmação de recebimento indisponível.");
  return receipt.id;
}

function period(value: string, followingDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (followingDay) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

export function listFeedback(filters: Filters, before?: ReportSummary) {
  return rpc<ReportSummary[]>("feedback_list", {
    p_kind: filters.kind || null, p_module: filters.module || null,
    p_from: period(filters.from), p_until: period(filters.until, true),
    p_before: before?.received_at ?? null, p_before_id: before?.id ?? null,
  });
}

export function getFeedback(id: string) {
  return rpc<ReportDetail>("feedback_detail", { p_id: id });
}

export async function downloadAttachment(key: string, signal: AbortSignal) {
  if (!client || !/^[0-9a-f-]{36}\.(png|jpg)$/.test(key)) throw new Error("Anexo indisponível.");
  const { data, error } = await client.storage.from(storageBucket).download(key, {}, { cache: "no-store", signal });
  if (signal.aborted) return;
  if (error || !data) throw new Error("Anexo indisponível.");
  // Entrega pontual como download, sem renderizar bytes não confiáveis na aplicação.
  const href = URL.createObjectURL(new Blob([data], { type: "application/octet-stream" }));
  const link = document.createElement("a");
  link.href = href;
  link.download = `anexo-relato.${key.endsWith(".png") ? "png" : "jpg"}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
