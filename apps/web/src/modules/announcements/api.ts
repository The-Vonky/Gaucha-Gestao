import type { SupabaseClient } from "@supabase/supabase-js";
import { client } from "../../core/client";
import { parseAnnouncementConfig, type Announcement, type AnnouncementType, type AnnouncementTone, type AnnouncementConfig } from "../../shared/announcements/config";
export type NoticeState = "draft" | "published" | "inactive" | "archived";
export type NoticeStatus = NoticeState | "scheduled" | "active" | "expired";
export type NoticeInput = {
  title: string; message: string; category: AnnouncementType; tone: AnnouncementTone;
  starts_at: string | null; ends_at: string | null;
  state: NoticeState; show_feedback: boolean;
};
export type NoticeRecord = NoticeInput & {
  id: string; priority: number; version: number; status: NoticeStatus; created_by: string; updated_by: string;
  created_at: string; updated_at: string;
};
export type NoticePage<T> = { items: T[]; total: number };
export const noticeStatuses: Record<NoticeStatus, string> = {
  draft: "Rascunho", published: "Publicado", scheduled: "Agendado", active: "Ativo", expired: "Expirado", inactive: "Inativo", archived: "Arquivado",
};
export const toneLabels: Record<AnnouncementTone, string> = { danger: "Vermelho", warning: "Âmbar / laranja", success: "Verde", info: "Azul", neutral: "Neutro" };
export function previewAnnouncement(input: NoticeInput): Announcement {
  return { id: "preview", type: input.category, tone: input.tone, title: input.title || "Assunto do comunicado", message: input.message || "Mensagem do comunicado", priority: 0, startsAt: input.starts_at, endsAt: input.ends_at, enabled: true, audience: "authenticated", showIcon: true,
    action: input.show_feedback ? { type: "feedback", label: "Relatar problema ou sugerir melhoria", enabled: false } : null };
}
async function rpc(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  if (!client) throw new Error("Backend de comunicados indisponível.");
  let request = (client as unknown as SupabaseClient).schema("public").rpc(name, args);
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  return data;
}
function record(value: unknown): NoticeRecord {
  const row = value as NoticeRecord | null;
  const config = row && parseAnnouncementConfig({ version: 1, enabled: true, announcements: [{ ...previewAnnouncement(row), id: row.id, title: row.title, message: row.message }] });
  if (!row || !config || !Number.isInteger(row.version) || row.version < 1 || !Object.hasOwn(noticeStatuses, row.status)
    || !["draft", "published", "inactive", "archived"].includes(row.state)
    || typeof row.show_feedback !== "boolean"
    || typeof row.created_by !== "string" || typeof row.updated_by !== "string"
    || !Number.isFinite(Date.parse(row.updated_at)) || !Number.isFinite(Date.parse(row.created_at)))
    throw new Error("Resposta de comunicado incompatível.");
  return row;
}
function page(value: unknown): NoticePage<unknown> {
  const result = value as NoticePage<unknown> | null;
  if (!result || !Array.isArray(result.items) || !Number.isSafeInteger(result.total) || result.total < 0) throw new Error("Listagem de comunicados incompatível.");
  return result;
}
export async function listNotices(offset = 0, signal?: AbortSignal): Promise<NoticePage<NoticeRecord>> {
  const result = page(await rpc("announcements_manage_list", { p_limit: 20, p_offset: offset }, signal));
  return { ...result, items: result.items.map(record) };
}
export async function saveNotice(input: NoticeInput, previous: NoticeRecord | null, signal?: AbortSignal): Promise<NoticeRecord> {
  return record(await rpc("announcements_notice_save", {
    p_id: previous?.id ?? null, p_expected_version: previous?.version ?? null,
    p_title: input.title, p_message: input.message, p_category: input.category, p_tone: input.tone,
    p_priority: 0, p_starts_at: input.starts_at, p_ends_at: input.ends_at,
    p_state: input.state, p_show_feedback: input.show_feedback,
  }, signal));
}
/** Única fonte na composição autenticada; sem fallback para o JSON público. */
export async function loadPublishedNotices(signal: AbortSignal): Promise<AnnouncementConfig | null> {
  const value = await rpc("announcements_published", {}, signal) as Record<string, unknown>;
  const config = parseAnnouncementConfig(value);
  const serverNow = Date.parse(String(value?.serverNow));
  const nextRefreshAt = value?.nextRefreshAt === null ? undefined : Date.parse(String(value?.nextRefreshAt));
  if (!config || !Number.isFinite(serverNow) || (nextRefreshAt !== undefined && !Number.isFinite(nextRefreshAt))) throw new Error("Resposta pública de comunicados incompatível.");
  return { ...config, serverNow, nextRefreshAt };
}
export const noPublishedNotices = async () => null;
export function noticeError(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "40001") return "Este comunicado mudou. Seu texto foi preservado; recarregue a versão atual antes de salvar novamente.";
  if (code === "23P01") return "Já existe um comunicado programado para esse período. Desative ou ajuste o período do outro comunicado antes de publicar.";
  if (code === "42501") return "Acesso negado. Atualize seu acesso e confira a atribuição global para comunicados.";
  if (["23514", "23502", "22007", "22008", "22P02"].includes(code)) return "Confira título, mensagem, categoria, cor e período. HTML não é permitido.";
  if (code === "55000") return "O comunicado arquivado é imutável. Crie um novo comunicado.";
  return "Não foi possível acessar o backend de comunicados. Nenhum salvamento foi confirmado; tente atualizar a consulta.";
}
