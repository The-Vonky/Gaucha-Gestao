/** Contrato público GG-10: somente texto; nenhum destino ou código executável. */
export type AnnouncementType = "testing" | "maintenance" | "information" | "critical" | "success" | "general";
export type AnnouncementTone = "danger" | "warning" | "success" | "info" | "neutral";
export const announcementTones: Record<AnnouncementType, readonly AnnouncementTone[]> = {
  critical: ["danger"], maintenance: ["warning"], success: ["success"],
  information: ["info", "neutral"], testing: ["neutral", "info"], general: ["neutral", "info"],
};
export interface Announcement {
  id: string;
  type: AnnouncementType;
  tone?: AnnouncementTone;
  title: string;
  message: string;
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  audience: "authenticated";
  priority: number;
  showIcon: boolean;
  action: { type: "feedback"; label: string; enabled: boolean } | null;
}
export interface AnnouncementConfig {
  version: 1;
  serverNow?: number;
  nextRefreshAt?: number;
  enabled: boolean;
  announcements: Announcement[];
}
const ranks: Record<AnnouncementType, number> = {
  critical: 6, maintenance: 5, information: 4, success: 3, general: 2, testing: 1,
};
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function date(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/.test(value)) return false;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate() && Number.isFinite(Date.parse(value));
}
/** Falha atômica: configuração incorreta não mantém avisos potencialmente obsoletos. */
export function parseAnnouncementConfig(value: unknown): AnnouncementConfig | null {
  if (!record(value) || value.version !== 1 || typeof value.enabled !== "boolean" || !Array.isArray(value.announcements) || value.announcements.length > 20) return null;
  const announcements: Announcement[] = [];
  const ids = new Set<string>();
  for (const item of value.announcements) {
    if (!record(item) ||
      typeof item.id !== "string" ||
      !/^[a-z0-9][a-z0-9-]{0,79}$/.test(item.id) ||
      ids.has(item.id) ||
      typeof item.type !== "string" ||
      !Object.hasOwn(ranks, item.type) ||
      !text(item.title, 120) ||
      !text(item.message, 1600) ||
      typeof item.enabled !== "boolean" ||
      item.audience !== "authenticated" ||
      !Number.isSafeInteger(item.priority) ||
      Math.abs(Number(item.priority)) > 10000 ||
      !date(item.startsAt) ||
      !date(item.endsAt) ||
      (item.startsAt !== null && item.endsAt !== null && Date.parse(item.endsAt) <= Date.parse(item.startsAt)) ||
      (item.showIcon !== undefined && typeof item.showIcon !== "boolean")) return null;
    const category = item.type as AnnouncementType;
    if (item.tone !== undefined && !announcementTones[category].includes(item.tone as AnnouncementTone)) return null;
    let action: Announcement["action"] = null;
    if (item.action !== undefined && item.action !== null) {
      if (!record(item.action) || item.action.type !== "feedback" || !text(item.action.label, 100) || typeof item.action.enabled !== "boolean") return null;
      action = { type: "feedback", label: item.action.label, enabled: item.action.enabled };
    }
    ids.add(item.id);
    announcements.push({
      id: item.id, type: category, ...(item.tone !== undefined ? { tone: item.tone as AnnouncementTone } : {}), title: item.title,
      message: item.message, enabled: item.enabled, startsAt: item.startsAt,
      endsAt: item.endsAt, audience: "authenticated", priority: Number(item.priority),
      showIcon: item.showIcon !== false, action,
    });
  }
  return { version: 1, enabled: value.enabled, announcements };
}
export function selectAnnouncement(config: AnnouncementConfig | null, now: number): Announcement | null {
  if (!config?.enabled) return null;
  return config.announcements.filter(item => item.enabled &&
    (item.startsAt === null || now >= Date.parse(item.startsAt)) &&
    (item.endsAt === null || now < Date.parse(item.endsAt)))
    .sort((a, b) => ranks[b.type] - ranks[a.type] || b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0] ?? null;
}
/** Fonte substituível por um adaptador administrativo futuro, mantendo o contrato. */
export async function loadAnnouncementConfig(signal: AbortSignal): Promise<AnnouncementConfig | null> {
  const response = await fetch(`${import.meta.env.BASE_URL}announcements.json`, {
    signal, cache: "no-store", credentials: "omit", redirect: "error",
  });
  if (!response.ok) return null;
  const body = await response.text();
  if (body.length > 65536) return null;
  return parseAnnouncementConfig(JSON.parse(body));
}
