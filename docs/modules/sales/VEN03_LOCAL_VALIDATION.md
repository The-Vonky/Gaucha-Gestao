# VEN-03 — Evidências de validação no notebook

**Data:** 28/10/2026 (America/Sao_Paulo). **Autorização:** pedido expresso VEN-03 e
complemento do titular sobre indisponibilidade histórica para leitores por unidade.
**Baseline:** `72ae883ba279069d961b40054d68012d34ed3f8c` (PR #91).
**Branch:** `codex/ven-03-sales-analytics`. **Código validado:**
`1b2cdc5faf417949210885254098a0df382726e1`.
**PR:** [#92](https://github.com/The-Vonky/Gaucha-Gestao/pull/92).
Este registro posterior altera somente documentação; o SHA de código acima permanece
a referência dos testes, e o HEAD final é registrado na PR/relatório de entrega.
Nenhum merge, deploy, migração real, STAGING ou PROD.

## Destino e intervenção incremental

Conferidos `git status`, commits, branch, `docker ps`, migrations e dependências.
Preservados fora da entrega: alteração preexistente em `package-lock.json` e
`supabase/snippets/`. Sem worktree, container, porta, banco ou volume novo.

- Container existente `supabase_db_gaucha-gestao-local`; imagem Supabase PostgreSQL
  `17.6.1.167`; PostgreSQL 17.6, banco `postgres`. Binding **127.0.0.1:54322**.
- Kong **127.0.0.1:54321**, Auth e PostgREST ativos. Sem descoberta de projeto remoto.
- Antes: **23 migrations**, 1 unidade, 2 perfis, 3 atribuições; schema sales ausente.
- Preservação: cópia **somente de schema**, privada em `/tmp/ven03-local-before-schema.sql`,
  de Core/private/histórico. Sem dump de linhas reais, sem arquivo versionado.
- VEN-01 `20261028101700`, VEN-02 `20261028140147` e VEN-03 `20261028163941`
  aplicadas uma vez, em sequência. Cada arquivo e inserção em
  `supabase_migrations.schema_migrations` executados na **mesma transação**, com
  `psql -X -v ON_ERROR_STOP=1`. Histórico guarda o texto original em `statements`.
- Depois: **26 migrations**. Conferidas dependências e ausência prévia de sales;
  nenhuma migration anterior editada ou reaplicada. VEN-03 testada em PGlite antes
  da aplicação; arquivo permaneceu intacto depois de aplicado.
- Nenhum papel real recebeu capacidades sales; não houve reset, db push, seed
  destrutivo, linked, down, remoção de volumes, restart ou acesso ao servidor.

Comandos de inspeção e aplicação efetivamente usados (SQL temporário contém apenas
a migration versionada e o registro transacional de histórico):

```bash
git status --short --branch
git fetch origin main
git switch -c codex/ven-03-sales-analytics origin/main
docker ps --format '{{.Names}} {{.Image}} {{.Ports}}'
docker exec supabase_db_gaucha-gestao-local psql -U postgres -d postgres -X \
  -c "select version,name from supabase_migrations.schema_migrations order by version"
docker exec -i supabase_db_gaucha-gestao-local psql -U postgres -d postgres -X \
  -v ON_ERROR_STOP=1 < /tmp/ven03-apply-20261028101700.sql
docker exec -i supabase_db_gaucha-gestao-local psql -U postgres -d postgres -X \
  -v ON_ERROR_STOP=1 < /tmp/ven03-apply-20261028140147.sql
docker exec -i supabase_db_gaucha-gestao-local psql -U postgres -d postgres -X \
  -v ON_ERROR_STOP=1 < /tmp/ven03-apply-analytics.sql
```

Os arquivos temporários de aplicação **não** são mecanismo de reexecução: verificar
histórico antes de qualquer intervenção futura. Usou-se o CLI Supabase já instalado
**2.117.0**, sem instalar/atualizar runtime; `migration new sales_analytics` gerou
`20261028163941_sales_analytics.sql`. Changelog/documentação oficial consultados;
sem troca de gateway ou atualização de PostgreSQL nesta tarefa.

## Oráculo independente e testes reais

Fixture `tests/fixtures/sales-analytics.sql`: setembro/2026 explicitamente parcial
até dia 2. Teste independente usa **BigInt de centavos**, não a saída SQL como esperado.

| Resultado | Stone | Stone + PIX |
| --- | ---: | ---: |
| Mensal com ajuste | 300.00 | 350.00 |
| Diário acumulado sem ajuste | 250.00 | 300.00 |
| Projeção linear, 30 dias | 3750.00 | 4500.00 |

**Todos aprovados em PGlite e PostgreSQL 17.6 local**, sem tolerância de um centavo.
A suíte do PostgreSQL reutiliza os mesmos 14 casos, dentro de BEGIN/savepoints e
ROLLBACK final; não aplica migrations, não cria schema/infra, não chama bootstrap
sobre identidades existentes. Recusa colisões de UUID/código/papel sintético antes
das mutações. O ROLLBACK remove todas as fixtures da transação e as contagens
anteriores são conferidas novamente. Funciona também após o teste Auth.

Casos: financeiro/oráculo, Stone/combined, ajustes fora do diário, 28/29/30/31,
bissexto, lacunas, referência fora da janela, corte 29→28, histórico parcial,
status false com mês completo, snapshot fechado, datas reais posteriores ao snapshot,
sem snapshot, corrente por escopo, zero divisor/base, muitos centavos, correção e
soft-delete via VEN-02, inativas/sem movimento, ranking/desempate/heatmap/insights,
negações, revogação, perfil inativo, grants/helpers e não interferência do payload.

Auth/PostgREST local: criação e login de **três identidades exclusivamente sintéticas**;
requisições com publishable/anon e JWT real, sem service_role no adaptador de app.
A credencial administrativa local foi lida apenas em memória pelo teste para criar
as identidades de ensaio; nenhuma chave/token/senha foi impressa ou versionada.

**PASS:** Stone 250.00 e combinado 300.00 (ensaio Auth sem ajuste persistido), status
histórico unitário indisponível, projeção nula, total global selecionado, tentativa
de unidade B negada, dados de B não alteram o payload de A, anonimato, falta de
capacidade, schema privado, revogação/perfil inativo com JWT ainda válido.
O oráculo com ajuste e snapshot foi demonstrado na transação SQL; não se atribui
essa prova ao cenário Auth sem ajuste.

```bash
export PATH=/home/bernardodev/.nvm/versions/node/v22.23.4/bin:$PATH
npm test -- tests/sales-analytics-database.test.ts tests/sales-analytics-api.test.ts
VEN03_LOCAL_TEST=gaucha-gestao-local npm test -- tests/sales-analytics-database.test.ts
VEN03_LOCAL_TEST=gaucha-gestao-local \
VEN03_SUPABASE_CLI=/home/bernardodev/.npm/_npx/6f1b058a4d9555af/node_modules/.bin/supabase \
node tests/integration/sales-local-auth.mjs
npm run typecheck
npm run lint
npm test -- --maxWorkers=2
npm run build
npm run verify:build
npm audit --audit-level=moderate
```

## Resultados e falhas corrigidas

| Verificação | Resultado real |
| --- | --- |
| PGlite + adaptador analítico | **17 PASS** (14 banco + 3 transporte) |
| PostgreSQL local, mesma matriz | **14 PASS**, ROLLBACK e contagens preservadas |
| Auth/PostgREST local | **PASS**, login real e matriz negativa |
| Suíte completa com 2 workers | **53 arquivos / 645 testes PASS** |
| typecheck / lint | **PASS** |
| build / verify:build | **PASS**; aviso de chunk >500 kB, sem alteração de UI |
| npm audit, acesso de rede autorizado | **0 vulnerabilidades**; primeira tentativa bloqueada por DNS do sandbox |
| db advisors --local --type all --level warn --fail-on error | Sem ERROR; 3 WARN auth_rls_initplan nas políticas Core inalteradas profiles_read/assignments_read/assignments_revoke |
| CI hospedado | Consultar execução da PR; não confundir provas locais com CI aprovado |

Falhas observadas e resolvidas: alias SQL `day`/`month` exigiu `AS`; teste de
reativação de perfil precisava reativar também sua atribuição, pois o Core a revoga;
primeiro teste PostgreSQL contou a unidade preexistente na seleção global (corrigida
fixture para A/B/C); primeira tentativa Auth criou duas unidades, mas chave de papel
maiúscula foi corretamente rejeitada pelo Core (corrigido o gerador, sem mudar regra).
Todas as execuções SQL de fixture foram revertidas. A suíte irrestrita `npm test`
teve **2 timeouts em audit-database.test.ts** (reabertura e pontuação AP/NAP), com
643 PASS; repetição completa limitada a dois workers teve 645 PASS. Não se removeu
ou afrouxou teste para ocultar falha. A alteração de uma expectativa VEN-02 de cinco
para seis RPCs apenas reflete a nova RPC analítica; os mesmos grants continuam testados.

## Resíduos sintéticos identificados e preservação

Estado final conferido: **5 unidades / 5 perfis**, sendo 1 unidade e 2 perfis anteriores;
**6 lançamentos sales, todos excluídos logicamente**; **0 ajustes e 0 month_statuses**
persistidos. Nenhum dado real sobrescrito. A execução SQL com ajustes/status ficou
inteiramente em ROLLBACK.

| Identificação sintética | Resíduo |
| --- | --- |
| `VEN03-2d06c1f5-*` | 2 unidades da tentativa inicial Auth, ambas desativadas; sem usuários/papéis/lançamentos criados |
| `VEN03-542fa7d6-*` | 2 unidades, 3 usuários/perfis e 2 papéis, todos desativados; atribuições revogadas; 6 lançamentos soft-deleted; trilha de auditoria preservada |

Manifesto só com UUIDs sintéticos em `/tmp/ven03-auth-manifest.json` e
`/tmp/VEN03-542fa7d6-auth-manifest.json`; sem credenciais. Novas execuções geram tags
únicas. Não apagar esses registros fisicamente: auditoria e guardas de imutabilidade
continuam válidas. A limpeza operacional segura já feita é inativar os IDs criados e
soft-delete via VEN-02. Eventual purga física exige autorização específica e estratégia
para FKs/auditoria; não executar por rotina.

## Arquivos e limites da evidência

Migration nova `supabase/migrations/20261028163941_sales_analytics.sql`; adaptadores
`apps/web/src/modules/sales/{api,types,analytics}.ts`; fixture e testes
`tests/{fixtures/sales-analytics.sql,sales-analytics-database.test.ts,sales-analytics-api.test.ts}`;
helpers reais `tests/integration/{sales-local,sales-local-auth}.mjs`;
expectativa de grants em `tests/sales-operations-database.test.ts`; matriz CI em
`.github/workflows/validate.yml`; contrato/evidência VEN-03, estado histórico VEN-02,
`docs/README.md`, `docs/architecture/{AUTHORIZATION,IMPLEMENTATION_MAP}.md` e
`docs/migration/MODULE_ROADMAP.md`.

Não executados no notebook: suites action-plans-integration/infra-validate (não se
provisionou/resetou o ambiente persistente para reproduzir CI), concorrência de
sessões da VEN-02 nesta tarefa, UI/homologação física, dispositivos, importação
financeira, recuperação real e carga produtiva. CI das operações mantém seu teste
de concorrência em serviço descartável hospedado; novo job analítico usa outro
serviço descartável **somente no CI**, nunca cria banco adicional no notebook.

Revisão de diff pelo agente, sem alegar segunda revisão humana. Titular ainda decide
review e merge; limitação histórica unitária explicitamente aprovada e documentada
no [contrato](VEN03_ANALYTICS.md). **STAGING e PROD não foram alterados.**
