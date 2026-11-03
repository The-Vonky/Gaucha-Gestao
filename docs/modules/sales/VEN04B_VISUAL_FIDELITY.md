# VEN-04B — Correção de fidelidade visual (03/11/2026)


## Refinamentos de usabilidade — 03/11/2026 (rodada atual)

Continuação autorizada da VEN-04B na mesma PR #94. Baseline remoto confirmado por
GitHub e `git fetch`: `d98aaa67cb2b9d7faac61decd043c7c4dc4e74ad`, incorporado por
fast-forward. Correções da PR #97 preservadas. Os capítulos seguintes registram a
rodada visual anterior, inclusive seu audit histórico; a tabela desta seção registra
os resultados atuais. Não houve avanço de VEN-05–08.

### Cinco melhorias e contratos

1. **Legenda diária:** segmentos SVG decorativos reutilizam `.sales-line`,
   `.sales-reference` e `.sales-projection`, reproduzindo cor, espessura e traçado.
   Texto identifica observado, referência efetivamente retornada e estimativa.
   Ausência de referência/detalhamento fica explícita. Projeção exige
   `projection_is_estimate=true`, valor não nulo e ponto observado. Corte e regra de
   ajustes aparecem como contexto secundário, sem repetir a legenda abaixo do SVG.
   Dimensões (310px), escala, coordenadas, linhas e marcadores do gráfico preservados.
2. **Competência dentro do card:** usa `DashboardSelection.daily` e a mesma RPC
   `sales_dashboard(..., p_daily_month)`. Opções vêm de `data.months`, dentro da janela,
   excluindo `metadata.missing_months`; parcial/status indeterminado são rotulados.
   Uma lacuna explícita na URL indica “sem movimento”; nenhum mês disponível desabilita
   o seletor, mantendo os outros cards. Referência pode ser lacunar ou externa à janela,
   conforme a API, sem inferência de mês civil anterior.
3. **Stone/PIX:** marcadores `.sales-swatch` decorativos usam os mesmos tokens da barra
   (`--brand-green-700` / `--brand-orange-700`). Valores, percentuais e proporções
   continuam os da API; nulos/base zero mantêm a indicação de indisponibilidade.
4. **Escopo financeiro:** `fieldset`/`legend` mantidos, labels sem margem inferior
   herdada e radios visualmente ocultos sem min-height herdado. Controle e selects
   principais têm 44px, texto centralizado e estados de seleção/hover/foco.
5. **Competência inicial/final:** `CompetencySelect` usa selects nativos de mês/ano;
   doze meses em português e anos paginados em faixas de até 21, com âncoras de URL e
   disponibilidade. “Anos anteriores/posteriores” navegam pelas faixas sem aplicar
   filtros. O domínio civil 0001–9999 continua acessível, sem milhares de opções e sem
   tratar ausência de movimento como proibição. Internamente continua `YYYY-MM`,
   enviado como `YYYY-MM-01`. Aplicação e limite civil de 24 meses não mudaram.

A chave da leitura principal contém identidade/estado de acesso/grants, unidade,
modalidade, período e revisão explícita. A chave diária acrescenta `daily` e revisão
do retry do card. Um único efeito consulta a RPC: na entrada preenche ambos os estados;
quando muda apenas `daily`, conserva o payload principal e atualiza somente diário/
metadados da competência e a métrica complementar diária. Nenhum cache entre montagens.
Respostas obsoletas são descartadas no cleanup. Alterações de identidade, permissões,
perfil, período, unidade ou modalidade invalidam os dados aplicáveis antes da renderização.

Loading/erro/retry ficam no card diário para falhas de leitura. Recusa de autorização
ou sessão pela API remove também os agregados principais (negação por padrão). Os demais gráficos mantêm seus nós e o scroll
não é reposicionado. `daily` fica na URL com seleção explícita; ausência seleciona a
última competência disponível. Reload e histórico nativo preservados. A troca diária
limpa `day`; foco em um dia usa a competência da resposta diária corrente. Focar uma
competência no dashboard inteiro continua sendo uma ação diferente.

O formulário tem ciclo próprio de rascunho, sem remontagem por `daily`/`day`. Alterações
não aplicadas de mês/ano, unidade, modalidade e UUID são preservadas durante a leitura
diária. O campo avançado acompanha a seleção diária quando compatível com a janela em
edição. Mudar a janela limpa uma competência diária fora dela; `Redefinir` descarta o
rascunho inclusive se a seleção aplicada já for a padrão. URLs inválidas continuam
recusadas por `selectionError()`, sem normalização silenciosa para acesso global.

