import { Link } from "react-router-dom";
import { Badge } from "../../shared/ui";
import {
  CLASSIFICATION_LABELS,
  evaluate,
  formatScore,
  trend,
  type Tally,
} from "./scoring";
import type { InspectionSummary } from "./types";
export function tallyOf(s: InspectionSummary): Tally {
  return {
    total: s.total_items,
    answered: s.answered,
    at: s.at_count,
    ap: s.ap_count,
    nat: s.nat_count,
    nap: s.nap_count,
  };
}
export { formatDate } from "../../shared/dates";
/** Filling only: a solid neutral bar plus the count; never a result color. */
export function Progress({
  answered,
  total,
}: {
  answered: number;
  total: number;
}) {
  return (
    <span className="audit-progress">
      <progress value={answered} max={total || 1} aria-label="Progresso" />
      <span>
        {answered}/{total} respondidos
      </span>
    </span>
  );
}
/** Final result for finalized inspections; neutral partial result for drafts. */
export function Result({ summary }: { summary: InspectionSummary }) {
  if (summary.status === "finalized") {
    if (summary.final_score === null)
      return (
        <span className="audit-result">
          <strong>—</strong> Sem critérios aplicáveis
        </span>
      );
    return (
      <span className={`audit-result ${summary.final_classification}`}>
        <strong>{formatScore(summary.final_score)}</strong>{" "}
        {CLASSIFICATION_LABELS[summary.final_classification!]}
      </span>
    );
  }
  const { score } = evaluate(tallyOf(summary));
  return (
    <span className="audit-result">
      <strong>{formatScore(score)}</strong>{" "}
      {score === null ? "Sem dados de conformidade" : "Parcial · em andamento"}
    </span>
  );
}
export function Delta({
  current,
  previous,
}: {
  current: number | null;
  previous: number | null;
}) {
  const t = trend(current, previous);
  if (!t) return null;
  const value = `${t.delta > 0 ? "+" : ""}${t.delta.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} p.p.`;
  return (
    <span className={`audit-delta ${t.direction}`}>
      {t.direction === "stable" ? `Estável (${value})` : value} vs. anterior
    </span>
  );
}
export function StatusBadge({
  status,
}: {
  status: InspectionSummary["status"];
}) {
  // Lifecycle state, not a result: drafts are info, finalized is neutral. Band
  // colors belong only to the final classification.
  return status === "finalized" ? (
    <Badge tone="neutral" icon="check">
      Finalizada
    </Badge>
  ) : (
    <Badge tone="info" icon="clock">
      Em andamento
    </Badge>
  );
}
/** An open draft: editors continue its checklist, readers follow its overview. */
export function DraftLink({
  id,
  canEdit,
  className,
}: {
  id: string;
  canEdit: boolean;
  className?: string;
}) {
  return (
    <Link
      className={className ? `button-link ${className}` : "button-link"}
      to={`/audit/inspections/${id}${canEdit ? "/checklist" : ""}`}
    >
      {canEdit ? "Continuar" : "Acompanhar"}
    </Link>
  );
}
