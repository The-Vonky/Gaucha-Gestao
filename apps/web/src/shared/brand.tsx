import { useId } from "react";
// Abstract mark derived from the Gaúcha Alimentação logo: two open loops
// (orange/gold and green/lime), each closed by a "plate", touching in the middle.
const ORANGE_LOOP = "M9.84 6.63A9 9 0 1 1 9.84 21.37";
const GREEN_LOOP = "M38.16 6.63A9 9 0 1 0 38.16 21.37";
export function BrandMark({
  className = "brand-mark",
}: {
  className?: string;
}) {
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
/**
 * Line-art watermark of the mark at hero scale: the two loops, their "plates"
 * with a rim, and a faint orbit echo. Strokes keep a constant width at any size.
 */
export function BrandArcs({
  className = "brand-arcs",
}: {
  className?: string;
}) {
  const id = useId();
  const line = {
    fill: "none",
    strokeLinecap: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
  };
  return (
    <svg
      className={className}
      viewBox="0 0 480 280"
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
      <g stroke={`url(#${id}o)`}>
        <path
          className="arcs-main"
          d="M98.4 66.3A90 90 0 1 1 98.4 213.7"
          {...line}
        />
        <path
          className="arcs-echo"
          d="M85.8 48.3A112 112 0 1 1 85.8 231.7"
          {...line}
        />
        <circle className="arcs-main" cx="50" cy="140" r="40" {...line} />
        <circle className="arcs-echo" cx="50" cy="140" r="27" {...line} />
      </g>
      <g stroke={`url(#${id}g)`}>
        <path
          className="arcs-main"
          d="M381.6 66.3A90 90 0 1 0 381.6 213.7"
          {...line}
        />
        <path
          className="arcs-echo"
          d="M394.2 48.3A112 112 0 1 0 394.2 231.7"
          {...line}
        />
        <circle className="arcs-main" cx="430" cy="140" r="40" {...line} />
        <circle className="arcs-echo" cx="430" cy="140" r="27" {...line} />
      </g>
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
