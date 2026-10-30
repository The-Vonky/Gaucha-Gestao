# VEN-04B — Evidências de validação no notebook

**Adendo MEL-01 de 30/10/2026:** unidades e históricos locais foram removidos com
autorização específica; o catálogo terminou vazio. Roteiros agora retiram suas próprias
unidades após backup/dry-run. [Estado vigente e evidências](VEN04B_MEL01_LOCAL_CLEANUP.md).

**Adendo de 29/10/2026 — correção obrigatória da PR #94:** os resíduos e a
composição de permissões descritos neste registro são a fotografia da rodada original.
A limpeza física local autorizada removeu 58 papéis sintéticos e suas relações,
preservando auditoria/identidades/histórico; a migration institucional concedeu Vendas
ao administrador e criou Sales Manager/Operator. Os roteiros atuais fazem teardown
dirigido após dry-run, inclusive em falhas. [Estado vigente e evidências](VEN04B_ACCESS_CORRECTION.md).

**Data:** 29/10/2026, `America/Sao_Paulo`. **Código validado:**
`62ef60aa632215d6acd5dcfde093449115e7f381` (commit funcional; documentação de resultados
registrada depois, sem alteração funcional). Baseline `origin/main`
`7ddcd3155da91561ba94f088ff277ee4fc659f90`, conferida com `git fetch origin main`.
Branch `codex/ven-04b-sales-dashboard`. Autorização expressa do mantenedor para
VEN-04B, branch/PR e ensaios sintéticos locais. Revisão/aceite/merge continuam humanos.

## Preservação e destino

Checkout inicial na branch VEN-04A; preservados `package-lock.json` (11 flags `peer`
preexistentes) e `supabase/snippets/`, sem incluí-los na PR. Nenhum worktree, banco,
container, volume, porta de infraestrutura ou projeto Supabase novo.

Docker inspecionado antes de escrita: projeto **gaucha-gestao-local**, PostgreSQL
em `127.0.0.1:54322`, Auth/PostgREST por `http://127.0.0.1:54321`; Studio local 54323,
gateway, storage e metadados existentes. Helper de ensaio verifica nome/imagem do
container, binding local e existência da assinatura `sales_dashboard`.
CLI existente informa o destino local; saída com credenciais é consumida em memória,
não impressa. Chromium e bibliotecas reutilizados de `/tmp/ven04a-*`.

| Estado | Inicial | Final |
| --- | ---: | ---: |
| Migrations aplicadas | 27 | 27 |
| Unidades Core | 26 | 26 |
| Perfis Core / identidades Auth | 54 | 54 |
| Lançamentos sales (inclui soft-deleted) | 87 | 116 |
| Lançamentos ativos | 0 | 0 |
| Papéis VEN04B ativos | 0 | 0 |
| Perfis/unidades reutilizados ativos | 0 | 0 |

Nenhuma migration aplicada/alterada; nenhum reset, seed geral, db push, conexão
remota, operação em funcionário real ou alteração no legado. STAGING/PROD intocados.

## Checks executados

