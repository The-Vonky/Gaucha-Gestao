# VEN-04B — Correção de acesso e catálogo institucional

**Adendo MEL-01 de 30/10/2026:** unidades e históricos locais foram removidos com
autorização específica; o catálogo terminou vazio. Roteiros agora retiram suas próprias
unidades após backup/dry-run. [Estado vigente e evidências](VEN04B_MEL01_LOCAL_CLEANUP.md).

**Data:** 29/10/2026, `America/Sao_Paulo`. Correção expressamente autorizada antes
do merge da [PR #94](https://github.com/The-Vonky/Gaucha-Gestao/pull/94), na branch
`codex/ven-04b-sales-dashboard`, sobre `bf2c1aa`. Não constitui VEN-05 ou novo gate.
O SHA final e os resultados de CI ficam registrados na PR, evitando autorreferência
do commit neste arquivo. Revisão/aceite e decisão de merge pertencem ao mantenedor.

## Causa e composição institucional

A conta administrativa indicada pelo titular já possuía **perfil Core ativo e
atribuição global ativa** de `platform_administrator`, protegido e ativo. A VEN-01
criara o catálogo `sales.*` sem suas relações em `core.role_permissions`: nenhuma
dessas sete capacidades chegava a `core.my_access`, ao menu ou às RPCs. Não foi
necessário alterar a identidade, senha ou atribuições dessa conta.

Migration append-only **`20261029180613_sales_institutional_roles.sql`**, gerada pelo
CLI existente 2.117.0 e aplicada somente no notebook, com histórico na mesma
transação. O banco passou de **27 para 28 migrations**. Composição explícita:

| Papel protegido | Capacidades Vendas |
| --- | --- |
| `platform_administrator` | `sales.entry.read/create/edit/delete`, `sales.dashboard.read`, `sales.export.filtered/full` — sete relações novas; composição total 25 → 32 |
| `sales_manager` — **Sales Manager** | As mesmas sete capacidades |
| `sales_operator` — **Sales Operator** | `sales.entry.read`, `sales.entry.create` |

Os dois novos papéis são `system=true`, ativos, com chave estável e descrição
profissional, sem capacidades de outros módulos ou atribuição automática. Permitem
atribuição global/unitária; setor não autoriza agregado de unidade. Migration
idempotente para composição válida; colisões com papel personalizado, catálogo
inativo/incompleto ou composição divergente abortam sem promover papéis.
Capacidades de exportação não implementam exportadores: VEN-05 continua pendente.

**D5-B preservada:** nenhum `room_booking.manage` no administrador ou nos papéis de
Vendas. Nenhuma função/política de Agendamento foi alterada. A lógica continua por
capacidade + escopo + perfil ativo. O teste D5-B passou a aplicar migrations na ordem
cronológica, preservando sua verificação de nomes e separação de funções.

Reversão do código não desfaz a migration local. Qualquer reversão de concessões
exige nova intervenção/migration explícita; não editar migration aplicada nem apagar
papéis protegidos que venham a receber atribuições.

## Inventário, preservação e limpeza física local

Destino confirmado por inspeção Docker: `supabase_db_gaucha-gestao-local`, imagem
Supabase PostgreSQL 17.6, binding `127.0.0.1:54322`; Auth/PostgREST
`http://127.0.0.1:54321`. Nenhum projeto remoto descoberto ou acessado.

| Catálogo/relação | Antes | Após limpeza | Após provisionamento |
| --- | ---: | ---: | ---: |
| Papéis Core | 65 | 7 | **9** |
| Papéis sintéticos antigos | 58 | **0** | **0** |
| Papéis protegidos | 7 | 7 | **9** |
| Relações de permissões | 162 | 50 | **66** |
| Atribuições de usuários | 89 | 3 | **3** |

Proveniência cruzada: duas chaves VEN-03 da tag `VEN03-542fa7d6`, sete papéis de cada
uma das sete tags VEN-04A documentadas e sete papéis `VEN04B-8b441b99`. O inventário
enumera **58 UUIDs exatos**, **112 relações** e **86 atribuições inativas**, vinculadas
a **52 identidades sintéticas** `example.test`. Confere metadados Auth/Core, nomes
exatos, `system=false`, estado inativo e eventos originais de criação sem ator Auth.
Os manifestos efêmeros de rodadas anteriores não estavam disponíveis; a proveniência
foi reconstruída a partir dos registros reais, auditoria e tags documentadas, sem
inferir UUIDs pelo nome.

As únicas FKs de entrada encontradas eram `core.role_permissions.role_id` e
`core.user_role_assignments.role_id`, ambas sem cascata. A auditoria guarda os UUIDs
e dados anteriores em texto/JSON, sem FK para papéis/atribuições. Foram preservados
todos os seus IDs anteriores e acrescentados os eventos de exclusão pelos triggers
existentes. Não houve exclusão de eventos, usuários, unidades, permissões do catálogo,
lançamentos ou histórico. Não havia papel personalizado legítimo entre os candidatos.

O preparador `tests/integration/sales-catalog-local.mjs inventory` gravou o
inventário antes da exclusão. `apply` executou backup privado das três relações,
`BEGIN`, locks/revalidação, exclusão dirigida e **ROLLBACK**; depois repetiu a
revalidação e exclusão em transação com **COMMIT**. Sem CASCADE, TRUNCATE ou reset.
**Nenhuma exclusão ficou bloqueada por integridade/proveniência.** Uma rejeição
inicial da revisão automática de autorização foi resolvida apresentando a autorização
expressa do anexo do titular; a mesma ação delimitada foi então aceita.

Artefatos privados, ignorados pelo Git, no notebook:

- `tmp/ven04b-correction/catalog-inventory.json`: UUIDs, tags, fontes e eventos de criação.
- `tmp/ven04b-correction/catalog-preserved.json`: linhas sintéticas preservadas de roles/permissions/assignments.
- `tmp/ven04b-correction/catalog-result.json`: dry-run e contagens removidas.
- `tmp/ven04b-correction/institutional-before.json` e `institutional-verification.json`: composição anterior e prova SQL sem email/UUID da conta real.
- Manifestos e backups por rodada em `ven03/`, `ven04a/` e `dashboard-*`, além de `admin-ui*-manifest.json`.

Esses arquivos não contêm credenciais. Não são seed/restauração automática: eventual
restauração exige análise do estado atual e transação explícita, preservando auditoria.
Os UUIDs locais não foram incluídos em migration ou script SQL de outros ambientes.

## Patch de dependência exigido pelo CI

O primeiro CI do commit `352391c` aprovou os 768 testes, build e verify:build, mas
falhou no audit por **GHSA-8g5g-mxqh-grgj**, moderado, em Vite 6.4.4. O advisory foi
atualizado em 29/10; a consulta local anterior havia retornado zero achados. Aplicado
somente o patch oficial **6.4.5**, fixado em `apps/web/package.json` e no lockfile,
sem adicionar biblioteca ou alterar outras versões. [Advisory oficial](https://github.com/advisories/GHSA-8g5g-mxqh-grgj).
As onze flags `peer` preexistentes no lockfile permanecem no workspace, fora do commit.
Typecheck, lint, suíte completa, build, verify:build e audit foram repetidos com o patch.
O Vite do mantenedor já em execução foi preservado; a nova versão é usada na próxima
inicialização do processo. Nenhuma infraestrutura ou dado foi alterado pelo patch.

## Ciclo de vida dos ensaios

`sales-local-auth.mjs`, `sales-ui-local.mjs` e `sales-dashboard-local.mjs` registram
recibos exatos de UUID/chave/identidade antes da preparação relevante. O helper
`sales-role-cleanup.mjs` valida proteção, proveniência, identidades, permissões e FKs;
salva backup privado; faz dry-run/ROLLBACK e remove somente os papéis do recibo e suas
relações em transação. Uma dependência inesperada ou atribuição externa bloqueia a
remoção e produz erro explícito, preservando registros. Não usa DELETE por prefixo.

O teardown tenta suas etapas mesmo quando navegador/RPC/outra etapa falha, agrega
os erros e grava o manifesto. Perfis/unidades sintéticos ficam inativos; lançamentos
seguem soft-delete por RPC, e auditoria/ajustes/snapshots continuam preservados.
`SalesLocalDatabase` impede ensaios locais simultâneos por advisory lock de sessão e
confere as contagens depois do ROLLBACK das suítes SQL. O Vite existente na porta
5173 é reconhecido e reutilizado; seu processo não é encerrado. Nenhuma porta nova.

Interrupção forçada do processo/SO continua podendo impedir `finally`: o recibo
permite recuperação dirigida após nova inspeção, sem adotar papéis por nome. Isso
não é promessa de limpeza automática após SIGKILL, falha de disco ou perda do banco.

## Validação executada e limites

O titular confirmou neste chat: **“Sim, consegui acessar as telas”**, em resposta
à verificação do login existente, Comercial, `/sales`, `/sales/dashboard` e nove
papéis em `/admin/roles`. Isso registra validação manual, sem inventar review formal.

Prova SQL da **conta existente**, com `SET LOCAL ROLE authenticated` e identidade
da conta indicada: sete capacidades globais em `my_access`, descoberta/consulta,
cadastro/edição/exclusão em duas unidades sintéticas, `sales_dashboard` combinado
**0.05**, unidades A/B presentes e `room_booking.manage=false`. Tudo em ROLLBACK;
essa prova SQL não é descrita como login Auth.

Prova complementar Auth/Chromium com identidade **sintética existente** e atribuição
temporária de UUID registrado ao papel protegido: login, Comercial, CRUD UI,
dashboard e listagem com nove papéis; Sales Manager/Operator somente consultáveis.
Sua atribuição foi removida, perfil/unidades voltaram a inativos, sem mudar a conta real.

| Check | Resultado |
| --- | --- |
| `npm run typecheck` / `npm run lint` | PASS |
| `npm test -- --maxWorkers=2` | **768 PASS / 60 arquivos**, rodada final com Vite 6.4.5 de 97,70 s |
| Matriz PostgreSQL local operations + units | **19 PASS**, ROLLBACK |
| Matriz PostgreSQL local analytics | **15 PASS**, ROLLBACK |
| Composição/idempotência/colisão, escopos/perfil, teardown repetido e recusas seguras | **5 PASS** em `sales-institutional-database.test.ts` |
| `sales-admin-ui-local.mjs` | PASS, Auth/PostgREST/Chromium reais |
| `sales-local-auth.mjs` VEN-03 | PASS; **9 → 9 papéis**, dois papéis temporários removidos |
| `sales-ui-local.mjs` VEN-04A | PASS; **9 → 9 papéis**, sete papéis temporários removidos |
| Dashboard completo, rodadas consecutivas 3 e 4 | **PASS em ambas; 9 → 9 → 9 papéis**; sete papéis e suas relações retirados por rodada |
| `VEN04B_FAIL_AFTER_PREPARE=1` | Erro deliberado esperado; **9 → 9 papéis**, sete papéis/seis atribuições/nove relações de permissões removidos; nenhum lançamento criado; zero erros de teardown |
| `npm run build` / `npm run verify:build` | PASS; aviso de chunk >500 kB preexistente |
| `npm audit --audit-level=moderate` | **0 vulnerabilidades** |
| `supabase db advisors --local --type all --level warn --fail-on error` | Sem ERROR; três WARN `auth_rls_initplan` preexistentes em profiles_read/assignments_read/assignments_revoke |

Negativos mantidos: anônimo, sessão sem identidade, sem papel/capacidade, setor,
unidade externa, perfil inativo, revogação com JWT válido, concorrência/versão e
acesso direto às tabelas privadas. Casos positivos do administrador substituem apenas
a antiga decisão de ausência de grants. Remover uma relação de permissão nega a
capacidade mesmo preservando nome do papel e atribuição: não há inferência por nome.

Falhas corrigidas sem afrouxar autorização: PGlite exige comandos separados e usa
`rows` para SELECT; fixture SQL temporária excedia o tamanho do código de unidade
(ROLLBACK); Vite 5173 já estava em uso (teardown passou, reutilização acrescentada);
expectativas Core de 25 capacidades e ordem histórica D5-B foram atualizadas;
teste de Redefinir pressupunha todo o banco local vazio. O reset agora bloqueia a
consulta fora da janela sintética e confere payload/filtros/estado descartado. Um
lançamento ativo fora das fixtures foi preservado, sem consultar seu conteúdo. Uma
segunda tentativa de reset identificou duas requisições de atualização; a interceptação
passou a bloquear todas nesse passo. Nas duas tentativas com falha o teardown também
terminou em nove papéis e zero erros de limpeza; não houve aumento de timeout.
Axe não foi reexecutado nesta correção; a evidência anterior continua histórica.

Reprodução dos ensaios atuais, **sequencialmente** no notebook já confirmado:

```bash
export PATH=/home/bernardodev/.nvm/versions/node/v22.23.4/bin:$PATH
export VEN04B_SUPABASE_CLI=/home/bernardodev/.npm/_npx/6f1b058a4d9555af/node_modules/.bin/supabase
export PLAYWRIGHT_BROWSERS_PATH=/tmp/ven04b-browsers
export LD_LIBRARY_PATH=/tmp/ven04b-browser-libs/root/usr/lib/x86_64-linux-gnu
VEN04B_LOCAL_TEST=gaucha-gestao-local node tests/integration/sales-admin-ui-local.mjs
VEN03_LOCAL_TEST=gaucha-gestao-local VEN03_SUPABASE_CLI="$VEN04B_SUPABASE_CLI" \
  node tests/integration/sales-local-auth.mjs
VEN04A_LOCAL_TEST=gaucha-gestao-local VEN04A_SUPABASE_CLI="$VEN04B_SUPABASE_CLI" \
  node tests/integration/sales-ui-local.mjs
VEN04B_LOCAL_TEST=gaucha-gestao-local VEN04B_REUSE_TAG=VEN04A-8b441b99 \
  VEN04B_ARTIFACT_DIR=tmp/ven04b-correction/nova-rodada \
  node tests/integration/sales-dashboard-local.mjs
```

CLI/navegador/bibliotecas precisam existir; seu download/extração de teste não instalou
pacotes no SO nem criou infraestrutura. A migration e a limpeza histórica **já foram
executadas**: não reaplicar os preparadores `apply` por rotina. Novas execuções Auth
VEN-03/04A ainda acrescentam identidades/unidades e histórico sintéticos inativos;
preferir as suítes transacionais para regressão sem novos resíduos. VEN-04B reutiliza
cadastros, mas acrescenta lançamentos/auditoria, sem acumular papéis.

Estado final conferido por SQL: **9 papéis protegidos, 66 relações de permissões,
3 atribuições preservadas, 31 unidades, 64 perfis e 28 migrations**. Os **62 perfis
sintéticos estão inativos** e há **zero lançamentos sintéticos ativos**. O total de
188 lançamentos inclui 187 soft-deleted e um ativo fora das fixtures, preservado.
Esta correção acrescentou 10 identidades, cinco unidades e 71 lançamentos
exclusivamente sintéticos pelos ensaios, todos com ciclo de vida documentado;
não excluiu identidades ou histórico para reduzir contagens.

Resíduos preservados: identidades/unidades/setores sintéticos inativos, lançamentos
soft-deleted e auditoria; os dois snapshots de 2042 e o ajuste imutável Stone 50 da
rodada original continuam no notebook. Nenhum desses resíduos é catálogo de papéis.
Não há tentativa de purgar histórico. A interface continua administrando perfis
inativos legítimos; não foi alterada para ocultá-los.

STAGING/PROD, C30 e legado **não foram alterados**. Sem importação financeira real,
deploy, merge, serviço privilegiado novo, reset ou infraestrutura Docker adicional.
Não provados: homologação VEN-07, leitor de tela/dispositivo físico, recuperação ou
carga produtiva. CI e revisão final são registrados na PR. Não houve segunda revisão
humana nem `APPROVED` presumido. **PROD NO-GO** permanece.
