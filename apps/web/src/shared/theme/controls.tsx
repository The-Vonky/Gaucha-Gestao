/*
 * Design System v1 components that do not exist in shared/ui.tsx yet. They use
 * only semantic tokens, so they work in the current Elo theme and in any
 * white-label theme. Candidates to move into shared/ui.tsx when adopted.
 */
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useBrand } from "./ThemeProvider";
import "./controls.css";

/** The organization's mark: a monogram, never an uploaded image in this increment. */
export function OrganizationMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const brand = useBrand();
  return (
    <span className={`org-mark ${size}`} aria-hidden="true">
      {brand.monogram}
    </span>
  );
}

/** Single choice among few options. Native radios: arrow keys move the choice. */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="segmented">
      <legend>{label}</legend>
      <div className="segmented-track">
        {options.map((option) => (
          <label key={option.value} className="segmented-option" title={option.hint}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

/** WAI-ARIA tabs with automatic activation (arrows, Home, End). */
export function Tabs({
  label,
  items,
  selected,
  onSelect,
}: {
  label: string;
  items: readonly TabItem[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = items.length - 1;
    const next =
      event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    onSelect(items[next].id);
    refs.current[items[next].id]?.focus();
  }
  const current = items.find((item) => item.id === selected) ?? items[0];
  return (
    <div className="tabs">
      <div role="tablist" aria-label={label} className="tab-list">
        {items.map((item, index) => {
          const active = item.id === current.id;
          return (
            <button
              key={item.id}
              ref={(el) => {
                refs.current[item.id] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-${item.id}-tab`}
              aria-selected={active}
              aria-controls={`${base}-${item.id}-panel`}
              tabIndex={active ? 0 : -1}
              className="tab"
              onClick={() => onSelect(item.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${base}-${current.id}-panel`}
        aria-labelledby={`${base}-${current.id}-tab`}
        tabIndex={0}
        className="tab-panel"
      >
        {current.content}
      </div>
    </div>
  );
}

export function Breadcrumbs({ items }: { items: readonly { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Trilha de navegação" className="breadcrumbs">
      <ol>
        {items.map((item, index) =>
          index === items.length - 1 ? (
            <li key={item.label} aria-current="page">
              {item.label}
            </li>
          ) : (
            <li key={item.label}>
              <a href={item.href}>{item.label}</a>
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}

/** Field with label, hint and error wired through aria-describedby. */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => ReactNode;
}) {
  const id = useId();
  const described = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
  return (
    <div className={`field${error ? " invalid" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children({
        id,
        ...(described ? { "aria-describedby": described } : {}),
        ...(error ? { "aria-invalid": true as const } : {}),
      })}
      {hint && (
        <small id={`${id}-hint`} className="field-hint">
          {hint}
        </small>
      )}
      {error && (
        <small id={`${id}-error`} className="field-error">
          {error}
        </small>
      )}
    </div>
  );
}
