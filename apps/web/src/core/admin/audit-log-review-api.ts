import { database } from "../client";
import type { Json } from "../types";
// Readable Logs v1 adapter over core.audit_log_page. The RPC runs as the caller (SECURITY
// INVOKER): RLS decides which events, names, units and sectors come back; nothing here widens it.
export const LOG_PAGE_SIZE = 25;
/** Longest filter text the RPC accepts. */
export const FILTER_MAX = 160;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Where a reference label comes from: the current authorized row, or none readable. */
export type LabelSource = "current" | "unavailable";
/** A unit/sector/actor reference as the reader may see it. */
export type LogReference =
  | { kind: "none" }
  | { kind: "unavailable"; id: string }
  | {
      kind: "current";
      id: string;
      name: string;
      code: string | null;
      active: boolean | null;
    };
export type AuditLogReviewEntry = {
  id: string;
  occurredAt: string;
  module: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: LogReference;
  unit: LogReference;
  sector: LogReference;
  before: Json;
  after: Json;
  metadata: Json;
  correlationId: string | null;
};
export type AuditLogReviewPage = {
  rows: AuditLogReviewEntry[];
  count: number;
};
/** Filters as typed in the page. Dates are local calendar days; `to` is the last day included. */
export type AuditLogReviewFilters = {
  from: string;
  to: string;
  /** An actor UUID, or part of a name the reader already sees. */
  actor: string;
  module: string;
  action: string;
  entityType: string;
  entityId: string;
};
export const EMPTY_FILTERS: AuditLogReviewFilters = {
  from: "",
  to: "",
  actor: "",
  module: "",
  action: "",
  entityType: "",
  entityId: "",
};
/** RPC arguments; the interval is half-open [p_from,p_to). */
export type AuditLogPageArgs = {
  p_limit: number;
  p_offset: number;
  p_from: string | null;
  p_to: string | null;
  p_actor: string | null;
  p_actor_search: string | null;
  p_module: string | null;
  p_action: string | null;
  p_entity_type: string | null;
  p_entity_id: string | null;
};
export const isUuid = (value: string) => UUID.test(value.trim());
/** Whether the actor filter searches by visible name rather than by identifier. */
export const searchesByName = (filters: AuditLogReviewFilters) =>
  filters.actor.trim() !== "" && !isUuid(filters.actor);
function localDay(value: string, plusDays = 0): Date | null {
  if (!DAY.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d + plusDays);
  // Rejects rolled-over days such as 2026-02-31.
  if (
    plusDays === 0 &&
    (date.getFullYear() !== y ||
      date.getMonth() !== m - 1 ||
      date.getDate() !== d)
  )
    return null;
  return date;
}
/** Problem with the typed filters in plain Portuguese, or "" when they can be sent. */
export function filterProblem(filters: AuditLogReviewFilters): string {
  if (filters.from && !localDay(filters.from))
    return "Informe uma data inicial válida.";
  if (filters.to && !localDay(filters.to))
    return "Informe uma data final válida.";
  if (filters.from && filters.to && filters.from > filters.to)
    return "A data inicial precisa ser anterior ou igual à data final.";
  const texts = [
    filters.actor,
    filters.module,
    filters.action,
    filters.entityType,
    filters.entityId,
  ];
  if (texts.some((t) => t.trim().length > FILTER_MAX))
    return `Use no máximo ${FILTER_MAX} caracteres em cada filtro.`;
  return "";
}
/** Trims every field; whitespace-only filters count as empty. */
export function normalizeFilters(
  filters: AuditLogReviewFilters,
): AuditLogReviewFilters {
  return Object.fromEntries(
    Object.entries(filters).map(([k, v]) => [k, String(v ?? "").trim()]),
  ) as AuditLogReviewFilters;
}
/**
 * RPC arguments for a page. `from` starts at local midnight; the last day is included by ending at
 * the next local midnight. `asOf` pins the end so later events never shift the pages being read.
 */
