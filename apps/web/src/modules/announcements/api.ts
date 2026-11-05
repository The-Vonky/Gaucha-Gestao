import type { SupabaseClient } from "@supabase/supabase-js";
import { client } from "../../core/client";
import { parseAnnouncementConfig, announcementTones, type Announcement, type AnnouncementType, type AnnouncementTone, type AnnouncementConfig } from "../../shared/announcements/config";
export type NoticeState = "draft" | "published" | "inactive" | "archived";
export type NoticeStatus = NoticeState | "scheduled" | "active" | "expired";
export type NoticeInput = {
  title: string; message: string; category: AnnouncementType; tone: AnnouncementTone;
  priority: number; starts_at: string | null; ends_at: string | null;
  state: NoticeState; show_feedback: boolean;
};
export type NoticeRecord = NoticeInput & {
  id: string; version: number; status: NoticeStatus; created_by: string; updated_by: string;
  created_at: string; updated_at: string;
};
export type NoticeHistory = { notice_id: string; version: number; actor_user_id: string; occurred_at: string; before_data: Omit<NoticeRecord, "status"> | null; after_data: Omit<NoticeRecord, "status"> };
export type NoticePage<T> = { items: T[]; total: number };
export const noticeStatuses: Record<NoticeStatus, string> = {
  draft: "Rascunho", published: "Publicado", scheduled: "Agendado", active: "Ativo", expired: "Expirado", inactive: "Inativo", archived: "Arquivado",
};
export const toneLabels: Record<AnnouncementTone, string> = { danger: "Vermelho · crítico", warning: "Âmbar · atenção", success: "Verde · positivo", info: "Azul · informação", neutral: "Neutro · geral" };
export function previewAnnouncement(input: NoticeInput): Announcement {
  return { id: "preview", type: input.category, tone: input.tone, title: input.title || "Assunto do comunicado", message: input.message || "Mensagem do comunicado", priority: input.priority, startsAt: input.starts_at, endsAt: input.ends_at, enabled: true, audience: "authenticated", showIcon: true,
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
    || !Object.hasOwn(announcementTones, row.category) || typeof row.show_feedback !== "boolean"
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
export async function noticeHistory(id: string, offset = 0, signal?: AbortSignal): Promise<NoticePage<NoticeHistory>> {
  const result = page(await rpc("announcements_notice_history", { p_id: id, p_limit: 20, p_offset: offset }, signal));
  const items = result.items.map(value => {
    const h = value as NoticeHistory;
    if (!h || h.notice_id !== id || !Number.isSafeInteger(h.version) || h.version < 1 || typeof h.actor_user_id !== "string" || !Number.isFinite(Date.parse(h.occurred_at))) throw new Error("Histórico incompatível.");
    // Snapshots persistidos não contêm status derivado.
    record({ ...h.after_data, status: h.after_data.state });
    if (h.before_data) record({ ...h.before_data, status: h.before_data.state });
    return h;
  });
  return { ...result, items };
}
export async function saveNotice(input: NoticeInput, previous: NoticeRecord | null, signal?: AbortSignal): Promise<NoticeRecord> {
  return record(await rpc("announcements_notice_save", {
    p_id: previous?.id ?? null, p_expected_version: previous?.version ?? null,
    p_title: input.title, p_message: input.message, p_category: input.category, p_tone: input.tone,
    p_priority: input.priority, p_starts_at: input.starts_at, p_ends_at: input.ends_at,
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
  if (code === "42501") return "Acesso negado. Atualize seu acesso e confira a atribuição global para comunicados.";
  if (["23514", "23502", "22007", "22008", "22P02"].includes(code)) return "Confira título, mensagem, categoria, cor, prioridade e período. HTML não é permitido.";
  if (code === "55000") return "O comunicado arquivado é imutável. Crie um novo comunicado.";
  return "Não foi possível acessar o backend de comunicados. Nenhum salvamento foi confirmado; tente atualizar a consulta.";
}
