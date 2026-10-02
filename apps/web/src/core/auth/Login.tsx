import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { client } from "../client";
import { Notice } from "../../shared/ui";
import { Icon } from "../../shared/icons";
import { BrandMark } from "../../shared/brand";
import logo from "../../assets/gaucha-alimentacao-logo.png";
import "./Login.css";

// Login v3 · Elo. The two open loops of the Gaúcha mark meet on the seam
// between the brand panel and the form: the orange loop frames the message,
// the green loop holds the card. Page layout is pure CSS; the desktop loops
// are fitted to the rendered card and headline (see useEloGeometry).

const DESKTOP = "(min-width: 960px)";
const REDUCED = "(prefers-reduced-motion: reduce)";
const FINE_POINTER = "(hover: hover) and (pointer: fine)";
const COMPACT_HEIGHT = 700;
// The fitted elo is drawn slightly smaller so the headline and the form lead.
const ELO_SCALE = 0.93;
// Plates sit just inside the loop's opening, a little smaller than the stroke,
// so they read as the ends of the mark rather than loose dots.
const PLATE_INSET = 0.6;
const PLATE_SIZE = 0.15;

type Layout = "normal" | "compact";
type Elo = {
  orange: string;
  green: string;
  stroke: number;
  dash: number;
  orangePlate: [number, number];
  greenPlate: [number, number];
  plate: number;
  contact: [number, number];
  radius: number;
};

/** Arc of a loop of radius r centred on (cx, cy), open towards the plate. */
function loop(cx: number, cy: number, r: number, side: "left" | "right") {
  const dx = 0.4622 * r;
  const dy = 0.8189 * r;
  const x = side === "left" ? cx - dx : cx + dx;
  const sweep = side === "left" ? 1 : 0;
  const f = (n: number) => n.toFixed(1);
  return `M${f(x)} ${f(cy - dy)} A${f(r)} ${f(r)} 0 1 ${sweep} ${f(x)} ${f(cy + dy)}`;
}

/** Offset of `el` inside `root`, ignoring the entrance transforms. */
function offsetIn(el: HTMLElement, root: HTMLElement) {
  let top = 0;
  let left = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    top += node.offsetTop;
    left += node.offsetLeft;
    node = node.offsetParent as HTMLElement | null;
  }
  return { top, left, bottom: top + el.offsetHeight };
}

/**
 * Normal vs compact mobile layout from a stable height: decided on load and
 * again only when the width changes (rotation). A height-only resize — the
 * virtual keyboard opening — never flips the layout.
 */
function useStableLayout(): Layout {
  const decide = (): Layout =>
    window.innerWidth < 960 && window.innerHeight < COMPACT_HEIGHT
      ? "compact"
      : "normal";
  const [layout, setLayout] = useState<Layout>(decide);
  useEffect(() => {
    let width = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      setLayout(decide());
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);
  return layout;
}

/**
 * Fits the desktop elo between the product block and the headline (panel
 * side) and inside the card's height (form side), so the green loop only
 * enters and leaves behind the card's left edge.
 */
function useEloGeometry(
  root: RefObject<HTMLElement | null>,
  parts: {
    brand: RefObject<HTMLElement | null>;
    product: RefObject<HTMLElement | null>;
    headline: RefObject<HTMLElement | null>;
    card: RefObject<HTMLElement | null>;
    stage: RefObject<HTMLElement | null>;
  },
) {
  const [elo, setElo] = useState<Elo | null>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const desktop = window.matchMedia(DESKTOP);
    const measure = () => {
      const brand = parts.brand.current;
      const product = parts.product.current;
      const headline = parts.headline.current;
      const card = parts.card.current;
      if (!desktop.matches || !brand || !product || !headline || !card) {
        setElo(null);
        return;
      }
      // The error notice grows the card; measure without it so the elo stays put.
      const notice = card.querySelector<HTMLElement>(".notice");
      if (notice) notice.style.display = "none";
      const c = offsetIn(card, el);
      const top = Math.max(offsetIn(product, el).bottom + 32, c.top + 24);
      const bottom = Math.min(offsetIn(headline, el).top - 36, c.bottom - 24);
      if (notice) notice.style.display = "";
      const fitted = Math.max(110, Math.min(200, (bottom - top) / 2 / 1.09));
      const radius = fitted * ELO_SCALE;
      const stroke = radius * 0.18;
      const cy = (top + bottom) / 2;
      const seam = brand.offsetWidth;
      const orangeX = seam - radius - stroke * 0.12;
      const greenX = seam + radius + stroke * 0.12;
      setElo({
        orange: loop(orangeX, cy, radius, "left"),
        green: loop(greenX, cy, radius, "right"),
        stroke,
        dash: Math.ceil(4.168 * radius) + 8,
        orangePlate: [orangeX - radius * PLATE_INSET, cy],
        greenPlate: [greenX + radius * PLATE_INSET, cy],
        plate: radius * PLATE_SIZE,
        contact: [seam, cy],
        radius,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // The card is centred in the stage: a stage resize moves it.
    for (const part of [parts.stage, parts.card, parts.headline])
      if (part.current) observer.observe(part.current);
    desktop.addEventListener("change", measure);
    void document.fonts?.ready.then(measure);
    return () => {
      observer.disconnect();
      desktop.removeEventListener("change", measure);
    };
  }, [root, parts.brand, parts.product, parts.headline, parts.card, parts.stage]);
  return elo;
}

/** Subtle desktop parallax: elo up to ±9px, card up to ±2.5px, opposite. */
function useParallax(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const allowed = window.matchMedia(`${DESKTOP} and ${FINE_POINTER}`);
    const reduced = window.matchMedia(REDUCED);
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !allowed.matches || reduced.matches)
        return;
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.setProperty("--login-px", x.toFixed(3));
        el.style.setProperty("--login-py", y.toFixed(3));
      });
    };
    el.addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", onMove);
    };
  }, [root]);
}