Arquivos: `SalesDashboardPage.tsx`, `DashboardCharts.tsx`, `dashboard.css`, novo
`CompetencySelect.tsx`, testes UI e os dois roteiros/fixtures visuais; documentação
canônica, diagrama de fluxo e roadmap atualizados. Inspecionados `dashboard.ts`,
`types.ts`, `api.ts`, tokens e formulários Shared; contratos e estilos globais intactos.
Referência funcional inspecionada somente em leitura na cópia de
`dashboard_vendas-Gaucha`: `dailyMonthSelect`, `renderDaily()`,
`bindFullDashboardEnhancements()`, `updateDashboardControls()`, `startMonth` e `endMonth`,
nos cinco arquivos indicados no brief, reconferidos pelo conector GitHub. Nenhuma
lógica financeira JavaScript copiada.

### Evidências atuais

| Largura | Toolbar | Mês/ano | Diário e legendas | Após trocar competência | Stone/PIX |
| --- | --- | --- | --- | --- | --- |
| 1440 | [captura](evidence/ven04b-usability/toolbar-1440.png) | [captura](evidence/ven04b-usability/month-year-1440.png) | [captura](evidence/ven04b-usability/daily-1440.png) | [captura](evidence/ven04b-usability/daily-changed-1440.png) | [captura](evidence/ven04b-usability/mix-1440.png) |
| 1024 | [captura](evidence/ven04b-usability/toolbar-1024.png) | [captura](evidence/ven04b-usability/month-year-1024.png) | [captura](evidence/ven04b-usability/daily-1024.png) | [captura](evidence/ven04b-usability/daily-changed-1024.png) | [captura](evidence/ven04b-usability/mix-1024.png) |
| 768 | [captura](evidence/ven04b-usability/toolbar-768.png) | [captura](evidence/ven04b-usability/month-year-768.png) | [captura](evidence/ven04b-usability/daily-768.png) | [captura](evidence/ven04b-usability/daily-changed-768.png) | [captura](evidence/ven04b-usability/mix-768.png) |
| 375 | [captura](evidence/ven04b-usability/toolbar-375.png) | [captura](evidence/ven04b-usability/month-year-375.png) | [captura](evidence/ven04b-usability/daily-375.png) | [captura](evidence/ven04b-usability/daily-changed-375.png) | [captura](evidence/ven04b-usability/mix-375.png) |

[Resultados executáveis](evidence/ven04b-usability/result.json),
[reflow equivalente a 200%](evidence/ven04b-usability/toolbar-zoom-200.png).
Capturas inspecionadas pelo agente, sem aceite visual humano presumido.

### Validação desta rodada

Node 22.23.4, dependências exatas da PR #97 via `npm ci --cache /tmp/ven04b-npm-cache`.
Vite existente em 127.0.0.1:5173 confirmado e reutilizado. Docker local
`gaucha-gestao-local` identificado somente em leitura; nenhum serviço/container/banco/
volume/porta adicional provisionado, nenhum cadastro ou dado persistente alterado.
As onze alterações locais preexistentes de `peer:true` no lockfile já estavam presentes
no lockfile remoto sincronizado; cópia original preservada em `/tmp` e nenhum diff de
dependências acrescentado. `supabase/snippets/` preexistente intocado e fora do commit.

| Comando/prova | Resultado atual |
| --- | --- |
| `npm run typecheck` / `npm run lint` | PASS |
| Dashboard UI/format/envelope | 84 PASS / 3 arquivos |
| `npm test -- --maxWorkers=2` | 830 PASS / 62 arquivos (116,44s) |
| `npm run build` / `npm run verify:build` | PASS; aviso preexistente de chunk >500 kB |
| `npm audit --audit-level=moderate --cache /tmp/ven04b-npm-cache` | PASS, zero vulnerabilidades |
| Chromium `sales-dashboard-visual.mjs` | PASS em 1440/1024/768/375; três SVGs de 310px, controles de 44px, cores/traçados correspondentes, diário sem remontar o restante, uma RPC por seleção, scroll, reload e histórico |
| Chromium `sales-navigation-visual.mjs` | PASS; navegação institucional, escopos, bloqueios e perfil inativo, transporte interceptado |
| Axe 4.11.0 WCAG A/AA | Zero violações automáticas nas quatro larguras; contraste SVG/offscreen tem inconclusivos. Amostras independentes ≥6,85:1 nos textos SVG e ≥9,51:1 no heatmap |
| Teclado/reflow | Selects por setas; radios por setas; reflow em 720px equivalente a 200% de 1440px sem overflow externo |
| `git diff --check` | PASS |

