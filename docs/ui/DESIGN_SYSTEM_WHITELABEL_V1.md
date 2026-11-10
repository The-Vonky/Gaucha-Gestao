# Design System white-label v1.0 — tokens, galeria e validação

**Estado:** incremento de fundação visual, **somente demonstração**. Não altera Login, Shell, módulos, autenticação, permissões, banco ou dados. Telas atuais continuam no tema Elo. **Sem deploy.**
**Decisão de arquitetura:** [ADR-009 — Proposto](../decisions/ADR-009-white-label-design-tokens.md).
**Direção visual:** *Enterprise Modern* — cinzas frios, uma cor de ação por marca, sombras discretas, tipografia do sistema, densidade operacional preservada (40 px desktop, 44 px toque).

## 1. Como acessar a galeria

A galeria é uma entrada Vite separada em `/design-system/`, fora do bundle da aplicação. Não precisa de Supabase, `.env`, Docker nem login.

```bash
npm ci
npm run ds:dev          # abre http://localhost:5173/design-system/
# ou, build estático isolado:
npm run ds:build        # gera apps/web/dist/design-system (não deployável)
npm run ds:preview -w apps/web   # serve o build em http://localhost:4173/design-system/
```

Links diretos (o endereço é atualizado ao trocar marca/modo, sem recarregar a página):

| Variante | Claro | Escuro | Automático |
| --- | --- | --- | --- |
| Hub padrão (fictícia) | `/design-system/?brand=hub&mode=light` | `?brand=hub&mode=dark` | `?brand=hub&mode=system` |
| Empresa A — cobre (fictícia) | `/design-system/?brand=empresa-a&mode=light` | `?brand=empresa-a&mode=dark` | `?brand=empresa-a&mode=system` |
| Empresa B — verde (fictícia) | `/design-system/?brand=empresa-b&mode=light` | `?brand=empresa-b&mode=dark` | `?brand=empresa-b&mode=system` |

Valores desconhecidos em `brand`/`mode` caem no Hub padrão / Automático. As três marcas são fictícias e identificadas como tal na barra lateral, no seletor e no aviso fixo da página.

**Capturas (Chromium, 1440×900 e 390×844):** [`evidence/ds-whitelabel-v1/`](evidence/ds-whitelabel-v1/) — `<marca>-<modo>-1440.png` (topo e fundamentos), `<marca>-<modo>-componentes-1440.png` (botões e campos) e `<marca>-mobile-390.png`.

## 2. Seções da galeria

Fundamentos (escalas de marca, semânticos, tipografia) · Botões (primário, secundário, ghost, perigo, link, pequeno, indisponível, carregando, ícone) · Campos e seleção (input com dica, erro com `aria-invalid`/`aria-describedby`, indisponível, select, textarea, rádio, checkbox) · Badges e alertas · Cards (básico, com status, navegável) · Tabela com paginação · Navegação (menu lateral, trilha, abas WAI-ARIA) · Métricas · Estados vazios e carregamento · Diálogos (modal com formulário, confirmação destrutiva, painel lateral) · Acessibilidade (contraste medido ao vivo, movimento reduzido, preferência do sistema).

Componentes **reutilizados sem reescrita** de `shared/ui.tsx`: `Badge`, `Notice`, `Metric`, `Table`, `Pager`, `EmptyState`, `LoadingState`, `Modal`, `Confirm`, `Form`, `Drawer`, `IconButton`. Novos (candidatos a `shared/ui.tsx`, em `shared/theme/controls.tsx`): `SegmentedControl`, `Tabs`, `Breadcrumbs`, `Field`, `OrganizationMark`.

## 3. Modelo de tokens

```
Primitivos (--hub-*)  ─┐
                       ├─► Semânticos por modo (.hub-theme[data-theme]) ─► componentes
Marca (--brand-*)     ─┘        --color-*, --success*, --shadow-*, --focus-ring…
```

