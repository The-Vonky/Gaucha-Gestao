# Implementation Brief — Quality UI v1 (Gaúcha Gestão Design System)

Status: PHASE 1 IMPLEMENTED (foundation) · phases 2–3 open  
Date: 2026-09-25  
Baseline: `main` at `8f1464be79cdf871666c713ba89b6eacfd21a769`  
Branch: `feat/quality-ui-v1`

> First official Design System of Gaúcha Gestão, applied first to the Quality core (Audit, Action Plans, Evidence). This is a presentation brief: it never changes business rules, RPCs, schema, RLS, authorization, scoring, lifecycle or the Audit / Action Plans / Evidence contracts.

## References

- **Brand:** the official Gaúcha Alimentação logo (orange/gold loop, green→lime loop, charcoal wordmark, circular "plates", utensils joining the loops).
- **UX baseline:** `Checklist_Qualidade_v2.9.1_Gaucha` (see `docs/modules/audit/AUDIT_SOURCE_OF_TRUTH.md`). Used for hierarchy, density and interaction ideas only — never for architecture or code. Rules taken from it:
  - green/orange/red are reserved for **final** result bands (≥76 %, 51–75.9 %, <51 %);
  - drafts in progress use a neutral bluish state; "no data" uses gray;
  - the progress bar shows **filling only**, in a solid neutral color;
  - no band classification is shown with 0 responses;
  - the section selector becomes a sheet on mobile; chips/list on desktop.

## 1. Principles

1. **90 % functional, 10 % signature.** Clean, neutral working surfaces; brand color and gradients appear only in signature places (shell hairline, active indicator, avatar ring, hero, loaders, empty states, KPI accents).
2. **Recognizably Gaúcha without the logo.** Identity comes from the green/orange pairing, the loop/plate geometry and the orange focus ring — not from repeating the logo. The full logo appears only on the login screen.
3. **Brand ≠ status.** Brand tokens never communicate state. Status always has its own semantic token plus text/icon; color is never the only signal.
4. **Density with air.** Operational screens (158 criteria, plan queue) favor compact rows, strong alignment and typographic hierarchy over large cards.
5. **Real data only.** No invented KPIs, charts or placeholders presented as data. Every number shown must come from an existing API.
6. **Motion clarifies, never decorates.** Short durations; everything respects `prefers-reduced-motion`.

## 2. Palette

Source file: `apps/web/src/shared/styles/tokens.css`.

| Family | Scale | Key steps |
| --- | --- | --- |
| Gaúcha Green | `--brand-green-50 … 950`, `--brand-lime-300/400` | 500 `#2a9f4c` logo green (graphics only) · **600 `#1f8540` primary action (4.7:1 on white)** · 700 links/selected text · 950 brand surface |
| Gaúcha Orange | `--brand-orange-50 … 950` | 400 `#fbb022` gold · 500 `#f39200` logo orange (graphics only) · **600 `#d67500` focus ring** · 700 orange text (4.8:1) |
| Neutrals | `--neutral-0 … 950` | 50 app background · 200 borders · 400 control borders (≥3:1) · 600 secondary text (5.9:1) · 900 primary text · 950 charcoal |

Pure logo colors (500) are for graphics, gradients and large marks only; text and controls use the darker steps.

### Role tokens

`--color-bg`, `--color-surface(-subtle|-sunken|-brand)`, `--color-text(-secondary|-disabled|-inverse)`, `--color-border(-strong|-control)`, `--color-link(-hover)`, `--color-action(-hover|-active|-text)`, `--color-selected-bg/-text`, `--color-hover-bg`, `--color-pressed-bg`, `--color-focus`.

### Semantic status (independent from brand)

| Token | Use |
| --- | --- |
| `--success` (+ `-bg`, `-border`, `-solid`) | AT, final "Adequada", completed / effective |
| `--warning` | AP, final "Parcialmente adequada", due soon, partially effective |
| `--danger` | NAT, final "Inadequada…", overdue, ineffective, errors |
| `--info` | draft / in progress, informational notices |
| `--neutral` | NAP, no data, inactive, removed |

### Gradients (signature only)

`--gradient-orange`, `--gradient-green`, `--gradient-brand` (orange→green→lime, horizontal), `--gradient-indicator` (vertical, active nav marker). Allowed: shell hairline, active indicator, avatar ring, module hero, loaders, empty states, special indicators and charts. Forbidden: buttons, card fills, large saturated areas, gradient text, glows.

## 3. Typography

System stack, no web-font dependency: `Segoe UI Variable` (the corporate Windows fleet) → `system-ui`/SF → Roboto. Display sizes use the "Display" optical variant where available.