Node 22.23.4 do notebook. Todos os comandos abaixo foram efetivamente executados;
suítes PostgreSQL locais usam transações revertidas, sem recriar schema/infraestrutura.

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test -- --maxWorkers=2` | **760 PASS / 59 arquivos**, 101,21 s na rodada final; baseline 701 + 59 novos testes |
| Novos `sales-dashboard-{format,ui,envelope}.test.*` | **59 casos**; filtros/valores/efeitos reais em componentes, sem apenas snapshot de renderização |
| `VEN04A_LOCAL_TEST=gaucha-gestao-local npm test -- tests/sales-operations-database.test.ts tests/sales-units-database.test.ts --maxWorkers=1` | **17 PASS**, PostgreSQL real; rollback |
| `VEN03_LOCAL_TEST=gaucha-gestao-local npm test -- tests/sales-analytics-database.test.ts --maxWorkers=1` | **14 PASS**, PostgreSQL real; rollback |
| `node tests/integration/sales-dashboard-local.mjs` com opt-in abaixo | **PASS**, Auth/PostgREST/Chromium reais, manifesto sintético |
| `npm run build` / `npm run verify:build` | PASS; aviso de tamanho preexistente; verificação sem chaves privilegiadas |
| `npm audit --audit-level=moderate` | PASS, **0 vulnerabilidades**, após repetir consulta com acesso à rede |
| `git diff --check` | PASS |

A suíte completa inclui regressões VEN-01/02/03/04A, Core, navegação, ABC, Salas,
Auditoria e Planos. Shared não foi alterado nesta PR. Integrações hospedadas e seus
status devem ser conferidos no **SHA final da PR**; o registro final fica na PR.
CI verde não é homologação VEN-07, P1–P9/O1–O8 nem autorização de deploy.

## Auth/PostgREST, oráculo e navegador

Reutilizados **sete usuários/perfis**, duas unidades financeiras e um setor
sintéticos de `VEN04A-8b441b99` (a terceira unidade foi somente referenciada, permaneceu
inativa). Sem novas identidades/unidades/setores. Senhas temporárias foram renovadas
somente nessas contas sintéticas, não persistidas/impressas. Novos sete papéis VEN04B,
inativos ao final; atribuições sintéticas revogadas. Credencial administrativa local
somente no preparador Node; Vite/browser usam chave pública e login sintético.

Fixtures imutáveis reutilizáveis: julho 2042 fechado, setembro 2042 parcial até dia 2;
ajuste Stone 50 da unidade A em setembro. Dias sintéticos Stone 100 + 150, PIX 20 + 30.
Julho anterior disponível 200; agosto lacunar após soft-delete do ensaio de interferência.
Unidade B tem movimento 300 e fica inativa para validar histórico.

| Resultado de setembro/A | Stone | Stone + PIX |
| --- | ---: | ---: |
| Total financeiro mensal com ajuste | R$ 300,00 | R$ 350,00 |
| Acumulado diário observado | R$ 250,00 | R$ 300,00 |
| Projeção linear, estimativa | R$ 3.750,00 | R$ 4.500,00 |
| Ajuste sem data diária | R$ 50,00 | R$ 50,00 |
| Diferença aritmética interna | R$ 0,00 | R$ 0,00 |

Valores confrontados na RPC e no painel: durante a janela jul–set o total do período/A
é 500/550 (inclui julho 200); ao focar setembro/A é 300/350. As projeções da competência
diária continuam 3750/4500. O acumulado observado da interface não recebe ajuste.
O caso adicional de insights confirma maior avanço negativo (−12,5%), recuo
(−20,123456%), concentração 99,123456% e comparação projetada 1775%, sem
reclassificar o avanço como alta nem arredondar os valores retornados.
Centavos, soma acima de `MAX_SAFE_INTEGER` e diferença assinada são verificados nos
componentes/formatação; o SQL mantém o oráculo independente de BigInt da VEN-03.

**Permissões reais:** dashboard global sem entry.read nega list/detail e `/sales`;
somente operações, somente criação, nenhum papel e setor negam `/sales/dashboard`;
dois leitores unitários não veem nomes/valores da outra unidade em HTML, ranking,
matriz ou contexto; UUID externo é recusado. Payload completo de A é idêntico antes e
depois de novo movimento em B. Revogação e perfil inativo negam RPC com JWT ainda válido;
a UI revogada elimina o painel. Logout/troca de conta refaz acesso e resultado.

**Interações reais:** Stone/combined; todas/unidade/inativa; série visual oculta sem
RPC/alterar KPI; célula por Enter, seleção diária agregada, histórico Voltar/Avançar,
URL/reload, comparar tudo/reset, corte/lacuna/fechado/parcial, falha de transporte e
recuperação, resposta financeira real artificialmente atrasada sem sobrescrever a
nova. Usuário com ambas as áreas navega para a operação, cria 0,01 na UI, retorna ao
dashboard atualizado; edição para 0,02 e soft-delete via RPC aparecem após Atualizar.
Os testes de componentes complementam com Espaço no heatmap, competência por teclado,
datas inválidas, base zero, limite100, histórico indeterminado e troca de identidade
com requisição pendente. Não foi usada API operacional como caminho alternativo de drill-down.

## Visual, acessibilidade e envelope

Viewports **375, 768, 1024, 1440 px**, Chromium, `reducedMotion=reduce`. Página sem overflow
horizontal; gráficos/tabelas possuem regiões de rolagem próprias com foco. Heatmap,
ranking, marca mensal, controles e tabela diária têm operação por teclado; texto/valores
identificam os dados sem depender de cor/hover. `figure`/`figcaption`, legendas,
estados acessíveis e alternativa tabular do diário/resumo/matriz presentes.

Screenshots sintéticos locais:
`/tmp/ven04b-ui/VEN04B-8b441b99-{375,768,1024,1440}.png`.
Inspeção visual feita em 375 e 1440; as quatro larguras têm asserção de overflow/foco.
Capturas full-page podem registrar a barra fixa na posição de scroll do foco;
não são teste de impressão. Artefatos em `/tmp` são efêmeros e não foram versionados.

axe-core 4.10.3 executado na área `.sales-dashboard` com WCAG 2A/AA e 2.1AA:
**0 violações, 27 regras aprovadas**, duas verificações inconclusivas
(`aria-prohibited-attr`, `color-contrast`). SVG/estado de foco e contraste continuam
exigindo revisão manual, especialmente com tecnologia assistiva real. Não houve
leitor de tela, dispositivo físico/touch nem aceite humano. Não alegar conformidade
WCAG integral a partir desse resultado.

Envelope sintético completo em SSR: **100 unidades × 24 competências = 2.400 células**,
**6.200 pontos diários de entrada**, 62 linhas diárias consolidadas. Asserções comprovam
ausência de truncamento da matriz e 2.400 segmentos; diário usa totais SQL, evitando
um nó por ponto unitário. Mapas da matriz são memorizados, gráficos usam `memo`,
ranking/legenda têm rolagem própria. Esse ensaio não mede latência SQL de produção,
memória de celular físico nem frame time do envelope máximo no Chromium.

Build anterior VEN-04A registrado: principal **863,78 kB**. Build VEN-04B:
principal **867,37 kB** (255,88 kB gzip, aumento aproximado 3,59 kB/0,42%);
rota lazy **29,38 kB JS / 9,26 kB gzip** e **5,40 kB CSS / 1,55 kB gzip**;
chunk auxiliar 60,65 kB. Aviso >500 kB permanece no principal; nenhuma dependência nova.

## Tentativas, resíduos e reprodução

Falhas não foram mascaradas com aumento de timeout ou remoção de cenário:

- Git/socket Docker/rede requereram escalada do sandbox. Audit inicial falhou por DNS;
  repetido com rede e terminou sem vulnerabilidades.
- Três casos da primeira rodada de UI falharam por label diário e parametrização de
  array vazio; corrigidos. Rodadas focada e completa finais passaram.
- Primeiro ensaio local encontrou maiúscula em chave de papel (`unitA`) rejeitada pelo
  Core; normalizada para minúsculas. Nenhuma regra de autorização alterada.
- Duas tentativas de navegador: label unitário contendo opções e asserção monetária
  ambígua (valor existe em texto, SVG e tabela); nomes acessíveis e seletores corrigidos.
- Ensaio de reordenação teve callback de transporte encerrado antes de `fulfill`;
  sincronização corrigida. Interrupção exigiu finalização dirigida às fixtures conhecidas:
  seis lançamentos via soft-delete RPC, cadastros/papéis sintéticos inativados. Sem
  exclusão física/remoção de auditoria. Rodada completa posterior PASS.
- Git não tinha autoria configurada; commits usam autoria explícita Codex somente por
  comando, sem alterar configuração global.

As tentativas financeiras acrescentaram **29 lançamentos**, todos soft-deleted,
sem novos cadastros de usuário/unidade/setor. Reaproveitados os mesmos sete papéis
entre tentativas. Permanecem **dois snapshots** `ven04b_synthetic` (jul/set 2042),
**um ajuste imutável Stone 50** (set 2042/A), vínculos e auditoria. Esses resíduos podem
aparecer em consultas globais futuras à janela 2042, mesmo com unidades inativas;
isso é dado sintético conhecido, não histórico importado. Nenhuma tentativa de purga.
Manifesto final sem credenciais: `/tmp/ven04b-ui/VEN04B-8b441b99-manifest.json`.
Contagens finais conferidas novamente por SQL após os testes PostgreSQL revertidos.

```bash
export PATH=/home/bernardodev/.nvm/versions/node/v22.23.4/bin:$PATH
npm run typecheck
npm run lint
npm test -- --maxWorkers=2
VEN04A_LOCAL_TEST=gaucha-gestao-local npm test -- \
  tests/sales-operations-database.test.ts tests/sales-units-database.test.ts --maxWorkers=1
