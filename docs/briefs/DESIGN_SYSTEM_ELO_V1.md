# Implementation Brief — Design System Elo v1 (linguagem do Login v3 em toda a aplicação)

Status: APROVADO PARA IMPLEMENTAÇÃO
Data: 2026-10-02
Baseline: `main` em `f9356ae` (aplicação: PR #18 `22334995b5b239274c5c1adc98495357ec0d7980`)
Branch: `design/elo-system-v1`
Risco: **MÉDIO**. Mudança visual global, sem impacto em dados, schema, RLS, autorização, RPCs ou contratos. Não exige threat model: nenhuma superfície de entrada, permissão ou dado muda.
Substitui: §2 (neutros), §4 (elevação/motion) e §8 (cor de foco) de `docs/briefs/QUALITY_UI_V1.md`. Todo o resto daquele brief continua válido.

> Brief de apresentação. Nunca altera regras de negócio, scoring, lifecycle, RPCs, schema, RLS, autorização, Storage ou os contratos de Audit / Action Plans / Evidence.

## 1. Objetivo

O Login v3 · Elo é hoje a superfície visualmente mais madura da plataforma. Ele usa uma linguagem própria, isolada em `core/auth/Login.css`, que diverge do restante da aplicação em quatro pontos: neutros, material dos campos, botão primário e movimento. Este brief promove essa linguagem a design system da aplicação inteira, em desktop e mobile, **sem perder a densidade operacional** das telas de trabalho.

## 2. Decisões já tomadas (não reabrir)

1. **Neutros:** a escala neutra global passa a ser a do Login (fria, levemente esverdeada). A escala quente "linho" atual é aposentada.
2. **Densidade:** campos e botões adotam o *material* do Login, mas mantêm as alturas atuais: 40 px em desktop e 44 px em toque ou abaixo de 1024 px. Os 52/54 px do Login continuam exclusivos do Login.
3. **Elos:** aparecem apenas em superfícies de marca: sidebar, drawer, barra de marca mobile, Home (painéis de domínio), estados vazios e loader. **Nunca** em cabeçalhos de páginas operacionais.
4. **Foco:** passa de laranja para verde (`--brand-green-600`) em superfícies claras, como no Login. Em superfícies de marca escuras, usa `--on-brand-accent` (`--brand-orange-300`, 9.33:1 sobre `#0f2c1e`).
5. **Brand ≠ status** continua inegociável. Tokens semânticos de status (`--success*`, `--warning*`, `--danger*`, `--info*`) e as faixas de resultado da Auditoria **não mudam**.

## 3. Contexto atual (verificado em 2026-10-02)

- Telas: App Shell, Home, Administração (6 telas), Auditoria (overview, inspeção com 158 critérios, histórico, reporting), Planos de Ação (overview, detalhe, evidências), Login.
- CSS: `shared/styles/tokens.css` (209 linhas), `shared/styles/base.css` (876), `app/shell.css` (732), `app/styles.css` (1222), `core/admin/admin.css` (323), `modules/audit/evidence.css` (103), `core/auth/Login.css` (884), `modules/audit/reporting/print.css` (31).
- Fora de `tokens.css` e `Login.css` não há tamanhos de fonte nem raios literais; as cores literais estão concentradas em `app/shell.css` (15) e `base.css` (2). Há ~47 usos diretos da escala `--neutral-N` em `base.css`, `app/styles.css`, `app/shell.css` e `core/admin/admin.css`.
- Os testes não fazem asserções de cor. A proteção automática da UI é estrutural: alvos de toque ≥44 px e ausência de overflow horizontal em `tests/integration/quality-touch.mjs` e `tests/integration/admin.mjs`, com visibilidade/print em `tests/integration/audit.mjs`. **Mudança visual não é coberta por teste: exige evidência por screenshot.**
- **Defeito encontrado:** `input/select/textarea` usam `--text-body` (15 px) inclusive em mobile. O iOS Safari aplica zoom automático ao focar campos com menos de 16 px. O Login já usa 16 px.

## 4. Requisitos

### 4.1 Tokens (`shared/styles/tokens.css`)

**Remapear a escala neutra no lugar**, mantendo o papel de cada degrau. Assim os ~47 usos diretos herdam a mudança sem edição tela a tela.

| Token | Atual | Novo | Origem | Papel / contraste medido |
| --- | --- | --- | --- | --- |
| `--neutral-0` | `#ffffff` | `#ffffff` | — | superfície |
| `--neutral-25` | `#fbfaf7` | `#f9faf7` | derivado | superfície sutil (th, hover de linha) |
| `--neutral-50` | `#f4f2ec` | `#f4f5f0` | `--login-bg` | superfície de trabalho |
| `--neutral-100` | `#ebe8e0` | `#eceeea` | disabled bg do Login | sunken / hover |
| `--neutral-200` | `#dfdbd1` | `#e2e7e1` | `--login-line` | borda |
| `--neutral-300` | `#cbc6b9` | `#d3d9d3` | borda disabled do Login | borda forte |
| `--neutral-400` | `#8f8a7d` | `#7e8b83` | `--login-input-border` | borda de controle: 3.55:1 / branco, 3.30:1 / input-bg |
| `--neutral-500` | `#7a7568` | `#6b7a71` | `--login-icon` | ícones e texto *disabled* **somente**: 4.12:1 sobre `#f4f5f0`, **não usar para texto comum** |
| `--neutral-600` | `#5c584d` | `#4f5e55` | `--login-text-2` | texto secundário: 6.25:1 / work |
| `--neutral-700` | `#454239` | `#3c4a42` | derivado | texto forte secundário |
| `--neutral-800` | `#2f2d27` | `#26362d` | derivado | texto de controles: 11.63:1 / work |
| `--neutral-900` | `#1f1e1a` | `#14241b` | `--login-text` | texto: 14.77:1 / work |
| `--neutral-950` | `#141310` | `#0b160f` | derivado | — |

**Novos tokens semânticos:**

- `--color-text-tertiary: #5f6b65` (`--login-text-3`; 5.07:1 sobre work, 4.76:1 sobre `--neutral-100`), para legendas, rodapés e labels desabilitados;
- `--color-input-bg: #f6f7f3` (`--login-input-bg`);
- `--color-icon: var(--neutral-500)`;
- `--radius-control: 10px` (campos e botões, como no Login);
- `--shadow-input: inset 0 1px 2px rgb(10 39 21 / 0.06), 0 1px 0 rgb(255 255 255 / 0.8)`;
- `--focus-ring-input: 0 0 0 1px var(--color-action), 0 0 0 4px rgb(31 133 64 / 0.12), 0 2px 6px rgb(10 39 21 / 0.06)`;
- `--shadow-action` e `--shadow-action-hover`, com os valores exatos do `.login-v3-submit` (inset highlight + sombra verde);
- `--ease-elo: cubic-bezier(0.2, 0.7, 0.2, 1)` e `--duration-entrance: 260ms`.

**Ajustes de tokens existentes:**

- `--color-focus: var(--brand-green-600)` (era `--brand-orange-700`). `--focus-ring` mantém a forma de 2 px de superfície + 4 px de foco;
- todas as sombras `--shadow-*` passam da tinta quente `rgb(31 30 26 / …)` para a tinta verde `rgb(10 39 21 / …)`, preservando opacidade, offsets e blur atuais;
- `--on-brand: #f4f1ea` (Login), `--on-brand-muted: #9fb8a9` (Login; 7.08:1) e novo `--on-brand-secondary: #c9d7cd` (Login; 10.07:1).

Os valores marcados como "derivado" foram interpolados por este brief. Antes de usá-los, confirme os contrastes declarados com a fórmula WCAG 2.x e registre o resultado no PR.

### 4.2 Login passa a consumir os tokens

- Em `core/auth/Login.css`, cada variável `--login-*` cujo valor agora existe como token global passa a referenciá-lo (ex.: `--login-bg: var(--neutral-50)`, `--login-text-3: var(--color-text-tertiary)`). Variáveis sem token equivalente continuam locais.
- **Critério rígido: o Login não muda visualmente.** Compare screenshots antes/depois em 1440×900, 1280×720, 390×844 e 375×667 (modo compact). Qualquer diferença perceptível é regressão.
- Não reintroduza regras de Login em `app/shell.css` (invariante do AGENTS.md).

### 4.3 Componentes base (`shared/styles/base.css`)

**Campos (`input`, `select`, `textarea`):**
- fundo `--color-input-bg`, borda `--neutral-400`, raio `--radius-control`, sombra `--shadow-input`;
- hover: borda `--neutral-600`;
- foco: borda `--color-action` + `--focus-ring-input` (substitui o halo atual);
- disabled: borda tracejada `--neutral-300`, fundo `--neutral-100`, texto `--color-text-tertiary`, sem sombra;
- altura: mantida (`--control-height`; 44 px nas regras de toque existentes);
- **mobile: `font-size: 16px` em `(pointer: coarse), (max-width: 1023px)`**, para corrigir o zoom do iOS;
- checkbox e radio mantêm a aparência atual, só com os neutros novos e o foco verde;
- não adicionar ícones a campos que hoje não têm ícone. A "pista de ícone" com linha fina do Login só se aplica onde já existe ícone no campo.

**Botões:**
- raio `--radius-control` para todos os botões e `.button-link`;
- `button.primary` / `.button-link.primary`: fonte `--font-display` 600 com `letter-spacing: 0.03em`, `--shadow-action`; hover usa `--shadow-action-hover`; active usa `transform: scale(0.985)`, como no Login, em vez de `translateY(1px)`; foco com `--focus-ring`;
- secundário, ghost e danger: mesma forma (raio e foco), sem sombra verde. Danger continua semântico;
- a seta que se move no hover só se aplica a botões que **já** têm ícone de seta. Não adicionar ícones;
- alturas e paddings atuais mantidos.

**Superfícies:**
- `.card` e `.table-scroll` mantêm `--radius-lg`, com os neutros novos;
- `dialog` mantém `--radius-xl` e usa `--shadow-lg` re-tingida; a entrada usa `--ease-elo`;
- `.notice`: raio `--radius-control`; nas notices de erro, adotar a entrada `login-v3-alert` (6 px, 320 ms) como animação global `notice-in`;
- `::selection` permanece verde.

**Loader (`.loader` e `Loader` em `shared/brand.tsx`):**
- substituir a rotação (`loop-spin`) pela alternância de opacidade dos dois elos usada no Login (`login-v3-alternate`, 1.1 s, laços defasados em −0.55 s, opacidade 0.3 ↔ 1). **Sem rotação.**
- Com `prefers-reduced-motion`, mostrar os dois elos estáticos e opacos.

### 4.4 Shell e superfícies de marca (`app/shell.css`)

- Sidebar, drawer e barra de marca mobile: textos em `--on-brand`, `--on-brand-secondary` e `--on-brand-muted`. Foco nessas superfícies usa `--on-brand-accent`.
- Topbar translúcida: `rgb(244 242 236 / 0.86)` passa a ser o equivalente frio de `--neutral-50` (`rgb(244 245 240 / 0.86)`).
- Converter as 15 cores literais de `shell.css` em tokens, novos ou existentes. As únicas exceções aceitas são tons alpha usados apenas sobre a superfície de marca, que podem virar tokens `--brand-surface-*`.
- Elos: usar sempre `BrandMark` (nada de círculos soltos, princípio §1.2 do brief original). O desenho dos elos na sidebar, no drawer e nos painéis da Home deve seguir o tratamento do Login: traço com pontas arredondadas, as duas cores do gradiente da marca e o ponto de contato discreto. Respeitar os tamanhos já definidos em QUALITY_UI_V1 §6.
- Barra de marca mobile: pode adotar a composição da banda mobile do Login (`.login-v3-band-elo`), desde que respeite a altura de 56 px do header, as safe areas de topo e laterais e os alvos de 44 px.
- Home: os painéis de domínio mantêm a estrutura atual (sem hero, sem KPI inventado); só troca a tinta e a composição dos elos.
- Estados vazios e loader: elos conforme §4.3.

### 4.5 Movimento

- Entrada de página: apenas o título da página e o primeiro bloco de conteúdo, `translateY(8px)` → 0 com opacidade, em `--duration-entrance` e `--ease-elo`, **finita**, uma vez por navegação.
- Nada de parallax, desenho de traço ou glow fora do Login.
- `prefers-reduced-motion: reduce` desliga todas as animações novas.
- Atenção: `tests/integration/admin.mjs` mede alvos de toque depois que as animações finitas terminam. Animações infinitas (só o loader) não podem afetar elementos medidos.

### 4.6 Varredura dos módulos

Em `app/styles.css`, `core/admin/admin.css` e `modules/audit/evidence.css`:
- não pode sobrar nenhuma referência aos neutros quentes antigos (`#f4f2ec`, `#fbfaf7`, `#ebe8e0`, `#dfdbd1`, `#cbc6b9`, `#8f8a7d`, `#7a7568`, `#5c584d`, `#454239`, `#2f2d27`, `#1f1e1a`, `#141310`) nem à tinta `rgb(31 30 26`;
- onde houver `--neutral-500` usado como **texto comum**, trocar por `--color-text-tertiary` ou `--neutral-600`;
- SegmentedControl AT/AP/NAT/NAP, faixas de resultado, badges e metrics: **cores semânticas intactas**. Só forma (raio) e foco mudam.

## 5. Fora de escopo

- Qualquer mudança em TSX que altere comportamento, texto, ordem de foco, estrutura de dados, rotas ou permissões. São permitidas apenas mudanças de `className`, uma variável CSS ou o `Loader`, quando estritamente necessárias para aplicar estilo.
- Tamanho de campos/botões do Login nas telas operacionais (decisão §2.2).
- Elos em cabeçalhos de páginas operacionais (decisão §2.3).
- `modules/audit/reporting/print.css` e a superfície de impressão. O print continua idêntico.
- Novas dependências, fontes web, frameworks CSS, CSS-in-JS ou tema escuro.
- Novas telas, KPIs, ilustrações ou textos de marketing.
- Os módulos futuros (Registros ISO, Pesquisa de Satisfação etc.).

## 6. Critérios de aceite

1. `tokens.css` contém a escala e os tokens do §4.1. Os contrastes dos valores derivados foram recalculados e registrados no PR.
2. Login visualmente idêntico ao baseline nos 4 viewports do §4.2 (screenshots antes/depois no PR).
3. `grep` dos hex quentes listados no §4.6 e de `rgb(31 30 26` em `apps/web/src` retorna **zero** ocorrências.
4. Fora de `tokens.css`, `Login.css` e `print.css`, nenhuma cor literal nova. As 15 literais de `shell.css` foram eliminadas ou justificadas uma a uma no PR.
5. Em 375 px e com pointer coarse, todo `input/select/textarea` calcula `font-size` ≥ 16 px.
6. Foco visível e verde em todo controle sobre superfície clara; `--on-brand-accent` sobre superfície de marca. Navegação completa por teclado sem foco perdido em: Home → Auditoria → inspeção → Plano de Ação → evidência → Administração.
7. Loader sem rotação; com `prefers-reduced-motion` não há nenhuma animação.
8. Status semânticos e faixas de resultado inalterados (comparar screenshots de uma inspeção finalizada e da fila de Planos de Ação).
9. Screenshots antes/depois no PR para: Home, overview de Auditoria, inspeção (desktop + mobile com section bar), overview e detalhe de Plano de Ação com evidências, Usuários (Admin), um dialog aberto e um estado vazio. Viewports 375, 768, 1024 e 1440.
10. Validação completa conforme §8.

## 7. Plano de commits (atômicos, nesta ordem)

1. `docs(briefs): add Design System Elo v1 brief` (este arquivo)
2. `style(tokens): adopt Elo neutrals, green-tinted elevation, focus and motion tokens`
3. `style(login): consume shared tokens without visual change`
4. `style(ui): apply Elo material to controls, buttons and surfaces`
5. `fix(ui): use 16px form text on touch to prevent iOS focus zoom`
6. `style(ui): replace spinning loader with alternating Elo loops`
7. `style(shell): apply Elo language to brand surfaces and remove literal colors`
8. `style(ui): add finite page entrance motion`
9. `style(modules): remove warm-neutral residue from Quality and Admin surfaces`
10. `docs(ui): mark QUALITY_UI_V1 neutral/elevation/focus sections superseded and sync status`

Se algum passo se mostrar desnecessário (ex.: §4.6 já coberto pelo remapeamento), registre isso no relatório em vez de criar um commit vazio.

## 8. Validação

Obrigatória, executada e com o resultado real reportado:

- `npm run typecheck`, `npm run lint`, `npm test`;
- `npm run build` com as variáveis públicas fictícias da CI (`VITE_SUPABASE_URL=http://127.0.0.1:54321`, `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci-build-placeholder`) e `npm run verify:build`;
- `npm audit --omit=dev`;
- integrações de browser (`tests/integration/*.mjs`) se houver Docker/Supabase local disponível. Se não houver, declarar como **NÃO EXECUTADO** e deixar para a CI da PR.

Screenshots: capturar com o Playwright já presente nas devDependencies, sem nova dependência. Para telas autenticadas sem stack local, capturar o que for possível e declarar o restante como pendente da homologação.

Esta mudança **não** fecha nenhum item P1–P9. A correção do zoom no iOS deve ser verificada fisicamente em P2/P4.

## 9. Compatibilidade e rollback

- Sem migration, sem mudança de contrato, sem feature flag necessária.
- Rollback: revert da PR. Os commits são separados por camada, o que permite reverter só o shell, só os componentes etc. O commit 2 (tokens) concentra a maior parte do impacto visual e é revertível isoladamente, junto com o 3.

## 10. Documentação a atualizar no fim

- `docs/briefs/QUALITY_UI_V1.md`: marcar §2 (neutros), §4 (elevação/motion) e §8 (cor de foco) como substituídos por este brief, com link.
- `docs/modules/audit/QUALITY_ACCEPTANCE_V1.md` → "Padronização visual final": acrescentar as invariantes deste brief (tokens Elo, foco verde, 16 px em toque, loader sem rotação).
- `AGENTS.md` e `README.md` → "Current phase"/"Estado atual": citar o Design System Elo v1. Não alterar contagem de testes nem IDs de CI sem execução real pós-merge.