| Token | Spec | Use |
| --- | --- | --- |
| `--text-display` | 600 36/1.1, −0.025em | Home/login hero |
| `--text-page-title` | 650 26/1.2 | `h1` |
| `--text-section-title` | 650 18/1.35 | `h2` |
| `--text-card-title` | 600 16/1.4 | `h3`, card titles |
| `--text-body` | 400 15/1.55 | default |
| `--text-body-sm` | 400 13/1.5 | meta, table secondary |
| `--text-label` | 600 13/1.35 | form labels, buttons |
| `--text-caption` | 400 12/1.4 | helper text, timestamps |
| `--text-overline` | 650 11/1.3, uppercase, +0.08em | eyebrows, table headers, nav groups |
| `--text-kpi` | 650 28/1.1 | numbers/KPIs — always `font-variant-numeric: tabular-nums` |

Tables, progress counts, percentages and dates use tabular numerals (`.numeric`).

## 4. Spacing, radius, elevation, layers, motion

- **Spacing:** 4 px base — `--space-1` (4) … `--space-16` (64).
- **Radius:** `xs 4` · `sm 6` (badges) · `md 8` (controls) · `lg 12` (cards) · `xl 16` (hero, dialogs). `--radius-full` only for dots, avatars and progress tracks — never for buttons.
- **Shadows:** `xs`/`sm` for controls and cards, `md` for hover/raised, `lg` for dialogs. Borders define structure first; shadows are secondary.
- **Layers:** `sticky 20 · header 30 · drawer 40 · modal 50 · toast 60 · skip 70`.
- **Motion:** `fast 120ms` (hover/press), `base 180ms` (cards, arrows), `slow 260ms` (dialog/drawer entry); easing `--ease-standard`, `--ease-emphasized`. Global reduced-motion override disables animations and transitions.
- **Breakpoints:** `sm <600` · `md 600–1023` · `lg ≥1024` · `xl ≥1440`. Product-required widths: 375, 768, 1024, 1440+.
- **Controls:** 40 px desktop; 44 px on touch (`pointer: coarse`) and below 1024 px.

## 5. Components

Only components that are reused exist. Phase 1 status:

| Component | Where | Status |
| --- | --- | --- |
| Button (default, `.primary`, `.danger`, `.ghost`, `.small`) | global CSS on `<button>` / `.button-link` | done (phase 1) |
| `IconButton` | `shared/ui.tsx` | done |
| `Icon` (inline SVG set) | `shared/icons.tsx` | done |
| `BrandMark`, `BrandArcs`, `Loader` | `shared/brand.tsx` | done |
| `Notice` (info/success/warning/error + icon) | `shared/ui.tsx` | done (API compatible: `error` still works) |
| `PageTitle` (optional `eyebrow`, actions slot) | `shared/ui.tsx` | done |
| `Modal` / `Confirm` / `Form` | `shared/ui.tsx` | restyled |
| `Drawer` (native modal dialog sheet) | `shared/ui.tsx` | done |
| `EmptyState` | `shared/ui.tsx` | done |
| Badge / `Status` | CSS tones `success/warning/danger/info` + dot | done |
| Table, Pager, filters, record list, form controls | global CSS | restyled |
| `SegmentedControl` (AT/AP/NAT/NAP) | Audit | phase 2 |
| `SectionNav` (desktop list + mobile sheet) | Audit | phase 2 |
| `Progress` (neutral fill + count) | Audit, Home | phase 2 |
| `Metric` (KPI tile) | Audit hero, Action Plans | phase 2 |
| `StatusBadge` (domain status → semantic tone + icon) | Audit, Action Plans | phase 2 |
| `FileItem` / upload zone | Evidence | phase 3 |
| Toast / save confirmation | Audit autosave | phase 2 (only if the inline save state proves insufficient) |

Not planned unless a real reuse appears: Tooltip, Dropdown, Tabs, Radio group, Checkbox component (native controls are styled globally).

## 6. App Shell

- **Desktop (≥1024):** 256 px light sidebar with a 3 px brand gradient hairline on top; brand lockup (mark + "Gaúcha / GESTÃO"); permission-driven navigation from `app/navigation.ts` (unchanged rules); each destination has an icon and static description. Selected item: subtle green background, semibold, green icon and a 3 px orange→green indicator. Footer: "Gaúcha Alimentação · Plataforma corporativa" under a short brand-gradient accent.
- **Header:** sticky, translucent white, 60 px; breadcrumbs `Início / Grupo / Destino` derived from navigation; user avatar (initials, brand-gradient ring), name and "Sair".
- **Tablet/Mobile (<1024):** sidebar removed; header with menu button, compact mark and avatar; navigation opens a modal `Drawer` (focus trap, Escape, backdrop click closes, closes on navigation) that also holds the user and "Sair". Breadcrumbs hidden below 600 px; "Sair" becomes icon-only in the header.
- Route change scrolls to top and focuses `main` without scrolling it under the sticky header.
- **Home:** compact hero with the real date, greeting and the areas released to the user (group + destination count, derived from permissions); line-art mark watermark. Operational areas use **featured** cards (icon tile, arrow, title anchored low, plate-rim corner, accent hairline on hover); Administração uses **compact** rows. Accent per group: Qualidade green, Administração neutral, future operational modules orange. No KPIs until a real source exists. No permissions → `EmptyState` (mark on a "plate" halo) showing the signed-in e-mail to hand to the administration.
- **Login:** cohesive brand block (mark, eyebrow, title, tagline) on green-950, line-art mark anchored low-right, footer "Gaúcha Alimentação · Uso interno"; the form side keeps the official logo. Mobile stacks a compact brand band over the form.
- **Brand motif (`BrandArcs`):** the mark redrawn as thin line art — both loops, plates with a rim and a dotted orbit echo — with constant 1–1.5 px strokes. Never filled, never behind body text.
- **BrandMark sizes:** sidebar/drawer 36 · mobile header 30 · login 56 (44 mobile) · states 48 · loader 56 · empty state 44.