Reprodução do navegador (ferramentas já disponíveis em `/tmp` nesta estação):

```bash
PLAYWRIGHT_BROWSERS_PATH=/tmp/gaucha-playwright LD_LIBRARY_PATH=/tmp/ven04b-browser-libs/usr/lib/x86_64-linux-gnu VEN04B_AXE_PATH=/tmp/ven04b-axe/package/axe.min.js VEN04B_ARTIFACT_DIR=docs/modules/sales/evidence/ven04b-usability node tests/integration/sales-dashboard-visual.mjs
VEN04B_ARTIFACT_DIR=/tmp/ven04b-usability-navigation node tests/integration/sales-navigation-visual.mjs
```

Ocorrências registradas: teste antigo buscava o primeiro `.sales-reference`, agora a
amostra SVG sem `d`; corrigido para `path.sales-reference`. Primeira execução dos novos
testes tinha hook retornando inadvertidamente o mock e bloqueio HTML por `daily` fora
da janela em edição; corrigidos. Execução integral no sandbox terminou com código 143,
sem relatório; resultado integral acima corresponde à nova execução fora dessa restrição.
A simulação inicial por CSS `zoom:2` causou overflow porque manteve os breakpoints de
desktop; substituída por prova explícita de reflow a 720px, sem alegar zoom nativo.

Limites: Auth/PostgREST reais, integração em PostgreSQL persistente, zoom nativo e
leitor de tela manuais **não executados** nesta rodada. Scripts que criam/mutam fixtures
locais (`sales-dashboard-local.mjs` etc.) não foram executados. Fixtures interceptadas
não comprovam RLS em rede nem homologação; testes SQL em memória são evidência distinta.
Nenhum `APPROVED` humano ou segunda revisão presumido. Titular revisa diff/CI e aceita
ou rejeita a interface antes de decidir merge. Reversão por revert do commit desta
rodada, sem operação de banco. **Sem merge/deploy; STAGING/PROD/C30 intocados. PROD NO-GO.**

## Registro da rodada anterior de fidelidade visual

