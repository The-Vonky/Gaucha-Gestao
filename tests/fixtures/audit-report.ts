import type { InspectionReport } from "../../apps/web/src/modules/audit/reporting/types";
import type { ChecklistEvidence } from "../../apps/web/src/modules/audit/types";
export const report: InspectionReport = {
  schema_version: 1, kind: "inspection", record_count: 1, generated_at: "2026-11-18T12:00:00Z",
  display_timezone: "America/Sao_Paulo", generated_by: { id: "synthetic-user", name: "Pessoa sintética" },
  unit: { id: "00000000-0000-0000-0000-000000000001", code: "SINT", name: "Unidade sintética — demonstração" },
  inspection: { id: "00000000-0000-0000-0000-000000000002", template_version: "checklist-v1",
    applied_on: "2026-11-18", previous_visit_on: null, responsible_id: "synthetic-user", responsible_name: "Pessoa sintética",
    status: "finalized", counts: { total: 20, answered: 20, unanswered: 0, applicable: 20, at: 20, ap: 0, nat: 0, nap: 0 },
    progress_percent: 100, score: 100, classification: "adequate", finalized_at: "2026-11-18T12:00:00Z", version: 1, created_at: "2026-11-18T12:00:00Z" },
  sections: ["Instalações", "Processos"].map((name, section) => ({ key: `s${section}`, position: section + 1, name,
    counts: { total: 10, answered: 10, unanswered: 0, applicable: 10, at: 10, ap: 0, nat: 0, nap: 0 },
    score: 100, complete: true, classification: "adequate",
    items: Array.from({ length: 10 }, (_, index) => ({ key: `i${section * 10 + index}`, position: index + 1,
      number: section * 10 + index + 1, text: `Condição ${section * 10 + index + 1} está adequada e documentada?`,
      response: "AT", observation: "Registro sintético para validação de exportação.", version: 1, updated_at: "2026-11-18T12:00:00Z" })) })),
};
export function evidenceRows(count: number): ChecklistEvidence[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `synthetic-evidence-${index}`, inspection_id: report.inspection.id, item_key: `i${count === 5 ? [0, 0, 10, 11, 11][index] : Math.floor(index / 5)}`,
    object_key: `synthetic/${index}.jpg`, original_name: `foto-sintética-${index + 1}.jpg`, content_type: "image/jpeg",
    size_bytes: 32, created_by: "synthetic-user", uploaded_by_name: "Pessoa sintética", uploaded_at: "2026-11-18T12:00:00Z",
  }));
}