- **Primitivos** — `shared/theme/theme.css` (`:root`). Nunca usados por componentes.
- **Marca** — `BrandConfig` em `shared/theme/brand.ts`; escalas `primary` (ação, link, foco, seleção) e `accent` (destaques na superfície de marca). Validadas por `sanitizeBrand` e aplicadas inline por `ThemeRoot` via `brandStyle`.
- **Semânticos** — mesmos nomes que o Elo (`shared/styles/tokens.css`) já usa; redefinidos por modo em `.hub-theme[data-theme="light"|"dark"]`.
- **Modo** — `ColorModeProvider`: `light`, `dark`, `system` (segue `prefers-color-scheme` ao vivo). **Marca** — `BrandProvider`. Contextos separados: a preferência da pessoa nunca sobrescreve a marca, e vice-versa.

### 3.1 Uso

```tsx
import { ThemeProvider } from "../shared/theme/ThemeProvider";
import "../shared/theme/theme.css"; // depois de tokens.css e base.css

<ThemeProvider brand={marcaDaOrganizacao} storageKey="hub.color-mode">
  <App />
</ThemeProvider>
```

`useColorMode()` devolve `{ preference, mode, setPreference }`; `useBrand()` devolve a marca validada.

### 3.2 Semânticos por modo

| Token | Claro | Escuro |
| --- | --- | --- |
| `--color-bg` | `var(--hub-gray-50)` | `var(--hub-gray-950)` |
| `--color-surface` | `var(--hub-gray-0)` | `var(--hub-gray-900)` |
| `--color-surface-subtle` | `var(--hub-gray-25)` | `var(--hub-gray-850)` |
| `--color-surface-sunken` | `var(--hub-gray-100)` | `var(--hub-gray-925)` |
| `--color-surface-header` | `rgb(243 245 247 / 0.88)` | `rgb(12 15 20 / 0.86)` |
| `--color-text` | `var(--hub-gray-900)` | `var(--hub-gray-25)` |
| `--color-text-control` | `var(--hub-gray-800)` | `var(--hub-gray-100)` |
| `--color-text-secondary` | `var(--hub-gray-600)` | `var(--hub-gray-300)` |
| `--color-text-tertiary` | `var(--hub-gray-500)` | `var(--hub-gray-400)` |
| `--color-text-disabled` | `var(--hub-gray-500)` | `var(--hub-gray-400)` |
| `--color-text-inverse` | `var(--hub-gray-0)` | `var(--hub-gray-950)` |
| `--color-icon` | `var(--hub-gray-500)` | `var(--hub-gray-400)` |
| `--color-icon-strong` | `var(--hub-gray-700)` | `var(--hub-gray-200)` |
| `--color-input-bg` | `var(--hub-gray-0)` | `var(--hub-gray-925)` |
| `--color-input-disabled-bg` | `var(--hub-gray-100)` | `var(--hub-gray-850)` |
| `--color-border` | `var(--hub-gray-200)` | `var(--hub-gray-800)` |
| `--color-border-strong` | `var(--hub-gray-300)` | `var(--hub-gray-700)` |
| `--color-border-control` | `var(--hub-gray-400)` | `#6f7a8b` |
| `--color-border-control-hover` | `var(--hub-gray-600)` | `var(--hub-gray-300)` |
| `--color-hover-bg` | `var(--hub-gray-100)` | `var(--hub-gray-850)` |
| `--color-pressed-bg` | `var(--hub-gray-200)` | `var(--hub-gray-800)` |
| `--color-backdrop` | `rgb(12 15 20 / 0.5)` | `rgb(0 0 0 / 0.6)` |
| `--color-link` | `var(--brand-primary-700)` | `var(--brand-primary-300)` |
| `--color-link-hover` | `var(--brand-primary-800)` | `var(--brand-primary-200)` |
| `--color-action` | `var(--brand-primary-600)` | `var(--brand-primary-400)` |
| `--color-action-hover` | `var(--brand-primary-700)` | `var(--brand-primary-300)` |
| `--color-action-active` | `var(--brand-primary-800)` | `var(--brand-primary-200)` |
| `--color-action-text` | `#ffffff` | `var(--brand-primary-950)` |
| `--color-action-disabled-bg` | `var(--brand-primary-100)` | `var(--hub-gray-800)` |
| `--color-action-disabled-text` | `var(--brand-primary-800)` | `var(--hub-gray-300)` |
| `--color-selected-bg` | `var(--brand-primary-50)` | `var(--brand-primary-950)` |
| `--color-selected-text` | `var(--brand-primary-800)` | `var(--brand-primary-200)` |
| `--color-selection-bg` | `var(--brand-primary-100)` | `var(--brand-primary-800)` |
| `--color-focus` | `var(--brand-primary-600)` | `var(--brand-primary-400)` |
| `--color-focus-halo` | `rgb(12 15 20 / 0.08)` | `rgb(255 255 255 / 0.08)` |
| `--success` | `var(--hub-green-700)` | `var(--hub-green-300)` |
| `--success-bg` | `var(--hub-green-50)` | `var(--hub-green-950)` |
| `--success-border` | `var(--hub-green-200)` | `var(--hub-green-900)` |
| `--success-solid` | `var(--hub-green-700)` | `var(--hub-green-300)` |
| `--warning` | `var(--hub-amber-700)` | `var(--hub-amber-300)` |
| `--warning-bg` | `var(--hub-amber-50)` | `var(--hub-amber-950)` |
| `--warning-border` | `var(--hub-amber-200)` | `var(--hub-amber-900)` |
| `--warning-solid` | `var(--hub-amber-700)` | `var(--hub-amber-300)` |
| `--danger` | `var(--hub-red-700)` | `var(--hub-red-300)` |
| `--danger-text` | `var(--hub-red-800)` | `var(--hub-red-100)` |
| `--danger-bg` | `var(--hub-red-50)` | `var(--hub-red-950)` |
| `--danger-border` | `var(--hub-red-200)` | `var(--hub-red-900)` |
| `--danger-solid` | `var(--hub-red-700)` | `var(--hub-red-300)` |
| `--info` | `var(--hub-sky-700)` | `var(--hub-sky-300)` |
| `--info-bg` | `var(--hub-sky-50)` | `var(--hub-sky-950)` |
| `--info-border` | `var(--hub-sky-200)` | `var(--hub-sky-900)` |
| `--info-solid` | `var(--hub-sky-700)` | `var(--hub-sky-300)` |
| `--neutral` | `var(--hub-gray-600)` | `var(--hub-gray-300)` |
| `--neutral-bg` | `var(--hub-gray-100)` | `var(--hub-gray-850)` |
| `--neutral-border` | `var(--hub-gray-300)` | `var(--hub-gray-700)` |
| `--neutral-solid` | `var(--hub-gray-600)` | `var(--hub-gray-300)` |
| `--shadow-xs` | `0 1px 2px rgb(12 15 20 / 0.05)` | `0 1px 2px rgb(0 0 0 / 0.4)` |
| `--shadow-sm` | `0 1px 2px rgb(12 15 20 / 0.04), 0 2px 6px rgb(12 15 20 / 0.04)` | `0 1px 2px rgb(0 0 0 / 0.4), 0 2px 6px rgb(0 0 0 / 0.25)` |
| `--shadow-md` | `0 1px 2px rgb(12 15 20 / 0.04), 0 8px 20px -6px rgb(12 15 20 / 0.1)` | `0 1px 2px rgb(0 0 0 / 0.4), 0 8px 20px -6px rgb(0 0 0 / 0.5)` |
| `--shadow-lg` | `0 24px 56px -12px rgb(12 15 20 / 0.28)` | `0 24px 56px -12px rgb(0 0 0 / 0.7)` |
| `--shadow-input` | `inset 0 1px 1px rgb(12 15 20 / 0.04)` | `none` |
| `--shadow-action` | `0 1px 2px rgb(12 15 20 / 0.12)` | `none` |
| `--shadow-action-hover` | `0 2px 6px rgb(12 15 20 / 0.16)` | `none` |