## 7. Responsiveness

- 375 px is a product requirement: no primary operation may depend on horizontal scroll. Tables may scroll inside their own region only for secondary data.
- Integration tests keep asserting `scrollWidth <= innerWidth` at 375 px.
- Grids collapse to one column below 600 px; page actions wrap under the title.

## 8. Accessibility

- Focus: 2 px orange (`--color-focus`) outline with 2 px offset on every interactive element; inputs add a green focus halo.
- Contrast: body/secondary text ≥4.5:1; control borders ≥3:1; logo 500-steps never used for text.
- Touch targets ≥44 px on touch and below 1024 px; the Audit answer buttons are always ≥44 px.
- Native `<dialog>` for Modal/Drawer; `aria-labelledby`/`aria-label`; icon-only buttons have `aria-label` + `title`.
- `aria-current="page"` on active nav and breadcrumbs; `aria-pressed` on toggle answers; status never conveyed by color alone.
- `prefers-reduced-motion` disables animation globally.

## 9. Audit design rules (phase 2)

Preserve integrally: 158 criteria, 9 sections, AT/AP/NAT/NAP, observations, scoring, progress, finalize, reopen, concurrency/conflict states, permissions, Action Plans and Evidence links. No RPC changes.

1. **Context hero** (compact, ≤ ~160 px desktop): unit, date, responsible, status badge, progress (`n/158`, neutral bar), conformity. Draft conformity is labeled *parcial* and uses neutral/info styling; only a finalized result gets the band color, larger KPI type and the band label.
2. **Section navigation:** desktop sticky list with per-section `answered/total` and a thin neutral progress; current section marked like the nav (green bg + indicator). Mobile: sticky compact bar "Seção x de 9 · nome · n/total" opening a sheet (Drawer pattern) — no native select.
3. **Criteria:** row, not card. Number (tabular, green-700) + question dominate; answers in a 4-option `SegmentedControl` (AT success, AP warning, NAT danger, NAP neutral) with text labels, `aria-pressed`, ≥44 px, keyboard operable; selected state = solid semantic fill + check icon. Dividers between rows; unanswered rows get a subtle left marker.
4. **Observation:** collapsed to a single line normally; when AP/NAT is selected it expands with warning border and label "Observação" emphasis — the functional rule stays exactly as today.
5. **Progress feeling:** global `answered/158` in hero and sticky mobile bar; per-section counts; "next unanswered" affordance is allowed only if it uses existing client data.
6. **Save state:** inline per item (saving / saved / error / conflict) kept visible; conflicts are never hidden.

## 10. Action Plans design rules (phase 2)

- Operational queue, not an Audit clone. Primary question: *"O que precisa da minha atenção?"*
- Dense list rows: priority signal (overdue → danger, due soon → warning), status badge, due date (tabular), unit, origin (checklist item / manual), responsible, execution and verification state, evidence count when available from existing data.
- Existing metrics (`ap-metrics`) become `Metric` tiles with `--text-kpi`; only metrics already computed by the current API.
- Filters in a `FilterBar` that wraps on mobile; queue rows stack meta under the title at 375 px.
- Detail page: header with status + due date, then sections Execution → Verification → History, each with its evidence block.

## 11. Evidence design rules (phase 3)

Preserve all current restrictions (types, size, count limits, two-phase upload, confirm retry, verification bound to the confirmed set, logical removal, rounds).

- Upload zone: dashed surface with icon and hint (types/limit), full keyboard access; never a bare file input.
- `FileItem` states: *enviando* (progress), *confirmando*, *disponível*, *erro* (+ Tentar novamente), *removido*; actions Baixar / Remover with accessible names including the file name.
- Evidence grouped by kind (execução / verificação) and verification round; the set shown to the verifier is exactly the set bound on verification.
- Long file names truncate in the middle visually but keep the full name in the accessible label; actions wrap below on narrow screens.

## 12. Phases

1. **Foundation (this delivery):** tokens, global styles, Shared components, App Shell, Home, Login; module CSS only re-mapped to tokens.
2. **Audit + Action Plans redesign** following §9–§10.
3. **Evidence experience** following §11; then Admin screens polish.

## Validation

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run verify:build`; browser integration suites (`tests/integration/*.mjs`) must keep passing at 375 px.
