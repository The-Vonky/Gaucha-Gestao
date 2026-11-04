# GG-10 — Validação local em 04/11/2026

Baseline: `422a51fe91843824013ad337122f6954c954e59c` (`origin/main`).
Implementação inicial testada: `48ac0aac9816ccdeec35fe6d8c34a83c07fc75c1`.
Revisão final de CSS e prova browser: `6a0e35c06e160c2d1789f3cbe3715a8ac9b9d11c`.
Branch: `codex/gg-10-institutional-announcements`.
O commit posterior de evidências altera somente documentação. A revisão final
acrescenta ao índice desktop de Auditoria o deslocamento e a redução de altura
que já eram aplicados ao shell; não altera TypeScript ou testes de banco.

Ambiente: notebook Linux/WSL, Node v22.23.4 via NVM, dependências já existentes.
Vite em `127.0.0.1:5173` confirmado e reutilizado, sem interromper o processo do
mantenedor. Chromium já instalado; bibliotecas locais existentes em
`/tmp/ven05a-browser-libs/root/usr/lib/x86_64-linux-gnu`. `docker ps` sem permissão
no socket; nenhuma tentativa de modificar Docker/Supabase. Testes de banco em
PGlite na memória, com variáveis de integração persistente removidas explicitamente.

## Comandos e resultados

