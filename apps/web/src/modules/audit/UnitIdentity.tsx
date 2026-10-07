import { useState, type ReactNode } from "react";
import type { UnitCover as CoreCover } from "../../core/unitCovers";
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
 * Unit cover (Audit UX v2 · visual alignment). Shows the Core-owned unit photo
 * (Unit Cover v1) when one is resolved, framed with its object-position; the
 * brand fallback (deep green surface, abstract shapes, monogram) stays beneath
 * it and is what remains visible without a photo or when the image fails.
 * Audit only renders the Core contract: it creates no image, URL or storage.
 */
export function UnitCover({
  unit,
  size = "card",
  cover,
  onCoverError,
  children,
}: {
  unit: AuditUnit;
  size?: "card" | "hero";
  cover?: CoreCover | null;
  onCoverError?: (cover: CoreCover) => void;
  children: ReactNode;
}) {
  const [broken, setBroken] = useState<string>();
  const photo = cover && cover.url !== broken ? cover : null;
  return (
    <div
      className={`unit-cover unit-cover-${size}`}
      data-variant={variant(unit)}
      data-photo={photo ? "" : undefined}
    >
      <span className="unit-cover-art" aria-hidden="true">
        <span className="unit-cover-monogram">{monogram(unit.name)}</span>
        {photo && (
          <img
            className="unit-cover-photo"
            src={photo.url}
            alt=""
            decoding="async"
            style={{ objectPosition: `${photo.x}% ${photo.y}%` }}
            onError={() => {
              setBroken(photo.url);
              onCoverError?.(photo);
            }}
          />
        )}
      </span>
      <div className="unit-cover-content">{children}</div>
    </div>
  );
}
