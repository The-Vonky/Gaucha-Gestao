import type { ReportPayload } from "../types";

/**
 * Canonical content hash of a parsed report. Mirrors abc_private.content_hash in
 * supabase/migrations/20261020120000_abc_domain_v1.sql; changing either side requires a
 * new parser version.
 */
const US = String.fromCharCode(31);
const RS = String.fromCharCode(30);

export type HashInput = Omit<ReportPayload, "content_hash" | "warnings" | "parser_version" | "file_sha256">;

export function canonicalContent(p: HashInput): string {
  const header = [p.unit_code, p.period_start, p.period_end, p.cost_basis, p.cost_basis_text, p.declared_total].join(US);
  const subtotals = [...p.subtotals]
    .sort((a, b) => (a.class < b.class ? -1 : a.class > b.class ? 1 : 0))
    .map((s) => ["S", s.class, s.total].join(US));
  const lines = [...p.lines]
    .sort((a, b) => a.line_no - b.line_no)
    .map((l) =>
      ["L", String(l.line_no), l.code, l.name, l.unit, l.quantity, l.unit_cost, l.total,
        l.source_share ?? "", l.erp_class ?? "", l.sheet, String(l.row)].join(US),
    );
  return ["abc-content-v1", header, ...subtotals, ...lines].join(RS);
}

export async function sha256Hex(data: BufferSource | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function contentHash(p: HashInput): Promise<string> {
  return sha256Hex(canonicalContent(p));
}
