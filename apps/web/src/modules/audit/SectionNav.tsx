import { useState } from "react";
import { Icon } from "../../shared/icons";
import { Drawer, IconButton } from "../../shared/ui";
export type SectionEntry = {
  key: string;
  position: number;
  name: string;
  answered: number;
  total: number;
};
function SectionList({
  sections,
  current,
  onSelect,
}: {
  sections: SectionEntry[];
  current: string;
  onSelect: (key: string) => void;
}) {
  return (
    <ol className="section-list">
      {sections.map((s) => {
        const done = s.total > 0 && s.answered === s.total;
        return (
          <li key={s.key}>
            <button
              type="button"
              aria-current={s.key === current ? "true" : undefined}
              aria-label={`Seção ${s.position}: ${s.name}, ${s.answered} de ${s.total} respondidos${done ? ", completa" : ""}`}
              onClick={() => onSelect(s.key)}
            >
              <span className="section-position numeric">{s.position}</span>
              <span className="section-name">{s.name}</span>
              <span className="section-count numeric">
                {done && <Icon name="check" />}
                {s.answered}/{s.total}
              </span>
              <span className="section-fill" aria-hidden="true">
                <span
                  style={{ width: `${(100 * s.answered) / (s.total || 1)}%` }}
                />
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
/** Desktop: sticky list. Below 1024px: sticky compact bar opening a bottom sheet. */
export function SectionNav({
  sections,
  current,
  answered,
  total,
  onSelect,
}: {
  sections: SectionEntry[];
  current: string;
  answered: number;
  total: number;
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = sections.find((s) => s.key === current) ?? sections[0];
  return (
    <>
      <nav className="audit-sections" aria-label="Seções do checklist">
        <p className="eyebrow">Seções</p>
        <SectionList
          sections={sections}
          current={current}
          onSelect={onSelect}
        />
      </nav>
      <div className="audit-section-bar">
        <button
          type="button"
          className="audit-section-trigger"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Seção ${active.position} de ${sections.length}: ${active.name}, ${active.answered} de ${active.total} respondidos. Escolher seção`}
          onClick={() => setOpen(true)}
        >
          <span className="trigger-text">
            <span className="trigger-step">
              Seção {active.position} de {sections.length}
            </span>
            <span className="trigger-name">{active.name}</span>
          </span>
          <span className="trigger-count numeric">
            {active.answered}/{active.total}
          </span>
          <Icon name="chevronDown" />
        </button>
        <span className="audit-section-total numeric">
          Total {answered}/{total}
        </span>
      </div>
      {open && (
        <Drawer
          label="Seções do checklist"
          className="sheet"
          onClose={() => setOpen(false)}
        >
          <div className="sheet-head">
            <div>
              <h2>Seções</h2>
              <span className="muted numeric">
                {answered}/{total} critérios respondidos
              </span>
            </div>
            <IconButton
              icon="close"
              label="Fechar"
              className="ghost"
              onClick={() => setOpen(false)}
            />
          </div>
          <div className="sheet-body">
            <SectionList
              sections={sections}
              current={current}
              onSelect={(key) => {
                setOpen(false);
                onSelect(key);
              }}
            />
          </div>
        </Drawer>
      )}
    </>
  );
}
