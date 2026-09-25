import { useId } from "react";
// Abstract mark derived from the Gaúcha Alimentação logo: two open loops
// (orange/gold and green/lime), each closed by a "plate", touching in the middle.
const ORANGE_LOOP = "M9.84 6.63A9 9 0 1 1 9.84 21.37";
const GREEN_LOOP = "M38.16 6.63A9 9 0 1 0 38.16 21.37";
export function BrandMark({ className = "brand-mark" }: { className?: string }) {
  const id = useId();
  const orange = `url(#${id}o)`;
  const green = `url(#${id}g)`;
  return (
    <svg
      className={className}
      viewBox="0 0 48 28"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}o`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#fbb900" />
          <stop offset="1" stopColor="#ee8100" />
        </linearGradient>
        <linearGradient id={`${id}g`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1ba14a" />
          <stop offset="1" stopColor="#a6cf5e" />
        </linearGradient>
      </defs>
      <g className="loop-orange">
        <path
          d={ORANGE_LOOP}
          fill="none"
          stroke={orange}
          strokeWidth="4.2"
          strokeLinecap="round"
        />
        <circle cx="5" cy="14" r="4" fill={orange} />
      </g>
      <g className="loop-green">
        <path
          d={GREEN_LOOP}
          fill="none"
          stroke={green}
          strokeWidth="4.2"
          strokeLinecap="round"
        />
        <circle cx="43" cy="14" r="4" fill={green} />
      </g>
    </svg>
  );
}
/** Faint concentric arcs used as a brand watermark on hero/brand surfaces. */
export function BrandArcs({ className = "brand-arcs" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 400 400"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="arc-orange"
        d="M60 250a140 140 0 0 1 240-98"
        strokeWidth="26"
        strokeLinecap="round"
      />
      <path
        className="arc-green"
        d="M340 150a140 140 0 0 1-240 98"
        strokeWidth="26"
        strokeLinecap="round"
      />
      <circle className="arc-dot-orange" cx="40" cy="296" r="18" />
      <circle className="arc-dot-green" cx="360" cy="104" r="18" />
    </svg>
  );
}
export function Loader({ label }: { label: string }) {
  return (
    <div className="loader" role="status">
      <BrandMark className="loader-mark" />
      <span>{label}</span>
    </div>
  );
}
