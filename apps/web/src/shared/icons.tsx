// Inline 24px stroke icons (no icon library dependency). Decorative by default:
// the accessible name always comes from the surrounding control or text.
const paths = {
  home: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z",
  audit:
    "M9 4h6m-6 0a1 1 0 0 0-1 1v1h8V5a1 1 0 0 0-1-1M9 4H6.5A1.5 1.5 0 0 0 5 5.5v14A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-14A1.5 1.5 0 0 0 17.5 4H15m-6 9 2 2 4-4",
  actionPlan:
    "M12 21a9 9 0 1 1 9-9M12 17a5 5 0 1 1 5-5m-5 1a1 1 0 1 0 0-2m3.5 1.5L20 9m0 0V5.5M20 9h-3.5",
  users:
    "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.65a3.5 3.5 0 0 1 0 6.7",
  roles:
    "M12 3 5 6v5.5c0 4.2 3 7.9 7 9.5 4-1.6 7-5.3 7-9.5V6zm-3 9 2 2 4-4",
  permissions:
    "M14.5 9.5a4.5 4.5 0 1 1-2.2-3.87M14.5 9.5 21 16v3h-3v-2h-2v-2h-2l-1.2-1.2M9.5 9.5h.01",
  units:
    "M4 21V6.5L10 3v18M10 21h10V9l-6-2.5M4 21h16M13.5 11h3M13.5 15h3M6.5 9h1m-1 4h1m-1 4h1",
  sectors:
    "m12 3 9 5-9 5-9-5zm-9 9 9 5 9-5M3 16l9 5 9-5",
  logs: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  logout:
    "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10",
  chevronRight: "m9 6 6 6-6 6",
  arrowRight: "M5 12h14m-6-6 6 6-6 6",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18m0-5v-5m0-3h.01",
  success: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18m-4-9 3 3 5-6",
  warning:
    "M10.3 4.3 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0M12 9.5v4m0 3h.01",
  error: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M9 9l6 6m0-6-6 6",
  check: "m5 12.5 4.5 4.5L19 7",
  chevronDown: "m6 9 6 6 6-6",
  calendar:
    "M7 3v3m10-3v3M4 9.5h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8m-7 9a7 7 0 0 1 14 0",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18m0-13v4.5l3 2",
  filter: "M4 5h16l-6 7.5V19l-4 2v-8.5z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14m9 2-4-4",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zm0 0v5h5",
  upload:
    "M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15",
  download:
    "M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15",
  trash:
    "M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2",
  retry: "M20 11a8 8 0 1 0-2.34 5.66M20 4.5V11h-6.5",
} as const;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  className = "icon",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