Implementação na branch `codex/ven-04b-sales-dashboard`, na [PR #94](https://github.com/The-Vonky/Gaucha-Gestao/pull/94).
Baseline inspecionada: `310d9ec24d891e188e637ce83db16d691720571c`, igual ao HEAD remoto no início.
O mantenedor solicitou a correção da apresentação existente. Não houve merge, deploy,
novas capacidades, mudança em SQL/RPC/RLS/grants/migrations ou avanço de VEN-05–08.

## Comparação e causas

Referência somente de leitura: [dashboard_vendas-Gaucha](https://github.com/The-Vonky/dashboard_vendas-Gaucha).
Foram examinados `frontend/index.html`, `styles.css`, `dashboard-full.css`,
`dashboard-enhancements.js`, `app.js`, `brand.css` e `docs/FRONTEND.md`.
Em especial: `renderKpisFull`, `renderInsights`, `renderMonthlyChart`, `renderRanking`,
`renderStackedFull`, `renderHeatmapFull`, `renderMonthlyTable`, diário e foco.
Nenhum arquivo daquele repositório foi modificado.

As divergências vinham da estrutura React inicial, e não apenas das cores:

- Dez indicadores compartilhavam a mesma grade; os insights apareciam após os gráficos.
- Filtros primários e avançados ocupavam duas linhas completas de campos.
- SVGs combinavam `width: 100%`, altura automática e `minWidth` elevado. O crescimento
  da largura também ampliava a altura, enquanto a evolução exigia scroll mesmo no desktop.
- Evolução não tinha área, grade monetária nem eixo; empilhadas não tinham escala e
  colocavam a legenda acima. Ranking usava uma barra uniforme abaixo de cada linha.
- A paleta dependia do índice da unidade; percentuais exibiam até seis casas em cards.

## Arquivos e resultado

| Arquivo | Alteração |
| --- | --- |
| `SalesDashboardPage.tsx` | Toolbar com rádios segmentados, avançados recolhíveis, quatro KPIs, Panorama antes dos gráficos, títulos de seção e seis métricas complementares. Mantidos filtros, atualização, histórico, foco e todos os dados. |
| `DashboardCharts.tsx` | Container medido com ResizeObserver, SVG de altura fixa, grade/eixo, gradiente interrompido por lacunas, média da API, marcadores, tooltips por mouse/teclado/Escape, ranking em três áreas e legenda inferior. Diário ganhou grade, escala e pontos focáveis; heatmap mantém intensidade da API e identifica a unidade pela mesma cor. |
| `dashboard.ts` | Percentual compacto via BigInt, dinheiro abreviado somente para eixos/rótulos, escala visual e coordenadas de pilhas com sinais separados, cor determinística por UUID. |
| `dashboard.css` | Estilos isolados do módulo usando tokens existentes; cores secundárias limitadas às séries. Responsividade, números extensos, truncamento acessível e movimento reduzido. |
| `tests/sales-dashboard-{ui,format}.test.*` | Sete regressões novas e adaptação das consultas ao controle segmentado/Panorama. O teste de envelope existente continua cobrindo 100 unidades × 24 meses e 6200 pontos de entrada. |
| `tests/integration/sales-dashboard-visual*.mjs` | Fixture determinística de seis competências e dois UUIDs; Chromium real, transporte interceptado, screenshots, dimensões, acessibilidade, contraste, legenda, precisão, URL/reload e nomes extensos. Baseline por `git show`/transformação em memória, sem trocar arquivos ou checkout. |

`types.ts`, `api.ts`, `SalesNavigation.tsx`, estilos globais e componentes Shared não
receberam mudanças. Nenhuma dependência de aplicação foi adicionada.

### Precisão, escopo e diferenças intencionais

Todos os indicadores, totais, médias, comparações, projeções e reconciliação continuam
vindo da VEN-03. Dinheiro exibido em cards/tabelas/tooltips é formatado diretamente da
string decimal. BigInt no gráfico acumula **somente coordenadas de desenho** e calcula
referências de eixo; não produz agregados para indicadores nem altera o payload.
Percentuais compactos arredondam apenas a apresentação. O valor exato permanece no
texto para leitores de tela, no título e nas tabelas/detalhes.

A linha e o gradiente mensal têm um segmento por sequência civil contígua; lacunas
não viram zero. Valores negativos usam escala assinada, com pilhas positivas e
negativas independentes. Zero, nulos, parcial, status indeterminado e seleção da
melhor competência completa/fechada seguem o contrato vigente.

A interface usa o shell institucional, verde primário e dourado complementar, sem
copiar a hero ou o backend legado. Escalas têm referências monetárias arredondadas
para leitura, em vez dos limites fracionários do original. Gráficos têm **310 px de
altura**, com scroll interno quando o número de competências ou a largura exigem.
Tabelas conservam todas as colunas financeiras, inclusive as ausentes no legado.

Destaque por hover/foco na legenda atenua somente as unidades do payload corrente.
Selecionar unidade/competência continua lendo a RPC; nenhuma base global anterior
é mantida para imitar o contexto do legado. A ocultação da legenda não faz RPC nem
muda indicadores. As cores podem repetir com muitas unidades; nomes, posições,
competências, valores e estados visível/oculta continuam identificando as séries.

## Evidências reais de navegador

Auth, perfil, grants e RPC foram **interceptados por fixtures**. Vite existente do
mantenedor em `127.0.0.1:5173` foi confirmado e reutilizado, sem encerrá-lo. Nenhuma
escrita no banco ou alteração de cadastro, usuário, unidade, perfil ou container.
O roteiro Auth/PostgREST `sales-dashboard-local.mjs` **não foi executado**, pois cria
cadastros/mutações persistentes e não atende à restrição desta tarefa.

O cenário principal tem abril–setembro/2026, total Stone **R$ 1.380.000,00**, média
mensal **R$ 230.000,00**, ranking **R$ 828.000,00 / R$ 552.000,00**, setembro parcial
até dia 15 e projeção **R$ 300.000,00**. Stone + PIX totaliza **R$ 1.656.000,00**.
O renderizador original recebeu dados equivalentes para comparação, sem backend,
logo remoto ou scripts de exportação/impressão. Suas fórmulas não foram portadas.
Os testes unitários também verificam lacunas, negativos, indisponibilidade e centavos.

| Largura | Antes (`310d9ec`) | Depois | Referência original |
| --- | --- | --- | --- |
| 1440 | [antes](evidence/ven04b-visual/before/dashboard-1440.png) | [depois](evidence/ven04b-visual/after/dashboard-1440.png) | [original](evidence/ven04b-visual/after/reference-1440.png) |
| 1024 | [antes](evidence/ven04b-visual/before/dashboard-1024.png) | [depois](evidence/ven04b-visual/after/dashboard-1024.png) | [original](evidence/ven04b-visual/after/reference-1024.png) |
| 768 | [antes](evidence/ven04b-visual/before/dashboard-768.png) | [depois](evidence/ven04b-visual/after/dashboard-768.png) | [original](evidence/ven04b-visual/after/reference-768.png) |
| 375 | [antes](evidence/ven04b-visual/before/dashboard-375.png) | [depois](evidence/ven04b-visual/after/dashboard-375.png) | [original](evidence/ven04b-visual/after/reference-375.png) |

Detalhes: [evolução](evidence/ven04b-visual/after/evolution-1440.png),
[empilhadas](evidence/ven04b-visual/after/stacked-1440.png),
[tooltip por teclado](evidence/ven04b-visual/after/tooltip-keyboard.png),
[números/nomes extensos 1440](evidence/ven04b-visual/after/long-values-1440.png) e
[375](evidence/ven04b-visual/after/long-values-375.png).

Capturas antes/depois/original foram inspecionadas pelo agente; não equivalem ao
aceite visual do titular. Zero overflow horizontal externo nas quatro larguras;
scroll interno preservado. O cenário extremo de tipografia altera somente o total
sintético e o nome para testar apresentação; não é oráculo agregado financeiro.

### Reprodução

Com Node 22.23.4, Chromium do Playwright disponível e o Vite local:

```bash
VEN04B_ARTIFACT_DIR=/tmp/ven04b-after node tests/integration/sales-dashboard-visual.mjs
VEN04B_BASELINE_SHA=310d9ec VEN04B_ARTIFACT_DIR=/tmp/ven04b-before node tests/integration/sales-dashboard-visual.mjs
VEN04B_ARTIFACT_DIR=/tmp/ven04b-navigation node tests/integration/sales-navigation-visual.mjs
```

Opcionalmente, `VEN04B_REFERENCE_DIR` aponta à cópia somente de leitura dos sete
arquivos de referência; `VEN04B_AXE_PATH` aponta a `axe.min.js`. Nesta execução,
Chromium, bibliotecas Linux faltantes e axe-core 4.11.0 foram baixados/extraídos em
`/tmp`, sem instalar dependências no sistema ou alterar manifests/lockfile.

## Validação e limites

Checks locais executados sobre a árvore desta correção, com baseline `310d9ec`;
o SHA de entrega e CI corrente ficam registrados na PR #94:

| Comando/prova | Resultado |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test -- --maxWorkers=2` | 812 PASS / 62 arquivos |
| Dashboard UI/format/envelope | 66 PASS / 3 arquivos |
| `npm run build` / `npm run verify:build` | PASS; aviso preexistente de chunk >500 kB |
| Chromium visual | PASS em 1440/1024/768/375; ver `after/result.json` |
| `sales-navigation-visual.mjs` | PASS: histórico, mobile, menu, atalhos, bloqueios, retry, permissões e perfil inativo, com transporte interceptado |
| axe WCAG 2 A/AA e 2.1 AA | Sem violações automáticas nas quatro larguras; resultados/inconclusivos em `after/axe-*.json` |
| Contraste | Amostras de rótulos SVG, heatmap, insights e labels KPI verificadas separadamente por luminância; `after/contrast-*.json` |
| `git diff --check` | PASS |
| `npm audit --audit-level=moderate` | **FAIL: 11 ocorrências moderadas**, cadeia de desenvolvimento ESLint/minimatch, [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). Não foi aplicado `audit fix --force`, que sugere downgrade incompatível. Nenhuma dependência alterada nesta correção. |

Axe deixa textos SVG, elementos fora da área visível de scroll e outros alvos como
inconclusivos para contraste; inspeção/sampling não é auditoria integral de
acessibilidade. Não foram provados Auth/PostgREST reais, implantação, homologação
manual, VEN-07 ou gates P1–P9/O1–O8. A suíte inclui regressões de autorização em
memória; não houve novo ensaio RLS em banco persistente nesta rodada.

O audit pendente também pode bloquear `validate` no CI. As aprovações históricas da
PR não comprovam o SHA novo. Aceite visual, avaliação do audit e decisão de merge
continuam com o mantenedor único; nenhuma segunda revisão humana foi presumida.
As alterações locais preexistentes em `package-lock.json` e `supabase/snippets/`
foram preservadas e excluídas dos commits desta tarefa.

Reversão: reverter o commit de interface/documentação desta correção, sem operação
no banco. **STAGING/PROD/C30/legado intocados; PROD NO-GO.**