Também definidos para ambos os modos em `.hub-theme`: `--color-surface-brand` (`primary-950`), `--on-brand` (`#ffffff`), `--on-brand-secondary` (`primary-200`), `--on-brand-muted` (`primary-300`), `--on-brand-accent` (`accent-300`), `--focus-ring`, `--focus-ring-input` e a escala tipográfica `--text-*` com a fonte do sistema (`--hub-font-display`).

### 3.3 Primitivos

| Token | Valor |
| --- | --- |
| `--hub-gray-0` | `#ffffff` |
| `--hub-gray-25` | `#f9fafb` |
| `--hub-gray-50` | `#f3f5f7` |
| `--hub-gray-100` | `#eaedf1` |
| `--hub-gray-200` | `#dde2e8` |
| `--hub-gray-300` | `#c8cfd8` |
| `--hub-gray-400` | `#7d8899` |
| `--hub-gray-500` | `#626d7e` |
| `--hub-gray-600` | `#4e5969` |
| `--hub-gray-700` | `#3b4553` |
| `--hub-gray-800` | `#29313c` |
| `--hub-gray-850` | `#1f2630` |
| `--hub-gray-900` | `#171c24` |
| `--hub-gray-925` | `#12161d` |
| `--hub-gray-950` | `#0c0f14` |
| `--hub-green-50` | `#e8f5ed` |
| `--hub-green-200` | `#b9e2c6` |
| `--hub-green-300` | `#5fcf8e` |
| `--hub-green-700` | `#18743a` |
| `--hub-green-900` | `#1d4d30` |
| `--hub-green-950` | `#0f2a1b` |
| `--hub-amber-50` | `#fff4dd` |
| `--hub-amber-200` | `#f0d08f` |
| `--hub-amber-300` | `#f2b65c` |
| `--hub-amber-700` | `#8a5300` |
| `--hub-amber-900` | `#5a4214` |
| `--hub-amber-950` | `#2d2009` |
| `--hub-red-50` | `#fdecea` |
| `--hub-red-100` | `#ffd4cf` |
| `--hub-red-200` | `#f4c1bc` |
| `--hub-red-300` | `#ff8f85` |
| `--hub-red-700` | `#b42318` |
| `--hub-red-800` | `#7a1a12` |
| `--hub-red-900` | `#6b2a22` |
| `--hub-red-950` | `#341410` |
| `--hub-sky-50` | `#e7f1f8` |
| `--hub-sky-200` | `#b8d4e8` |
| `--hub-sky-300` | `#7fc2ee` |
| `--hub-sky-700` | `#1d5f8c` |
| `--hub-sky-900` | `#1f4a66` |
| `--hub-sky-950` | `#0d2233` |