export function pageArgs(
  page: number,
  filters: AuditLogReviewFilters,
  asOf: string,
): AuditLogPageArgs {
  const f = normalizeFilters(filters);
  const start = f.from ? localDay(f.from) : null;
  const dayEnd = f.to ? localDay(f.to, 1) : null;
  const pinned = new Date(asOf);
  const end =
    dayEnd && (Number.isNaN(pinned.getTime()) || dayEnd < pinned)
      ? dayEnd
      : Number.isNaN(pinned.getTime())
        ? null
        : pinned;
  const byId = f.actor && isUuid(f.actor);
  return {
    p_limit: LOG_PAGE_SIZE,
    p_offset: Math.max(0, Math.trunc(page)) * LOG_PAGE_SIZE,
    p_from: start ? start.toISOString() : null,
    p_to: end ? end.toISOString() : null,
    p_actor: byId ? f.actor.toLowerCase() : null,
    p_actor_search: f.actor && !byId ? f.actor : null,
    p_module: f.module || null,
    p_action: f.action || null,
    p_entity_type: f.entityType || null,
    p_entity_id: f.entityId || null,
  };
}
type Row = Record<string, unknown>;
const text = (value: unknown) =>
  typeof value === "string" && value !== "" ? value : null;
const flag = (value: unknown) => (typeof value === "boolean" ? value : null);
const json = (value: unknown) => (value === undefined ? null : (value as Json));
/**
 * A reference label. Only an explicit 'current' with a readable name shows a name; anything else
 * with an id is unavailable, never an invented or guessed label.
 */
function reference(
  id: unknown,
  source: unknown,
  name: unknown,
  code: unknown,
  active: unknown,
): LogReference {
  const ref = text(id);
  if (!ref) return { kind: "none" };
  const label = text(name)?.trim();
  if (source !== "current" || !label) return { kind: "unavailable", id: ref };
  return {
    kind: "current",
    id: ref,
    name: label,
    code: text(code),
    active: flag(active),
  };
}
/** Maps one RPC row; rows without an id or a valid time are rejected as malformed. */
export function toEntry(row: Row): AuditLogReviewEntry | null {
  const id = text(row.id);
  const occurredAt = text(row.occurred_at);
  if (!id || !occurredAt || Number.isNaN(new Date(occurredAt).getTime()))
    return null;
  return {
    id,
    occurredAt,
    module: text(row.module) ?? "",
    action: text(row.action) ?? "",
    entityType: text(row.entity_type) ?? "",
    entityId: text(row.entity_id) ?? "",
    actor: reference(
      row.actor_user_id,
      row.actor_label_source,
      row.actor_display_name,
      null,
      row.actor_active,
    ),
    unit: reference(
      row.unit_id,
      row.unit_label_source,
      row.unit_name,
      row.unit_code,
      row.unit_active,
    ),
    sector: reference(
      row.sector_id,
      row.sector_label_source,
      row.sector_name,
      row.sector_code,
      row.sector_active,
    ),
    before: json(row.before_data),
    after: json(row.after_data),
    metadata: json(row.metadata),
    correlationId: text(row.correlation_id),
  };
}
/** Why a page could not be read: denied access, filters the server refused, or anything else. */
export type LogErrorKind = "denied" | "invalid" | "failed";
export class AuditLogReviewError extends Error {
  constructor(
    readonly kind: LogErrorKind,
    readonly code: string,
  ) {
    super(
      kind === "denied"
        ? "Você não tem acesso aos logs do sistema. Se isso mudou recentemente, atualize seu acesso."
        : kind === "invalid"
          ? "Os filtros não puderam ser aplicados. Confira as datas e os textos informados."
          : "Não foi possível carregar os eventos. Verifique sua conexão e tente novamente.",
    );
    this.name = "AuditLogReviewError";
  }
}
function classify(error: unknown): AuditLogReviewError {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  return new AuditLogReviewError(
    code === "42501" ? "denied" : code === "22023" ? "invalid" : "failed",
    code,
  );
}
/** One page of readable events, most recent first (occurred_at, then id: stable boundaries). */
export async function auditLogReviewPage(
  page: number,
  filters: AuditLogReviewFilters,
  asOf: string,
): Promise<AuditLogReviewPage> {
  let result;
  try {
    result = await database().rpc(
      "audit_log_page",
      pageArgs(page, filters, asOf),
    );
  } catch (e) {
    throw classify(e);
  }
  if (result.error) throw classify(result.error);
  const raw: unknown = result.data;
  if (!Array.isArray(raw)) throw new AuditLogReviewError("failed", "shape");
  const rows: AuditLogReviewEntry[] = [];
  for (const row of raw as Row[]) {
    const entry = row && typeof row === "object" ? toEntry(row) : null;
    if (!entry) throw new AuditLogReviewError("failed", "shape");
    rows.push(entry);
  }
  const total = raw.length ? Number((raw[0] as Row).total_count) : 0;
  return {
    rows,
    count: Number.isFinite(total) && total >= rows.length ? total : rows.length,
  };
}
