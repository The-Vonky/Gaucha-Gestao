# UI-00 — Tailwind CSS v4: prova isolada e decisão controlada

**Estado:** POC em branch; **não habilitada na aplicação operacional**. Integração de novos módulos condicionada a CI, inspeção visual e revisão humana. **Sem deploy.**

## Diagnóstico da `main` (21/10/2026)

- React 19 / Vite 6.4.x / Node >=22.12.0; `@tailwindcss/vite@4.3.3` declara peer `vite ^5.2.0 || ^6 || ^7 || ^8`. O Node do projeto atende ao `@tailwindcss/oxide` (>=20). Compatibilidade **declarada**, não prova de execução nesta PR.
- A entrada `apps/web/src/main.tsx` importa primeiro `tokens.css`, depois `base.css` e `app/styles.css`. Shell, Login, Admin e módulos têm folhas adicionais. `base.css` estiliza elementos diretamente (`button`, `input`, `h1`, `a`), fora de qualquer `@layer`.
- **Precedência:** regras normais fora de camadas superam regras normais em `@layer utilities` independentemente da ordem. Por isso não se deve inserir utilities no bundle operacional e presumir que `tw:p-4`, `tw:bg-...` etc. sobreporão `button`, `.card` e classes legadas. O prefixo `tw:` previne colisões de nomes, **não** resolve a cascata. Não usar `important` global como atalho; não migrar CSS Elo para `@layer` sem tarefa própria.
- `apps/web/vite.config.ts` versionado tinha apenas `react()`, sem proxy. Mantivemos a configuração versionada e adicionamos exclusivamente o plugin e um modo de build exploratório. Não presumir configuração de máquina pessoal.
- Não criar `tailwind.config.js`: esta prova usa a configuração CSS-first de v4.

## Decisão de escopo

**GO apenas para experimentação isolada. NO-GO para ativar Tailwind no `main.tsx` ou nos módulos existentes.** O Elo permanece a fonte de verdade e a implementação preferencial dos componentes atuais. Nenhuma rota, lógica, permissão, migration ou folha global foi reescrita.

Arquivos do experimento: `apps/web/tailwind-poc.html`, `apps/web/src/poc/{main.tsx,tailwind.css}`. Não importam `base.css`, `app/styles.css` ou componentes de negócio. A página usa tokens globais Elo, mas tem documento HTML próprio, sem autenticação nem backend.

O CSS importa apenas `tailwindcss/theme.css` e `tailwindcss/utilities.css`; **não importa Preflight**. A varredura é `source(none)` + `@source "./main.tsx"`; classes são literais. Prefixo v4 `tw:` (ex.: `tw:flex`, `sm:tw:grid-cols-2`). O mapeamento `@theme inline` referencia variáveis do Elo: superfícies, texto, estados semânticos, ação, tipografia, espaçamento, raios, sombra. O foco usa `--color-focus`, o alvo de toque usa `--touch-target` e os breakpoints são 600/1024/1440px.

## Execução local reproduzível

Na raiz, somente em clone isolado e sem segredos reais:

```bash
npm ci
npm run typecheck
npm run lint
npm test
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci-build-placeholder npm run build
npm run verify:build
npm run poc:build -w apps/web
npm audit --audit-level=moderate
npm run dev
```

Abrir `http://localhost:5173/tailwind-poc.html`. O build normal segue com `apps/web/dist/index.html` sem a POC; o modo `ui-poc` produz `apps/web/dist/ui-poc` e não é deployável. Em PowerShell, configurar as duas variáveis públicas com `$env:...` antes de executar o build. Os valores acima são apenas placeholders não privilegiados da CI.

## Verificação de UX e regressão obrigatória antes de promover

| Largura | POC / expectativa | Produto / baseline obrigatório |
| --- | --- | --- |
| 375px | 1 coluna, sem overflow, foco e alvo >=44px | Login, menu/drawer, Admin, ABC, Auditorias, Planos |
| 390px | 1 coluna, campo de 16px, sem zoom iOS | Mesmas telas e estados |
| 768px | 2 colunas, sem corte do formulário | Mesmas telas e navegação por teclado |
| 1440px | 3 colunas, densidade e alinhamento Elo | Mesmas telas, dialogs e estados |

Para cada largura: capturar *antes/depois* com mesma versão de browser, dados sintéticos e estados equivalentes; inspecionar `getComputedStyle` (cor, fonte, espaçamento, raio, outline), foco visível/Tab/Shift+Tab, `prefers-reduced-motion`, scroll horizontal e botões >=44px. Verificar funcionalidade além de pixel diff. O experimento não altera as rotas existentes, mas isso **não comprova** ausência de regressões.

**Medição de bundle:** arquivar bytes e gzip das saídas JS/CSS de `npm run build` antes/depois, bem como do build separado `npm run poc:build -w apps/web`. Não tratar tamanho do CSS experimental como custo do bundle normal; não atribuir delta igual a zero sem medi-lo.

## Evidências, pendências e critérios de promoção

- Inspeção estática de `main`, `tokens`, `base`, `Vite`, `package-lock` e imports: **REALIZADA** na versão-base indicada na PR.
- Checagem estrutural automatizada: `tests/ui-tailwind-isolation.test.ts`; aguarda execução em CI ou ambiente com npm.
- `npm ci`, typecheck, lint, Vitest, build, verify:build e audit: **NÃO EXECUTADOS neste ambiente** (rede npm indisponível). CI da PR deve demonstrar status e SHA.
- Screenshots 375/390/768/1440, comparação dos módulos, Playwright real com Supabase descartável, acessibilidade assistiva e medidas gzip: **NÃO EXECUTADOS**. Não homologar sem essas evidências.

**GO para adoção em módulo novo** somente se: `npm ci` reproduzível, checks verdes, regressões visuais e funcionais comprovadamente ausentes, impacto de bundle aceitável e estratégia específica de precedência de CSS aprovada para a tela nova. Se exigir `important` por toda parte, sobrescrever Elo ou afetar componentes existentes, **manter CSS Elo**. Rollback: reverter esta PR; nenhum estado persistente é modificado.

Referências: [brief Elo](../briefs/DESIGN_SYSTEM_ELO_V1.md), [regras de agentes](../../AGENTS.md), [Tailwind Preflight](https://tailwindcss.com/docs/preflight) e [plugin Vite](https://tailwindcss.com/docs/installation/using-vite).
