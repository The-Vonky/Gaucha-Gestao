// Authoritative rule mirrored by audit_private.conformity/classify in the database.
export const RESPONSES = ["AT", "AP", "NAT", "NAP"] as const;
export type Response = (typeof RESPONSES)[number];
export const RESPONSE_LABELS: Record<Response, string> = {
  AT: "Atende",
  AP: "Atende parcialmente",
  NAT: "Não atende",
  NAP: "Não se aplica",
};
export type Classification = "adequate" | "partial" | "inadequate";
export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  adequate: "Adequada",
  partial: "Adequada parcialmente e requer análise de mudanças",
  inadequate: "Inadequada e requer intervenção imediata",
};
export type Tally = {
  total: number;
  answered: number;
  at: number;
  ap: number;
  nat: number;
  nap: number;
};
export function tally(responses: (Response | null)[]): Tally {
  const count = (r: Response) => responses.filter((x) => x === r).length;
  const t = {
    total: responses.length,
    at: count("AT"),
    ap: count("AP"),
    nat: count("NAT"),
    nap: count("NAP"),
  };
  return { ...t, answered: t.at + t.ap + t.nat + t.nap };
}
/** Conformity in % or null when no applicable criterion was answered. */
export function conformity({ at, ap, nat }: Tally): number | null {
  const applicable = at + ap + nat;
  // Integer numerator keeps threshold comparisons exact.
  return applicable ? (100 * at + 50 * ap) / applicable : null;
}
export function classify(score: number | null): Classification | null {
  if (score === null) return null;
  return score >= 76 ? "adequate" : score >= 51 ? "partial" : "inadequate";
}
export type Result = {
  tally: Tally;
  score: number | null;
  complete: boolean;
  /** Only defined when every criterion is answered and at least one applies. */
  classification: Classification | null;
};
export function evaluate(t: Tally): Result {
  const score = conformity(t);
  const complete = t.total > 0 && t.answered === t.total;
  return {
    tally: t,
    score,
    complete,
    classification: complete ? classify(score) : null,
  };
}
export function formatScore(score: number | null): string {
  return score === null
    ? "—"
    : `${score.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
/** Difference between finalized scores in p.p.; |delta| < 0.5 is stable. */
export function trend(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  const delta = current - previous;
  return {
    delta,
    direction: Math.abs(delta) < 0.5 ? "stable" : delta > 0 ? "up" : "down",
  } as const;
}
