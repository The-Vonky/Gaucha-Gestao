/*
 * Theme = two independent inputs:
 *  - color mode: a person's preference on this device (light, dark or system);
 *  - brand: the organization's identity (future: read from the tenant).
 * They live in separate contexts so neither can override the other.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { DEFAULT_BRAND, brandStyle, sanitizeBrand, type BrandConfig } from "./brand";

export type ColorModePreference = "light" | "dark" | "system";
export type ColorMode = "light" | "dark";
export const COLOR_MODE_PREFERENCES: readonly ColorModePreference[] = ["light", "dark", "system"];
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function isColorModePreference(value: unknown): value is ColorModePreference {
  return COLOR_MODE_PREFERENCES.includes(value as ColorModePreference);
}

interface ColorModeValue {
  preference: ColorModePreference;
  /** What is painted: `system` resolved against the operating system. */
  mode: ColorMode;
  setPreference: (preference: ColorModePreference) => void;
}
const ColorModeContext = createContext<ColorModeValue | null>(null);
const BrandContext = createContext<BrandConfig>(DEFAULT_BRAND);

// Storage can be blocked (private mode, policies); the theme must still work.
function readStored(key: string | null): ColorModePreference | null {
  if (!key) return null;
  try {
    const value = window.localStorage.getItem(key);
    return isColorModePreference(value) ? value : null;
  } catch {
    return null;
  }
}
function writeStored(key: string | null, value: ColorModePreference) {
  if (!key) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* preference stays in memory */
  }
}
function systemPrefersDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches;
}

export function ColorModeProvider({
  children,
  initialPreference,
  storageKey = "hub.color-mode",
}: {
  children: ReactNode;
  /** Wins over the stored value (e.g. a `?mode=` link). */
  initialPreference?: ColorModePreference;
  /** null disables persistence. */
  storageKey?: string | null;
}) {
  const [preference, setState] = useState<ColorModePreference>(
    () => initialPreference ?? readStored(storageKey) ?? "system",
  );
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(DARK_QUERY);
    const update = () => setSystemDark(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const setPreference = useCallback(
    (next: ColorModePreference) => {
      setState(next);
      writeStored(storageKey, next);
    },
    [storageKey],
  );
  const mode: ColorMode = preference === "system" ? (systemDark ? "dark" : "light") : preference;
  const value = useMemo(() => ({ preference, mode, setPreference }), [preference, mode, setPreference]);
  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}

/** Untrusted brand data is validated here too; invalid data falls back to the default. */
export function BrandProvider({ brand, children }: { brand?: BrandConfig; children: ReactNode }) {
  const safe = useMemo(() => (brand && sanitizeBrand(brand)) || DEFAULT_BRAND, [brand]);
  return <BrandContext.Provider value={safe}>{children}</BrandContext.Provider>;
}

export function useColorMode(): ColorModeValue {
  const value = useContext(ColorModeContext);
  if (!value) throw new Error("useColorMode requires ColorModeProvider.");
  return value;
}
export function useBrand(): BrandConfig {
  return useContext(BrandContext);
}

/**
 * Element that carries the theme: `data-theme` selects the semantic layer in
 * theme.css and the inline style carries only the validated `--brand-*` values.
 * Native dialogs opened inside it inherit the theme.
 */
export function ThemeRoot({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { mode, preference } = useColorMode();
  const brand = useBrand();
  const style = useMemo(() => brandStyle(brand) as CSSProperties, [brand]);
  return (
    <div
      className={`hub-theme ${className}`.trim()}
      data-theme={mode}
      data-color-preference={preference}
      data-brand={brand.id}
      style={style}
    >
      {children}
    </div>
  );
}

export function ThemeProvider({
  brand,
  children,
  className,
  initialPreference,
  storageKey,
}: {
  brand?: BrandConfig;
  children: ReactNode;
  className?: string;
  initialPreference?: ColorModePreference;
  storageKey?: string | null;
}) {
  return (
    <ColorModeProvider initialPreference={initialPreference} storageKey={storageKey}>
      <BrandProvider brand={brand}>
        <ThemeRoot className={className}>{children}</ThemeRoot>
      </BrandProvider>
    </ColorModeProvider>
  );
}