### 3.4 Escalas das marcas de demonstração

| Escala | Tom | Hub padrão | Empresa A | Empresa B |
| --- | --- | --- | --- | --- |
| primary | 50 | `#eef3ff` | `#fcf5f0` | `#ecfaf3` |
| primary | 100 | `#dce6fd` | `#f8e7da` | `#d1f2e2` |
| primary | 200 | `#c0d2fb` | `#f0cbb1` | `#a6e4c7` |
| primary | 300 | `#94b2f7` | `#e6a882` | `#6fcfa5` |
| primary | 400 | `#6a8ff1` | `#d9845a` | `#3fb584` |
| primary | 500 | `#4870e8` | `#c8683c` | `#1f9a6a` |
| primary | 600 | `#2f55d4` | `#a9522c` | `#137d55` |
| primary | 700 | `#2443b0` | `#8a4225` | `#116446` |
| primary | 800 | `#1f398d` | `#6f3621` | `#10503a` |
| primary | 900 | `#1d3370` | `#5a2d1d` | `#0e4231` |
| primary | 950 | `#141f42` | `#33170e` | `#06261c` |
| accent | 50 | `#e9fbfb` | `#f5f6f0` | `#fdf9ec` |
| accent | 100 | `#c9f3f3` | `#e7eadb` | `#f9eecb` |
| accent | 200 | `#9ae7e8` | `#d0d6b8` | `#f2db93` |
| accent | 300 | `#5fd3d6` | `#b3bd8e` | `#ebc35a` |
| accent | 400 | `#2fb8bd` | `#97a46b` | `#e4ab33` |
| accent | 500 | `#18999f` | `#7d8a52` | `#d38c1d` |
| accent | 600 | `#127a81` | `#626d40` | `#b46b16` |
| accent | 700 | `#126268` | `#4d5634` | `#8f4f16` |
| accent | 800 | `#134f55` | `#3f462c` | `#764018` |
| accent | 900 | `#133f45` | `#363b27` | `#643618` |
| accent | 950 | `#062a2f` | `#1c2013` | `#3a1b09` |

### 3.5 Novos papéis semânticos no tema Elo (sem mudança visual)

Os componentes de `base.css` liam 13 primitivos diretamente, o que impediria tema escuro. Foram trocados por papéis semânticos que, no Elo, apontam **para o mesmo valor** (verificado em teste):