VEN03_LOCAL_TEST=gaucha-gestao-local npm test -- tests/sales-analytics-database.test.ts --maxWorkers=1
VEN04B_LOCAL_TEST=gaucha-gestao-local \
VEN04B_REUSE_TAG=VEN04A-8b441b99 \
VEN04B_SUPABASE_CLI=/home/bernardodev/.npm/_npx/6f1b058a4d9555af/node_modules/.bin/supabase \
VEN04B_AXE_PATH=/tmp/ven04b-axe.min.js \
PLAYWRIGHT_BROWSERS_PATH=/tmp/ven04a-browsers \
LD_LIBRARY_PATH=/tmp/ven04a-browser-libs/root/usr/lib/x86_64-linux-gnu \
node tests/integration/sales-dashboard-local.mjs
npm run build
npm run verify:build
npm audit --audit-level=moderate
```

Roteiro local exige as fixtures identificadas e inativas e altera somente seu escopo.
Cada nova execução cria novos lançamentos de teste/auditoria, embora reutilize os
cadastros/ajuste/snapshots; não repetir sem necessidade. Axe/navegador/libs em `/tmp`
precisam existir. Não usar o roteiro em STAGING/PROD ou conta real.

Leitura do legado foi somente estática: serviço/rota dashboard, `index.html` e scripts
carregados `app.js`, `dashboard-enhancements.js`, `focus-tools.js`. VEN-00 prevalece.
Diferenças deliberadas: precisão decimal, autorização Core, referências autorizadas,
status histórico unitário indisponível, sem fallback de melhor mês para parcial;
`best_closed` e confirmação exibida estão explicados no [contrato UI](VEN04B_DASHBOARD_UI.md).

**Pendências:** revisão/aceite/merge do mantenedor único; sem segunda revisão
independente presumida. VEN-05–08 não executadas; sem homologação gerencial global,
importação real, conciliação bancária independente, deploy ou recuperação produtiva.
**PROD NO-GO.**
