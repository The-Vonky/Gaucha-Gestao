# VEN-04A — Validação no notebook

**Adendo de 29/10/2026 — correção obrigatória da PR #94:** os resíduos e a
composição de permissões descritos neste registro são a fotografia da rodada original.
A limpeza física local autorizada removeu 58 papéis sintéticos e suas relações,
preservando auditoria/identidades/histórico; a migration institucional concedeu Vendas
ao administrador e criou Sales Manager/Operator. Os roteiros atuais fazem teardown
dirigido após dry-run, inclusive em falhas. [Estado vigente e evidências](VEN04B_ACCESS_CORRECTION.md).

**Data:** 29/10/2026, America/Sao_Paulo. Autorização expressa do mantenedor para
VEN-04A, testes sintéticos no notebook e PR, sem merge/STAGING/PROD.
**Baseline:** `95589f7abdc120f4dddda00084a581b52214fd62` (merge PR #92).
**Branch:** `codex/ven-04a-sales-ui`.
**Código e suíte completos:** `aed1a561c98bf688617878e36dff08afdacd5f4e`.
**Roteiro Playwright final e regressões PostgreSQL:** `994e7b7213088ed06b3ff3c40ce7c4ab0d45572c`.
O segundo commit corrige apenas o seletor da linha de teste; não muda a aplicação.
O commit deste relatório é somente documental. HEAD/PR e CI constam na descrição da PR.

## Destino, preservação e migration

Conferidos Git, branch anterior VEN-03, `main`/`origin/main`, diff e Docker.
`origin/main` confirmou a baseline pedida; criada branch própria sem worktree novo.
Preservados e excluídos dos commits: os 11 acréscimos preexistentes em
`package-lock.json` (`peer: true`) e `supabase/snippets/`.

- Reutilizado `supabase_db_gaucha-gestao-local`, PostgreSQL 17.6, banco `postgres`,
  porta publicada **127.0.0.1:54322**. Gateway local **127.0.0.1:54321**;
  Auth e PostgREST existentes. Nenhum container/volume/projeto/banco adicional.
- Antes: **26 migrations**, VEN-01/02/03 já aplicadas; **5 unidades, 5 perfis,
  5 atribuições, 6 lançamentos sales (todos soft-deleted), 213 eventos de auditoria**.
- Comprovada ausência de `sales_operation_units(integer,integer)` e presença das
  dependências Core/VEN-02/03. Nova RPC aprovada em PGlite antes da aplicação.
- CLI existente **2.117.0**, `migration new sales_operation_units` gerou
  `20261029122326_sales_operation_units.sql`. Changelog e documentação oficial
  consultados; nenhum upgrade do CLI/PostgreSQL/cliente.
- Aplicada somente essa migration, uma vez. Arquivo e registro em
  `supabase_migrations.schema_migrations` na **mesma transação**, via `psql -X
  -v ON_ERROR_STOP=1` no container confirmado. Histórico guarda texto original.
  **27 migrations** ao final, sem modificar/reaplicar anteriores.
- Mudança restrita a CREATE FUNCTION/REVOKE/GRANT/NOTIFY e histórico. Nenhuma linha
  preexistente foi sobrescrita, nenhum papel real recebeu permissões.
- Em defeito: revogar EXECUTE só da assinatura nova e preparar forward-fix append-only,
  preservando dados/histórico. Essa contenção não foi executada.

Sem reset, db push, linked, seed destrutivo, down, prune, restart, acesso ao legado,
servidor, STAGING ou PROD. Vite usou o endereço padrão **127.0.0.1:5173** somente
durante o teste e foi encerrado no finally; nenhum serviço permanente criado.

## Resultados reais

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test -- --maxWorkers=2` | **56 arquivos / 701 testes PASS**, 113,69 s na rodada final |
| `npm run build` / `npm run verify:build` | PASS; aviso de chunk >500 kB (863,78 kB no principal); sem chave privilegiada no bundle |
| `npm audit --audit-level=moderate` | **0 vulnerabilidades**, acesso de rede autorizado |
| PGlite de Vendas | Fundação/operations/analytics/units e adaptadores na suíte completa, sem regressão |
| PostgreSQL local VEN-02 | **10 PASS**, operações, dinheiro, terceiros, transferência, histórico inativo, RLS/grants, versão e auditoria |
| PostgreSQL local VEN-04A | **7 PASS**, catálogo por capacidade, negativos, inatividade, escopos, paginação e grants |
| PostgreSQL local VEN-03 | **14 PASS**, regressão dos contratos/oráculo analítico |
| Auth/PostgREST + Playwright Chromium | **PASS**, roteiro completo final `VEN04A-8b441b99` |
| Advisor local | Sem ERROR; três WARN históricos `auth_rls_initplan` no Core: profiles_read, assignments_read, assignments_revoke; nenhuma política Core alterada |
| Diff | `git diff --check` sem erros; revisão pelo agente, sem alegar segunda revisão humana |
| CI hospedado | Consultar SHA/links da PR; evidência local não significa CI aprovado |

As três suites PostgreSQL rodaram sequencialmente (`--maxWorkers=1` para as duas
operacionais), sem schema/bootstrap sobre usuários reais. O helper local recusa destino
incorreto/colisões de UUIDs da fixture; abre BEGIN/savepoints e termina em ROLLBACK.
Conferiu novamente contagens de unidades/perfis/migrations. Não deixaram fixtures SQL.
O administrador da matriz local recebe atribuição apenas para identidade sintética,
dentro da transação revertida; não amplia papéis/usuários preexistentes.

## Fluxos de UI e integração

Contas com leitor, criador isolado, editor, exclusor, operador, sem papel e setor;
login **real** no Supabase Auth. Cada perfil recebe somente capacidades sintéticas
nas unidades da própria execução. JWTs emitidos pelo Auth e transporte PostgREST reais;
service_role somente em memória no preparador de identidades local, nunca no browser,
Vite, adaptador, screenshot ou log. Nenhuma senha/chave/token foi versionada/impressa.

**Demonstrado no navegador:** Comercial/rota integrada; criador sem read cadastra PIX
`0,01` e Stone `1.250,30`, sem chamar list/detail/dashboard; leitor consulta sem escrita;
filtros de data/unidade/método/todas autorizadas e histórico inativo; paginação real com
mais de 25 linhas; edição de colega alterando valor/data/método; conflito provocado
por outro cliente com campos preservados, reconsulta e aceite explícito de versão;
correção na unidade inativa e transferência autorizada de B para A; exclusão de colega
com cancelar/confirmar, sem motivo; lista atualizada e soft-delete conferido no banco.

**Demonstrado via RPC/SQL real:** duplicidade, valor inválido/zero/precisão excessiva,
unidade inativa para criação/destino, destino sem autorização, setor/sem papel,
capacidade de escrita sem read/dashboard, revogação e perfil inativo com JWT válido,
controle de versão, auditoria financeira exata e evento de transferência com
`unit_id=NULL`. Testes de componentes complementam com filtros rápidos/respostas
obsoletas, submissão concorrente, falha de rede sem repetição ambígua, sessão expirada,
exclusão com conflito e transferência concorrente sem troca silenciosa do destino.

**Visual/teclado:** viewports **375, 768, 1024, 1440 px**. Sem overflow horizontal
da página; tabela tem rolagem própria e ações alcançáveis. Modal com campos/botões
alcançáveis, foco confinado, Tab e Escape; preferência `reducedMotion=reduce`.
Screenshots finais de lista e formulário inspecionados pelo agente, em
`/tmp/ven04a-ui/VEN04A-8b441b99-{375,768,1024,1440}.png` e `*-form.png`.
Capturas são sintéticas, sem dados reais. Não houve ensaio com leitor de tela,
dispositivo físico/touch nem homologação humana.

## Tentativas e correções, sem ocultar falhas

- Inspeção Docker/fetch inicial encontrou o sandbox sem acesso ao socket/`.git`;
  repetida com a escalada autorizada, sem auto-review rejeitado.
- CLI precisou do PATH Node existente e escalada para seu arquivo local de telemetria;
  nenhuma instalação/upgrade de dependência do projeto.
- Typecheck inicial apontou inicialização de `useRef` no React 19; corrigida.
- Testes iniciais de UI: dois casos parametrizados da fixture estavam mal formatados;
  corrigidos. Ensaio de submissão dupla revelou que uma segunda chamada podia liberar
  o busy do Shared: adicionada trava síncrona em `Form`/`Confirm`, comprovada no teste.
- Chromium ausente e bibliotecas `libnspr4`, `libnss3`, `libasound2` ausentes: download
  de navegador e extração de pacotes **apenas em /tmp**, sem instalar pacotes no SO.
- Duas tentativas Playwright tiveram **timeout original de 30 s** no seletor exato
  de label envolvendo select/opções. Corrigido o localizador do teste.
- Asserção de valor `0,01` alcançou duas linhas antes da conclusão dos filtros:
  espera explícita pela resposta PostgREST passou a preceder a asserção.
- Ampliação do roteiro para criar Stone repetiu corretamente `1.250,30` em duas linhas;
  a asserção foi tornada específica à data. Não houve alteração de regra para passar teste.
- Nenhum timeout na suíte final controlada de 701 testes. Rodada anterior completa:
  699 PASS; dois cenários adicionais de rede/transferência elevaram a final para 701.

## Resíduos sintéticos preservados

Sete execuções Auth; cada uma criou **3 unidades, 7 usuários/perfis, 7 papéis e 1 setor**.
Todos inativados; atribuições revogadas, logout e auditoria preservada. Sem DELETE físico.

| Tag | Lançamentos soft-deleted | Resultado da tentativa |
| --- | ---: | --- |
| `VEN04A-c3ee065b` | 3 | Dependência do Chromium ausente; negativos RPC executados |
| `VEN04A-65d16aa2` | 3 | Timeout no seletor de unidade |
| `VEN04A-db29681c` | 3 | Diagnóstico do mesmo seletor, com captura sintética |
| `VEN04A-52472d04` | 4 | Asserção prematura dos filtros |
| `VEN04A-8e9668d6` | 30 | Roteiro completo inicial PASS |
| `VEN04A-3d364035` | 6 | Asserção ambígua após ampliação Stone |
| `VEN04A-8b441b99` | 32 | Roteiro ampliado final PASS |

Total acrescentado: **21 unidades, 49 perfis/identidades Auth, 49 papéis, 7 setores,
81 lançamentos excluídos logicamente**. Relações históricas de papel e setor permanecem;
perfis/papéis/atribuições/unidades/setores sintéticos estão inativos. Manifestos somente
com IDs sintéticos e resultados em `/tmp/ven04a-ui/<tag>-manifest.json` e
`/tmp/ven04a-ui/latest-manifest.json`, sem credenciais.

Estado final conferido: **26 unidades / 54 perfis / 87 lançamentos sales**, sendo
5 unidades / 5 perfis / 6 lançamentos preexistentes preservados. **0 lançamentos ativos**
e **0 unidades/perfis/papéis VEN04A ativos**; **27 migrations**. Os 6 lançamentos anteriores
já estavam soft-deleted; não foram alterados pelo roteiro. Auditoria sintética e contas
Auth permanecem identificadas para rastreabilidade; eventual purga exige autorização
própria e análise de FKs/imutabilidade. Não confundir inativação com remoção de identidade.

## Reproduzir no notebook autorizado

```bash
export PATH=/home/bernardodev/.nvm/versions/node/v22.23.4/bin:$PATH
npm test -- --maxWorkers=2
VEN04A_LOCAL_TEST=gaucha-gestao-local npm test -- \
  tests/sales-operations-database.test.ts tests/sales-units-database.test.ts --maxWorkers=1
VEN03_LOCAL_TEST=gaucha-gestao-local npm test -- tests/sales-analytics-database.test.ts
VEN04A_LOCAL_TEST=gaucha-gestao-local \
VEN04A_SUPABASE_CLI=/home/bernardodev/.npm/_npx/6f1b058a4d9555af/node_modules/.bin/supabase \
PLAYWRIGHT_BROWSERS_PATH=/tmp/ven04a-browsers \
LD_LIBRARY_PATH=/tmp/ven04a-browser-libs/root/usr/lib/x86_64-linux-gnu \
node tests/integration/sales-ui-local.mjs
npm run typecheck
npm run lint
npm run build
npm run verify:build
npm audit --audit-level=moderate
```

O roteiro Auth cria nova tag e deixa novos resíduos inativos a cada execução; não
reexecutar por rotina sem necessidade. Navegador/libs em /tmp são efêmeros e precisam
estar disponíveis antes; não usar esse script em servidor/STAGING/PROD.

## Limites e próxima decisão

Sem dashboard da VEN-04B, exportação/print, migração financeira real, deploy, merge,
homologação humana, ensaio produtivo de carga/recuperação ou mudanças no legado.
Concorrência PostgreSQL de sessões independentes VEN-02 permanece no CI existente;
não foi reproduzida por esse script no notebook. Integrações que recriam infraestrutura
(action-plans/infra) não foram executadas no banco persistente; só no CI hospedado.
Paginação por offset não é snapshot. Cadastro não tem chave de idempotência adicional;
resposta de rede incerta bloqueia repetição no formulário e orienta conferência.

O mantenedor único precisa revisar diff, CI, riscos residuais e decidir merge.
Não houve segunda revisão humana nem review formal `APPROVED` presumido.
[Contrato e guia operacional](VEN04A_OPERATIONS_UI.md). **PROD NO-GO.**
