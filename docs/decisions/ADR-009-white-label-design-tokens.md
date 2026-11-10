# ADR-009 — Arquitetura white-label: modelo de tokens e branding por organização

**Status: Proposto** (não aceito; não autoriza implementação em produção)
**Data: 10/11/2026**
**Relacionado:** [ADR-002](ADR-002-core-and-module-ownership.md) (propriedade do Core), [ADR-004](ADR-004-platform-stack.md) (stack), [Design System Elo v1](../briefs/DESIGN_SYSTEM_ELO_V1.md), [guia de tokens white-label v1](../ui/DESIGN_SYSTEM_WHITELABEL_V1.md), [UI-00 Tailwind](../development/TAILWIND_V4_UI00.md).

> **Numeração:** o pedido original chamou esta proposta de "ADR-003". O número ADR-003 já pertence a uma decisão **aceita** ([Planos de Ação como módulo transversal](ADR-003-action-plans-transversal-module.md)) e não pode ser sobrescrito; ADR-007 permanece reservado à proposta de Identity Boundary ([Issue #49](https://github.com/The-Vonky/Gaucha-Gestao/issues/49)). Esta proposta recebe o próximo número livre, **ADR-009**.

## Contexto

O pedido "Hub — Design System White-label v1.0" orienta a evolução da interface para uma plataforma SaaS que possa exibir a identidade de diferentes organizações, com modos claro, escuro e automático, direção visual *Enterprise Modern* e acessibilidade verificável.

Estado verificado na `main` em `a0d479e`:

- A interface usa o **Design System Elo v1**: tokens em `apps/web/src/shared/styles/tokens.css`, componentes em `shared/styles/base.css` e `shared/ui.tsx`. A identidade é fixa (Gaúcha Alimentação: verde/laranja, "elos", Bahnschrift). **Não existe modo escuro.**
- Os componentes base já consomem majoritariamente tokens semânticos (`--color-*`, `--success*` etc.); havia 13 leituras diretas de primitivos (`--neutral-N`, `--brand-green-N`).
- **Não existe modelo multi-tenant no banco.** O Core modela **uma** organização com unidades (`core.units`), setores, papéis e grants ([ADR-005](ADR-005-core-authorization.md)). Não há tabela de organização/tenant nem isolamento por tenant em RLS. Qualquer "persistência por tenant" é, portanto, decisão futura que depende de um modelo de tenant ainda inexistente.
- Tailwind v4 existe apenas como POC isolada (UI-00), com NO-GO para o bundle operacional.

## Decisão proposta

### 1. Três camadas de tokens

| Camada | Prefixo | Quem define | Pode ser usada por componentes? |
| --- | --- | --- | --- |
| **Primitivos** | `--hub-*` (cinzas, status, fonte) | Plataforma, em `shared/theme/theme.css` | Não. Só a camada semântica referencia. |
| **Marca** | `--brand-primary-{50…950}`, `--brand-accent-{50…950}` | Organização (dados validados) | Não diretamente. |
| **Semânticos** | `--color-*`, `--success*`, `--warning*`, `--danger*`, `--info*`, `--neutral*`, `--on-brand*`, `--shadow-*`, `--focus-ring*`, `--text-*` | Plataforma, por modo (`[data-theme="light"|"dark"]`) | **Sim, exclusivamente.** |

Os semânticos usam **os mesmos nomes** que os componentes Elo já consomem. Assim, os componentes existentes passam a ser temáveis sem reescrita: o mesmo `<Badge>`, `<Notice>`, `<Metric>`, `<Table>`, `<Modal>` e `button.primary` funcionam no tema Elo e no tema white-label.

Regras:

- **Status nunca vem da marca.** Sucesso/atenção/erro/informação usam primitivos próprios e sempre texto/ícone além da cor (regra já vigente no Elo).
- Propriedades customizadas são resolvidas onde são declaradas; por isso o escopo do tema redeclara **todos** os semânticos compostos (`--focus-ring`, `--text-*`, sombras), não apenas as folhas.
- No modo escuro, a ação primária é um preenchimento claro da marca (`primary-400`) com texto profundo (`primary-950`), evitando blocos saturados brilhantes.

### 2. Separação entre tema do sistema e branding

`shared/theme/ThemeProvider.tsx` expõe dois contextos independentes:

- **Modo de cor** (`ColorModeProvider`): preferência da **pessoa no dispositivo** — `light`, `dark` ou `system` (segue `prefers-color-scheme` e reage à mudança). Persistida em `localStorage` com tolerância a armazenamento bloqueado. Não é dado da organização.
- **Marca** (`BrandProvider`): identidade da **organização**. Recebe dados, valida com `sanitizeBrand` e, se inválidos, usa a marca padrão.

`ThemeRoot` aplica ambos a um elemento (`data-theme`, `data-brand` e as variáveis `--brand-*` inline). Diálogos nativos dentro dele herdam o tema.

### 3. A marca é dado, nunca CSS

`BrandConfig` contém somente: `id` (slug), `name`, `shortName`, `monogram` (1–3 letras/dígitos), `fictitious` e duas escalas de 11 tons hexadecimais (`primary`, `accent`). `sanitizeBrand` recria o objeto apenas com essas chaves, exige `#rrggbb` e recusa marcação/CSS. `brandStyle` é a **única** ponte para o CSS, com nomes de propriedade fixos no código.

**Fora deste incremento (proibido sem nova decisão):** upload de logotipo, domínio personalizado, CSS arbitrário, fontes externas e alterações de banco.

### 4. Gate de acessibilidade por marca

Toda marca precisa atender WCAG 2.x AA em ambos os modos para a lista `CONTRAST_PAIRS` (texto 4,5:1; foco, bordas de controle e componentes 3:1). O gate é verificado:

- estaticamente, em `tests/design-system-tokens.test.ts` (resolve o CSS real para cada marca × modo);
- no navegador, em `tests/integration/design-system-browser.mjs` e no painel ao vivo da galeria.

Uma futura tela de cadastro de marca deve **recusar** escalas que reprovem o gate, em vez de "corrigir" cores automaticamente.

### 5. Persistência futura por tenant (TO-BE, não implementado)

Pré-requisito: decisão própria sobre **modelo de tenant** (o Core atual é de organização única). Quando existir, propõe-se:

- tabela do Core (ex.: `core.organization_branding`) com `organization_id`, `config jsonb` no formato `BrandConfig`, `version`, `updated_by`, `updated_at`; uma linha ativa por organização;
- `CHECK`/validação em RPC equivalente a `sanitizeBrand` e ao gate de contraste; escrita somente por RPC com permissão administrativa dedicada (ex.: `core.branding.manage`), trilha de auditoria e concorrência otimista ([ADR-005](ADR-005-core-authorization.md));
- leitura pública **somente** dos campos de apresentação, antes do login quando a organização for identificável (necessário para a tela de login), sem expor dados internos;
- cache no cliente por `version`; marca padrão como fallback em qualquer erro.

Pertence ao **Core** (identidade da organização é conceito transversal e estável, ADR-002), nunca a um módulo de negócio.

## Alternativas consideradas

| Alternativa | Motivo da rejeição neste incremento |
| --- | --- |
| Adotar biblioteca de UI (MUI, Chakra, Radix Themes, shadcn/ui) | Reescreveria `shared/ui.tsx`, `base.css` e todas as telas; traria segundo sistema de estilos e dependências novas. Os componentes atuais já são acessíveis (dialog nativo, rótulos, alvos de toque) e se tornam temáveis só com tokens. Custo de migração alto sem ganho funcional comprovado. |
| Ativar Tailwind v4 globalmente | NO-GO vigente (UI-00): conflito de cascata com `base.css` fora de `@layer`. Tokens semânticos funcionam com ou sem Tailwind. |
| Gerar paletas automaticamente a partir de uma cor (OKLCH) | Reduz o cadastro a uma cor, mas torna o contraste emergente e difícil de auditar. Mantidas escalas explícitas; um gerador pode vir depois, sempre submetido ao gate. |
| CSS por tenant (folha enviada pela organização) | Superfície de injeção e de regressão visual sem controle. Rejeitado. |
| Tema aplicado ao `:root` de imediato | Alteraria todas as telas atuais neste incremento. A galeria aplica o tema a um escopo; a promoção ao `:root`/`<html>` é etapa futura. |

## Consequências

- Componentes Elo continuam idênticos visualmente (novos papéis semânticos com os mesmos valores; garantido por teste).
- A aplicação de produção **não muda** neste incremento: a galeria é uma entrada Vite separada (`/design-system/`), fora do bundle principal.
- Para aplicar em produção (login, dashboard, solicitações, administração) será preciso: decidir a identidade padrão (Gaúcha/Elo como marca da organização vs. Hub neutro), revisar CSS de `app/shell.css`, `app/styles.css`, `core/auth/Login.css` e módulos que leem primitivos diretamente, validar modo escuro tela a tela com capturas e só então mover `ThemeRoot` para a raiz.
- Novas marcas exigem 22 valores hexadecimais e aprovação no gate de contraste.

## Pendências para aceite

1. Decisão do responsável sobre o modelo de tenant (incluindo se haverá mais de uma organização por instalação).
2. Decisão sobre a identidade padrão e a manutenção da tipografia Bahnschrift/Elo.
3. Plano de migração por tela com evidência visual (claro/escuro, 320–1440 px).
4. Homologação manual com leitor de tela e dispositivos reais (**não executada** neste incremento).