| Comando | Resultado real |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test -- tests/announcements.test.tsx tests/app.test.tsx tests/login.test.tsx tests/sales-navigation-ui.test.tsx` | PASS, 4 arquivos / 61 testes na árvore da implementação |
| `npm test` | 69 arquivos PASS; 1 falha por timeout no teste preexistente de reabertura em `tests/audit-database.test.ts:290` (998 PASS / 1 timeout de 10000ms) |
| `npm test -- tests/audit-database.test.ts` | PASS, 14 testes / 26,07s; sem mudança no arquivo ou no timeout |
| `npm test -- --maxWorkers=2` | PASS final em `6a0e35c`, 70 arquivos / 999 testes, 142,53s; execução inicial também passou em 118,54s |
| `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci-build-placeholder npm run build` | PASS; aviso Vite de chunk >500 kB mantido como limitação |
| `npm run verify:build` | PASS: aplicação no bundle e ausência dos padrões de chaves privilegiadas |
| `cmp apps/web/public/announcements.json apps/web/dist/announcements.json` | PASS: cópia pública idêntica no build |
| `npm --cache /tmp/gg10-npm-cache audit --audit-level=moderate` | PASS, 0 vulnerabilidades; nenhum pacote instalado/alterado |
| `node tests/integration/announcements-browser.mjs` | PASS no Chromium, transporte Auth/REST interceptado, 0 pageerrors |
| `git diff --check` e revisão de caminhos/diff | PASS; nenhum arquivo Core/migration/infra ou módulo de Auditoria alterado |

Prefixo local dos comandos Node/npm:
`PATH=/home/bernardodev/.nvm/versions/node/v22.23.4/bin:$PATH`.
Na prova Chromium também foi usado
`LD_LIBRARY_PATH=/tmp/ven05a-browser-libs/root/usr/lib/x86_64-linux-gnu`.
A permissão ampliada foi usada somente para Git, consulta de auditoria npm e
browser/loopback local, sem ação operacional persistente.

A suíte completa remove explicitamente as variáveis abaixo, usando `env -u`,
para não acionar banco persistente:

```text
AUDIT_TEST_DATABASE_URL ABC_TEST_DATABASE_URL ACTION_PLANS_TEST_DATABASE_URL
SALES_CI_DATABASE_URL VEN04B_LOCAL_TEST VEN04A_LOCAL_TEST VEN03_LOCAL_TEST
```

O primeiro timeout foi investigado por execução isolada e redução da concorrência
para dois workers. Não houve alteração em teste/migration de Auditoria ou aumento
do limite para forçar aprovação. O primeiro ensaio browser também revelou esperas
insuficientes na fixture após resize: a prova final aguarda tanto topo quanto base
da sidebar e posição do cabeçalho. Corrigidos somente os stubs sintéticos e o
momento de instalação do relógio virtual do Playwright, antes de criar timers.

## Cobertura GG-10

- Ativação global/individual, lista vazia, JSON/modelo ausente/inválido e resposta
  excessiva. Rejeita datas sem timezone/impossíveis, ID duplicado, categoria
  desconhecida e ações de link. HTML/script é apresentado como texto inerte.
- Início inclusivo, fim exclusivo, início futuro, expiração, timers de fronteira,
  categorias/prioridade/id determinísticos e configurações em ordem invertida.
- Polling, retorno ao foco/visibilidade, aba oculta, agrupamento de eventos,
  rede/404, timeout/abort, recuperação, conteúdo idêntico, cleanup e StrictMode.
- Botão GG-11 desabilitado e explicado; JSON sozinho não o ativa; teste isolado
  demonstra o callback de integração, sem formulário/backend.
- Chromium: login pela UI real com resposta sintética; nenhum aviso ou fetch de
  configuração antes da sessão. Navegação SPA entre Auditoria/Planos mantém
  mesma barra, sem nova requisição por rota. Logout remove barra, timers e variável
  global de scroll. Nenhuma credencial privilegiada ou linha de banco real utilizada.
- 1440/1024/768/375/320 px, mensagem de 1380 caracteres, rolagem da página,
  altura/sidebar/topbar medidas, ação alcançável na rolagem interna e ausência de
  overflow externo. Modal Shared de Nova auditoria e drawer real na top layer,
  Enter/Escape e foco; seletores CSS sticky de Auditoria ensaiados com nós sintéticos: barra mobile
  e índice desktop com 40 controles, posição e altura útil verificadas.
- Reflow equivalente a 200% em 640×450 e texto 200%; foco sintético abaixo dos
  elementos sticky. Desativação deixa slot com altura zero e cabeçalho em `top: 0`.

| Categoria | Contraste de texto e botão calculado no Chromium |
| --- | --- |
| testing | 12,70:1 |
| maintenance | 4,96:1 |
| information | 4,97:1 |
| critical | 9,25:1 |

Todos superam 4,5:1. A região usa `role="status"`, `aria-live="polite"` e
`aria-atomic="true"`; configuração idêntica conserva o nó e não repete mutações
de texto. Não houve teste com leitor de tela real.

## CI remoto

No HEAD anterior `fd29d237ceff9453f71770fe994e7f9f361afed2`, os dois workflows
concluíram PASS: [Validate foundation, run 41898443516](https://github.com/The-Vonky/Gaucha-Gestao/actions/runs/41898443516)
e [infra-validate, run 41898443311](https://github.com/The-Vonky/Gaucha-Gestao/actions/runs/41898443311).
Incluem `validate`, `action-plans-integration` e quatro integrações de Vendas.
A revisão final de CSS exige novo CI no HEAD da PR; a descrição da PR registra
esse resultado, sem promover automaticamente a prova anterior ao novo SHA.
Integrações do CI são sintéticas em runners descartáveis e não tocam o Supabase
persistente do mantenedor.

## Artefatos e limites

Artefatos sintéticos locais não versionados: `tmp/gg10/results.json`,
`testing-375.png`, `testing-1440.png`, `long-{320,375,768,1024,1440}.png`,
`zoom-text-200.png` e categorias `maintenance/information/critical-1440.png`.
Screenshots desktop e celular foram inspecionados pelo agente. São fixtures da
UI; não constituem homologação com dados reais ou prova de RLS/Auth no servidor.

Não executados localmente: integração real Auth/PostgreSQL/Storage, Android/iOS físico,
zoom nativo do navegador, leitor de tela, atualização do JSON na hospedagem real,
cache/CDN real e acesso operacional ao Docker. Não houve migration, reset,
provisionamento, implantação ou alteração em C30/STAGING/PROD. A cópia do JSON no
build e o refresh do cliente foram provados; substituição independente de arquivo
no hosting continua dependente de processo e autorização operacional.

Sem segunda revisão humana; mantenedor único deve revisar o diff/CI e decidir
merge. A PR #101 e `supabase/snippets/` não rastreado foram preservados. Nenhum
aceite P1–P9/O1–O8 registrado. **PROD NO-GO.**