| Papel | Valor no Elo | Uso |
| --- | --- | --- |
| `--color-text-control` | `var(--neutral-800)` | texto de botões e rótulos |
| `--color-icon-strong` | `var(--neutral-700)` | botão-ícone ghost |
| `--color-border-control-hover` | `var(--neutral-600)` | hover de campos |
| `--color-input-disabled-bg` | `var(--neutral-100)` | campo indisponível |
| `--color-selection-bg` | `var(--brand-green-100)` | `::selection` |
| `--color-backdrop` | `rgb(10 39 21 / 0.45)` | fundo de diálogos |
| `--color-action-disabled-bg` | `var(--brand-green-200)` | primário indisponível |
| `--color-action-disabled-text` | `var(--brand-green-900)` | primário indisponível |

Também: hover de botão usa `--color-border-control`/`--color-text`, campo indisponível usa `--color-border-strong`, aviso usa `--color-text` e o halo do estado vazio usa `--color-bg` — todos com valores idênticos aos anteriores. `EmptyState`, `LoadingState` e `Loader` aceitam `mark` opcional (padrão continua sendo os elos Gaúcha).

## 4. Contraste (WCAG 2.x AA)

Razões calculadas a partir do CSS real (`tests/design-system-tokens.test.ts`) e confirmadas pelo navegador (painel ao vivo e `tests/integration/design-system-browser.mjs`). Texto ≥ 4,5:1; foco, bordas de controle e ação sobre superfície ≥ 3:1.

| Par | Mín. | Hub padrão claro | Hub padrão escuro | Empresa A claro | Empresa A escuro | Empresa B claro | Empresa B escuro |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Texto sobre fundo | 4,5:1 | 15,65 | 18,37 | 15,65 | 18,37 | 15,65 | 18,37 |
| Texto sobre superfície | 4,5:1 | 17,10 | 16,36 | 17,10 | 16,36 | 17,10 | 16,36 |
| Texto secundário sobre superfície | 4,5:1 | 7,10 | 10,89 | 7,10 | 10,89 | 7,10 | 10,89 |
| Texto secundário sobre fundo | 4,5:1 | 6,50 | 12,22 | 6,50 | 12,22 | 6,50 | 12,22 |
| Texto terciário sobre superfície | 4,5:1 | 5,24 | 4,77 | 5,24 | 4,77 | 5,24 | 4,77 |
| Texto terciário sobre fundo | 4,5:1 | 4,79 | 5,35 | 4,79 | 5,35 | 4,79 | 5,35 |
| Texto de controle sobre campo | 4,5:1 | 13,13 | 15,44 | 13,13 | 15,44 | 13,13 | 15,44 |
| Texto em ação primária | 4,5:1 | 6,23 | 5,22 | 5,34 | 5,83 | 5,13 | 6,26 |
| Texto em ação primária (hover) | 4,5:1 | 8,38 | 7,64 | 7,27 | 8,10 | 7,15 | 8,56 |
| Link sobre superfície | 4,5:1 | 8,38 | 8,12 | 7,27 | 8,38 | 7,15 | 9,08 |
| Link sobre fundo | 4,5:1 | 7,67 | 9,11 | 6,66 | 9,40 | 6,55 | 10,19 |
| Item selecionado | 4,5:1 | 9,32 | 10,62 | 8,74 | 10,93 | 8,76 | 11,17 |
| Selecionado sobre superfície | 4,5:1 | 10,35 | 11,28 | 9,44 | 11,30 | 9,41 | 11,84 |
| Foco sobre superfície | 3:1 | 6,23 | 5,55 | 5,34 | 6,02 | 5,13 | 6,64 |
| Foco sobre fundo | 3:1 | 5,70 | 6,23 | 4,89 | 6,76 | 4,70 | 7,45 |
| Borda de campo sobre campo | 3:1 | 3,59 | 4,17 | 3,59 | 4,17 | 3,59 | 4,17 |
| Borda de campo sobre superfície | 3:1 | 3,59 | 3,94 | 3,59 | 3,94 | 3,59 | 3,94 |
| Ação primária sobre superfície | 3:1 | 6,23 | 5,55 | 5,34 | 6,02 | 5,13 | 6,64 |
| Sucesso | 4,5:1 | 5,20 | 7,90 | 5,20 | 7,90 | 5,20 | 7,90 |
| Atenção | 4,5:1 | 5,80 | 8,79 | 5,80 | 8,79 | 5,80 | 8,79 |
| Erro (ícone/badge) | 4,5:1 | 5,75 | 7,59 | 5,75 | 7,59 | 5,75 | 7,59 |
| Erro (texto) | 4,5:1 | 9,26 | 12,42 | 9,26 | 12,42 | 9,26 | 12,42 |
| Informação | 4,5:1 | 5,98 | 8,39 | 5,98 | 8,39 | 5,98 | 8,39 |
| Neutro | 4,5:1 | 6,05 | 9,70 | 6,05 | 9,70 | 6,05 | 9,70 |
| Navegação: texto | 4,5:1 | 16,10 | 16,10 | 16,54 | 16,54 | 16,13 | 16,13 |
| Navegação: secundário | 4,5:1 | 10,62 | 10,62 | 10,93 | 10,93 | 11,17 | 11,17 |
| Navegação: discreto | 4,5:1 | 7,64 | 7,64 | 8,10 | 8,10 | 8,56 | 8,56 |
| Navegação: foco/destaque | 3:1 | 9,03 | 9,03 | 8,34 | 8,34 | 9,59 | 9,59 |