/**
 * Mobile keyboard: when the visual viewport shrinks around a focused field,
 * scroll only as much as needed to keep the submit button 16px above it.
 */
function useKeyboardCta(
  form: RefObject<HTMLFormElement | null>,
  button: RefObject<HTMLButtonElement | null>,
) {
  useEffect(() => {
    const viewport = window.visualViewport;
    const f = form.current;
    if (!viewport || !f) return;
    let frame = 0;
    const keepVisible = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const b = button.current;
        if (!b || window.innerWidth >= 960 || !f.contains(document.activeElement))
          return;
        const limit = viewport.offsetTop + viewport.height - 16;
        const overflow = b.getBoundingClientRect().bottom - limit;
        if (overflow > 0) window.scrollBy(0, overflow);
      });
    };
    viewport.addEventListener("resize", keepVisible);
    f.addEventListener("focusin", keepVisible);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", keepVisible);
      f.removeEventListener("focusin", keepVisible);
    };
  }, [form, button]);
}

/** Paints the browser chrome (status bar area) in the brand green. */
function useBrandThemeColor() {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (!meta) return;
    const previous = meta.content;
    meta.content = "#0f2c1e";
    return () => {
      meta.content = previous;
    };
  }, []);
}

function MailIcon() {
  return (
    <svg className="login-v3-field-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="login-v3-field-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shakes, setShakes] = useState(0);
  const layout = useStableLayout();
  const gradient = useId().replace(/:/g, "");

  const root = useRef<HTMLElement>(null);
  const brand = useRef<HTMLElement>(null);
  const product = useRef<HTMLDivElement>(null);
  const headline = useRef<HTMLParagraphElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const elo = useEloGeometry(root, {
    brand,
    product,
    headline,
    card,
    stage,
  });
  useParallax(root);
  useKeyboardCta(form, button);
  useBrandThemeColor();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");

    try {
      const result = await client!.auth.signInWithPassword({
        email: String(data.get("email")).trim(),
        password: String(data.get("password")),
      });

      if (result.error) {
        setError(
          "Não foi possível entrar. Confira suas credenciais e tente novamente.",
        );
        setShakes((n) => n + 1);
      }
    } catch {
      setError("Conexão indisponível. Tente novamente.");
      setShakes((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  const orange = `url(#${gradient}-o)`;
  const green = `url(#${gradient}-g)`;

  return (
    <main
      ref={root}
      className={`login-v3${elo ? " has-elo" : ""}`}
      data-layout={layout}
    >
      <svg className="login-v3-defs" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={`${gradient}-o`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#fbb900" />
            <stop offset="1" stopColor="#ee8100" />
          </linearGradient>
          <linearGradient id={`${gradient}-g`} x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1ba14a" />
            <stop offset="1" stopColor="#a6cf5e" />
          </linearGradient>
        </defs>
      </svg>

      {elo && (
        <svg className="login-v3-elo" aria-hidden="true" focusable="false">
          <g
            className="login-v3-elo-shift"
            style={{ ["--elo-dash" as string]: elo.dash }}
          >
            <g className="login-v3-contact">
              <circle
                className="login-v3-glow"
                cx={elo.contact[0]}
                cy={elo.contact[1]}
                r={elo.radius * 0.28}
                style={{ filter: `blur(${(elo.radius * 0.09).toFixed(1)}px)` }}
              />
            </g>
            <path
              className="login-v3-loop is-green"
              d={elo.green}
              stroke={green}
              strokeWidth={elo.stroke}
            />
            <circle
              className="login-v3-plate is-green"
              cx={elo.greenPlate[0]}
              cy={elo.greenPlate[1]}
              r={elo.plate}
              fill={green}
            />
            <path
              className="login-v3-loop is-orange"
              d={elo.orange}
              stroke={orange}
              strokeWidth={elo.stroke}
            />
            <circle
              className="login-v3-plate is-orange"
              cx={elo.orangePlate[0]}
              cy={elo.orangePlate[1]}
              r={elo.plate}
              fill={orange}
            />
          </g>
        </svg>
      )}

      <section ref={brand} className="login-v3-brand" aria-label="Gaúcha Gestão">
        <svg
          className="login-v3-band-elo"
          aria-hidden="true"
          focusable="false"
          viewBox={layout === "compact" ? "0 0 140 37" : "0 0 240 78"}
        >
          {layout === "compact" ? (
            <g style={{ ["--elo-dash" as string]: 134 }}>
              <circle className="login-v3-glow" cx="96" cy="37" r="18" style={{ filter: "blur(8px)" }} />
              <path className="login-v3-loop is-green" d={loop(126, 37, 30, "right")} stroke={green} strokeWidth="7" />
              <path className="login-v3-loop is-orange" d={loop(66, 37, 30, "left")} stroke={orange} strokeWidth="7" />
              <circle className="login-v3-plate is-orange" cx="36" cy="37" r="7" fill={orange} />
            </g>
          ) : (
            <g style={{ ["--elo-dash" as string]: 275 }}>
              <circle className="login-v3-glow" cx="176" cy="78" r="30" style={{ filter: "blur(12px)" }} />
              <path className="login-v3-loop is-green" d={loop(240, 78, 64, "right")} stroke={green} strokeWidth="14" />
              <path className="login-v3-loop is-orange" d={loop(112, 78, 64, "left")} stroke={orange} strokeWidth="14" />
              <circle className="login-v3-plate is-orange" cx="48" cy="78" r="14" fill={orange} />
            </g>
          )}
        </svg>

        <div ref={product} className="login-v3-product login-v3-rise">
          <BrandMark className="login-v3-product-mark" />
          <span>
            <strong>Gaúcha Gestão</strong>
            <small>Plataforma corporativa</small>
          </span>
        </div>

        <div className="login-v3-message">
          <p ref={headline} className="login-v3-headline">
            <span className="login-v3-rise">Gestão da operação,</span>{" "}
            <span className="login-v3-rise">com clareza</span>{" "}
            <span className="login-v3-rise is-gold">e controle.</span>
          </p>
          <p className="login-v3-subtitle login-v3-rise">
            Informação, processos e gestão das unidades em um ambiente único,
            seguro e rastreável.
          </p>
        </div>
      </section>

      <section className="login-v3-main" aria-labelledby="login-title">
        <div ref={stage} className="login-v3-stage">
          <div className="login-v3-card-in">
            <div
              ref={card}
              className="login-v3-card"
              data-shake={shakes ? (shakes % 2 ? "a" : "b") : undefined}
            >
              <h1 id="login-title">Entrar na plataforma</h1>
              <p className="login-v3-support">
                Use o e-mail e a senha fornecidos pela administração.
              </p>

              <form
                ref={form}
                className="login-v3-form"
                aria-busy={busy}
                onSubmit={(e) => void submit(e)}
              >
                <fieldset disabled={busy}>
                  <label htmlFor="login-email">
                    <span className="login-v3-label">E-mail</span>
                    <span className="login-v3-field">
                      <MailIcon />
                      <input
                        id="login-email"
                        name="email"
                        type="email"
                        inputMode="email"
                        autoComplete="username"
                        autoCapitalize="none"
                        spellCheck={false}
                        enterKeyHint="next"
                        required
                      />
                    </span>
                  </label>

                  <label htmlFor="login-password">
                    <span className="login-v3-label">Senha</span>
                    <span className="login-v3-field">
                      <LockIcon />
                      <input
                        id="login-password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        enterKeyHint="go"
                        required
                      />
                    </span>
                  </label>

                  {error && <Notice error>{error}</Notice>}

                  <button
                    ref={button}
                    className={`primary login-v3-submit${busy ? " is-busy" : ""}`}
                    type="submit"
                  >
                    {busy ? (
                      <>
                        <BrandMark className="login-v3-loader" />
                        <span>Entrando…</span>
                      </>
                    ) : (
                      <>
                        <span>Entrar</span>
                        <Icon name="arrowRight" className="login-v3-arrow" />
                      </>
                    )}
                  </button>
                </fieldset>
              </form>

              <p className="login-v3-help">
                Precisa de acesso ou redefinição de senha?{" "}
                <strong>Fale com a administração.</strong>
              </p>
            </div>
          </div>
        </div>

        <footer className="login-v3-foot login-v3-rise">
          <span className="login-v3-signature">
            <span>Uma plataforma</span>
            <img src={logo} alt="Gaúcha Alimentação" width="148" height="35" />
          </span>
          <span className="login-v3-copy">© 2026</span>
        </footer>
      </section>
    </main>
  );
}
