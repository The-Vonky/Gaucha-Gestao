import type { ReactNode } from "react";
import type { AuditUnit } from "./types";
const MINOR = new Set(["de", "da", "do", "das", "dos", "e", "a", "o"]);
/** Up to two initials from the unit name, skipping connectives ("Cozinha Central" → "CC"). */
export function monogram(name: string) {
  const words = name
    .split(/\s+/)
    .filter((w) => w && !MINOR.has(w.toLocaleLowerCase("pt-BR")));
  return (words.length ? words : [name])
    .slice(0, 2)
    .map((w) => w[0]?.toLocaleUpperCase("pt-BR") ?? "")
    .join("");
}
/** Stable composition variant per unit, so neighbouring covers are told apart. */
function variant(unit: AuditUnit) {
  let hash = 0;
  for (const ch of unit.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 4;
}
/**
 * Unit cover (Audit UX v2 · visual alignment). The Core has no unit image yet,
 * so the slot shows an honest brand fallback: deep green surface, faint
 * abstract shapes and a large monogram. A future Core-owned cover replaces
 * `.unit-cover-art` with an image in the same slot; the scrim and overlay
 * content stay. Audit creates no image, URL or storage.
 */
export function UnitCover({
  unit,
  size = "card",
  children,
}: {
  unit: AuditUnit;
  size?: "card" | "hero";
  children: ReactNode;
}) {
  return (
    <div className={`unit-cover unit-cover-${size}`} data-variant={variant(unit)}>
      <span className="unit-cover-art" aria-hidden="true">
        <span className="unit-cover-monogram">{monogram(unit.name)}</span>
      </span>
      <div className="unit-cover-content">{children}</div>
    </div>
  );
}