Fora do gate por norma: texto **indisponível** (`--color-text-disabled`) e bordas decorativas (`--color-border`), que não transmitem informação.

## 5. Validação

Executada em 10/11/2026 sobre a base `a0d479e` (Linux, Node 22.23, Chromium 1243).

| Verificação | Como | Resultado |
| --- | --- | --- |
| Contraste estático, 3 marcas × 2 modos × 28 pares; paridade claro/escuro; marca hostil recusada; papéis Elo com valores inalterados | `npx vitest run tests/design-system-tokens.test.ts` | **PASS** 19/19 |
| Galeria, ThemeProvider, URL, modo automático, abas, diálogo (Esc + retorno de foco), armazenamento bloqueado, sem rede | `npx vitest run tests/design-system-ui.test.tsx` | **PASS** 10/10 |
| Chromium: contraste calculado pelo navegador (28/28 em cada variante), troca sem recarregar, teclado (foco visível em ≥60 paradas de Tab, setas, Esc), 320/375/768/1024/1440 px sem overflow, alvos ≥ 44 px abaixo de 1024 px, movimento reduzido, nenhum host externo | `npm run test:ds-browser` | **PASS**; prova negativa (foco removido) falha como esperado |
| Telas atuais preservadas: Login comparado pixel a pixel antes/depois (1440 e 390 px) | script ad hoc, não versionado | **Idêntico** no estado inicial; após envio vazio, só difere o balão nativo de validação do navegador |
| `npm run verify` (typecheck, lint, test, build, verify:build, ds:build, audit) | `npm run verify` | typecheck, lint, build, verify:build, ds:build e audit (0 vulnerabilidades) **PASS**; test **1139 PASS / 9 FAIL** — as 9 falhas são de `tests/audit-derivative-worker.test.ts` e **ocorrem idênticas na `main` sem esta mudança** (encoder isolado por `prlimit` + `bwrap --cap-drop ALL`, indisponível neste sandbox; a CI instala `bubblewrap`) |
| Bundle principal sem a galeria | busca por `hub-theme` em `apps/web/dist/assets` | nenhuma ocorrência |

O teste de navegador aceita `CHROMIUM_PATH` para usar um Chromium já instalado e `DS_ARTIFACT_DIR` para gravar capturas.

**Não executado:** leitor de tela real (NVDA/VoiceOver), dispositivos físicos iOS/Android, zoom 200% manual, Safari/Firefox. O teste de navegador não está no workflow de CI (mudança de CI fica a critério do mantenedor).

## 6. Limites deste incremento

Sem upload de logotipo, domínio personalizado, CSS arbitrário, fontes externas, migrations ou persistência por tenant (ver ADR-009 §5). O Core atual é de organização única: "multi-tenant" é TO-BE. Antes de aplicar ao login, dashboard, solicitações e administração, é preciso decidir a identidade padrão e migrar `app/shell.css`, `app/styles.css`, `core/auth/Login.css` e CSS de módulos que ainda leem primitivos.
