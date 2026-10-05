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
/**
 * Unit media slot (D2). Today it shows a typographic monogram; the slot is the
 * place a future Core-owned unit cover would occupy without rebuilding cards.
 * No image, URL or storage is created by Audit.
 */
export function UnitMedia({ unit, size = "md" }: { unit: AuditUnit; size?: "md" | "lg" }) {
  return (
    <span className={`unit-media ${size}`} aria-hidden="true">
      <span className="unit-monogram">{monogram(unit.name)}</span>
    </span>
  );
}
