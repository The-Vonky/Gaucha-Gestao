import { ChecklistItem } from "./ChecklistItem";
import { useInspection } from "./InspectionContext";
import { CLASSIFICATION_LABELS, formatScore } from "./scoring";
import { SectionNav } from "./SectionNav";
/** Checklist tab: section navigation plus the current section's criteria. */
export function InspectionChecklist() {
  const {
    sections,
    items,
    answers,
    results,
    editable,
    stale,
    confirming,
    finalization,
    evidence,
    current,
    index,
    select,
    heading,
    onChange,
    onPending,
    onConflict,
  } = useInspection();
  const overall = results.overall;
  const sectionResult = results.sections[current.key];
  return (
    <div className="audit-layout">
      <SectionNav
        sections={sections.map((s) => ({
          key: s.key,
          position: s.position,
          name: s.name,
          answered: results.sections[s.key].tally.answered,
          total: results.sections[s.key].tally.total,
        }))}
        current={current.key}
        answered={overall.tally.answered}
        total={overall.tally.total}
        onSelect={select}
      />
      <section
        className="audit-checklist"
        aria-labelledby="audit-section-title"
      >
        <header className="audit-section-head">
          <h2 id="audit-section-title" ref={heading} tabIndex={-1}>
            {current.position}. {current.name}
          </h2>
          <p className="numeric">
            {sectionResult.tally.answered}/{sectionResult.tally.total}{" "}
            respondidos · {formatScore(sectionResult.score)}{" "}
            {sectionResult.classification
              ? `· ${CLASSIFICATION_LABELS[sectionResult.classification]}`
              : sectionResult.complete
                ? "· Sem critérios aplicáveis"
                : sectionResult.score !== null
                  ? "· Parcial"
                  : ""}
          </p>
        </header>
        <ol className="audit-items">
          {items
            .filter((i) => i.section_key === current.key)
            .map((item) =>
              answers[item.key] ? (
                <ChecklistItem
                  key={item.key}
                  item={item}
                  row={answers[item.key]}
                  editable={editable && !stale}
                  evidenceEditable={editable && !stale && !confirming}
                  evidence={evidence}
                  onChange={onChange}
                  onPending={onPending}
                  onConflict={onConflict}
                />
              ) : null,
            )}
        </ol>
        <div className="actions audit-pager">
          <button
            type="button"
            disabled={index <= 0}
            onClick={() => select(sections[index - 1].key)}
          >
            Seção anterior
          </button>
          {index === sections.length - 1 ? (finalization.allowed && <div className="audit-finalize-action">
            <button type="button" className="primary" disabled={!!finalization.reason}
              aria-describedby={finalization.reason ? "audit-checklist-finalize-reason" : undefined}
              onClick={finalization.request}>Finalizar auditoria</button>
            {finalization.reason && <p id="audit-checklist-finalize-reason" role="status">{finalization.reason}</p>}
          </div>) : <button
            type="button"
            onClick={() => select(sections[index + 1].key)}
          >
            Próxima seção
          </button>}
        </div>
      </section>
    </div>
  );
}
