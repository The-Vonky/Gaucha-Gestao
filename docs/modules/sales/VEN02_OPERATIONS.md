# VEN-02 — Operações de negócio de Vendas / Maquininhas

**Estado:** INTEGRADA à `main` pela [PR #91](https://github.com/The-Vonky/Gaucha-Gestao/pull/91),
merge `72ae883ba279069d961b40054d68012d34ed3f8c` em 28/10/2026; não homologada.
Aplicação incremental no notebook autorizada e realizada separadamente na
[VEN-03](VEN03_LOCAL_VALIDATION.md). STAGING/PROD não alterados.

O restante deste documento registra o escopo e as restrições da autorização original
da VEN-02; a nova autorização de VEN-03 não deve ser confundida com aquela execução.
**Autorização:** pedido expresso do responsável em 28/10/2026 para VEN-02, testes
sintéticos em memória/CI descartável e abertura de PR. VEN-03–VEN-08 permanecem
dependentes de suas autorizações. **Notebook, STAGING e PROD não são destinos de teste.**
**Baseline conferida:** `origin/main` `cbdbed99e5593eaf6b79392d559b0bd84e25267d`,
merge da [PR #90](https://github.com/The-Vonky/Gaucha-Gestao/pull/90). Não havia avanço
posterior na conferência inicial. [VEN-00](../../briefs/VEN-00_consolidada_vendas_maquininhas_2026-10-28.md)
e ADR-001/002/005 regem o contrato.

## Superfície e permissões

A migration append-only `20261028140147_sales_operations.sql` acrescenta cinco
RPCs no schema `public`, seguindo Salas. `supabase/config.toml` permanece intacto.
Os schemas `sales`/`sales_private` continuam privados, com RLS restritiva e sem
grants diretos de dados. Somente as cinco assinaturas enumeradas recebem EXECUTE
para `authenticated`; PUBLIC/anon não recebem EXECUTE. Helpers privados não são
chamáveis pelo cliente. Nenhum papel ou funcionário recebe permissões pela migration.

| RPC | Permissão Core | Escopo | Resposta |
| --- | --- | --- | --- |
| `sales_entries_list` | `sales.entry.read` | Somente unidades autorizadas, inclusive históricas inativas | Array JSON, vazio quando não há linhas no recorte autorizado |
| `sales_entry_detail` | `sales.entry.read` | Unidade da linha ativa | Objeto JSON |
| `sales_entry_create` | `sales.entry.create` | Unidade ativa | Objeto criado, versão 1 |
| `sales_entry_update` | `sales.entry.edit` | Origem e destino; destino ativo na transferência | Objeto atualizado, versão incrementada |
| `sales_entry_delete` | `sales.entry.delete` | Unidade da linha ativa | Objeto excluído logicamente, versão incrementada |

Todas validam identidade ativa e o contrato `private.has_unit_permission`.
Atribuições setoriais não cobrem agregado de unidade. Capacidade de criação,
edição ou exclusão não exige autoria nem adiciona implicitamente capacidade de
leitura: o retorno da própria mutação é autorizado pela capacidade correspondente.
Não há exigência de motivo, supervisor ou parâmetro de confirmação. A confirmação
simples pertence à VEN-04. A matriz efetiva de papéis/concessões depende do titular.

SECURITY DEFINER é necessário para persistir/consultar tabelas privadas sem abrir
DML aos clientes. Todos esses endpoints fixam `search_path=''`, qualificam objetos,
validam escopo no banco e expõem somente campos explícitos. Não existe SQL dinâmico
ou parâmetro que escolha uma capacidade privilegiada na API pública.

## Assinaturas e valores

```sql
public.sales_entries_list(
 p_from date default null, p_to date default null, p_unit uuid default null,
 p_method text default null, p_limit integer default 50, p_offset integer default 0
) returns jsonb;
public.sales_entry_detail(p_id uuid) returns jsonb;
public.sales_entry_create(p_date date,p_unit uuid,p_method text,p_amount text) returns jsonb;
public.sales_entry_update(p_id uuid,p_expected_version integer,
 p_date date,p_unit uuid,p_method text,p_amount text) returns jsonb;
public.sales_entry_delete(p_id uuid,p_expected_version integer) returns jsonb;
```

Listagem: limites inclusivos de data, um dia usando `p_from=p_to`; extremos nulos
abrem o período; unidade/método nulos significam todas as **autorizadas**/ambos os
métodos. Ordenação fixa `sale_date DESC, id DESC`; limite 1–100, padrão 50;
offset inteiro não negativo. Perfil sem capacidade aplicável recebe erro de
permissão, mesmo quando a tabela está vazia. Filtrar unidade fora do escopo nega.
Unidades inativas continuam consultáveis; não há filtro implícito `units.active`.

Criação e edição recebem o agregado completo (sem PATCH): data civil finita
entre `0001-01-01` e `9999-12-31`, unidade Core e método exatamente `Stone`/`PIX`.
`p_amount` é string decimal sem sinal, espaços, separadores de milhar, vírgula,
expoente ou zeros iniciais redundantes: de `"0.01"` até `"999999999999.99"`.
São aceitos `"1"` e `"1.2"`; retornam `"1.00"` e `"1.20"`.
Zero, negativos, NaN, infinito e mais de duas casas são rejeitados antes do cast
para NUMERIC. Não existe arredondamento silencioso. Banco mantém NUMERIC exato.

Cada objeto contém `id`, `sale_date`, `unit_id`, `payment_method`, `amount`,
`created_by`, `updated_by`, `created_at`, `updated_at`, `version`, `deleted_at` e
`deleted_by`. Datas civis são strings ISO; instantes têm fuso; `amount` sempre é
string com duas casas. Autor original importado pode ser nulo. Os metadados de
proveniência internos não fazem parte deste read model. Somente o retorno de
delete inclui o estado excluído; list/detail nunca recuperam excluídos.

Exemplo sintético de chamada pelo cliente Supabase existente:

```ts
await client.schema("public").rpc("sales_entry_create", {
  p_date: "2026-10-28",
  p_unit: "10000000-0000-0000-0000-000000000001", // unidade da fixture
  p_method: "Stone",
  p_amount: "0.29",
});
```

`apps/web/src/modules/sales/{api.ts,types.ts}` exportam `listEntries`,
`entryDetail`, `createEntry`, `updateEntry`, `deleteEntry`, tipos e `salesMessage`.
O adaptador usa somente o cliente público Core e schema `public`, preserva SQLSTATE
e recusa resposta monetária numérica. Não converte dinheiro para Number/parseFloat.
Não há rota, tela, mudança de navegação ou implementação analítica.

## Erros e conflitos

| SQLSTATE | Significado | Conduta do consumidor |
| --- | --- | --- |
| `42501` | Anônimo, identidade inativa, capacidade ausente, setor ou unidade indevida | Atualizar acesso; não repetir automaticamente |
| `P0002` | UUID inexistente, fora do escopo ou excluído | Mensagem única de indisponibilidade; não inferir existência |
| `23505` | Chave ativa já ocupada, inclusive sob corrida | Reconsultar o recorte antes de corrigir |
| `40001` | Versão esperada diferente da versão atual | Recarregar a linha e decidir nova edição/exclusão |
| `23514` | Valor/método/data, paginação, versão ausente/inválida ou unidade inativa indevida | Corrigir entrada |
| `22007`, `22008`, `22P02` | Conversão de data/UUID/tipo rejeitada antes do corpo da RPC | Corrigir entrada |

IDs desconhecidos, externos e excluídos têm a mesma mensagem e SQLSTATE. Não são
retornados detalhes da linha recusada. Erros de infraestrutura/timeout/deadlock
não são convertidos em sucesso; o consumidor apresenta falha genérica e reconsulta.

Uma repetição de create **não duplica ativos**: o índice parcial retorna `23505`.
Não há chave de idempotência adicional nem retry automático que possa substituir
uma linha editada por colega. Após falha de rede, consultar a chave diária antes de
decidir repetir. Repetir delete de excluído retorna `P0002`. A exclusão libera a
chave para novo UUID, preservando a linha e os valores anteriores.

## Concorrência e auditoria

O helper de autorização mantém `FOR SHARE` sobre perfil, atribuições global/unit,
papéis, relações da capacidade e catálogo até o término da transação. A decisão
final usa os helpers Core atuais após os bloqueios. Funções PL/pgSQL são VOLATILE
para reavaliar snapshots após esperas no isolamento padrão READ COMMITTED.
Se a operação chegar primeiro, revogação aguarda seu commit; se a revogação
chegar primeiro, a chamada aguarda e nega após reavaliar. Não há janela autorizada
com uma concessão já revogada e confirmada.

Criação e transferência bloqueiam unidades com `FOR SHARE`, que conflita com a
atualização de `active`. Transferências travam unidades por UUID ordenado.
Edição/delete usam `FOR UPDATE` na linha já filtrada por escopo, conferem
`p_expected_version` e preservam o incremento do trigger VEN-01. Uma edição que
perde para delete recebe indisponibilidade; delete que perde para edição recebe
conflito de versão. Unicidade concorrente é garantida pelo índice parcial VEN-01.

Os triggers VEN-01 registram evento, ator, horário e antes/depois de cada mutação
válida no `core.system_audit_log`, na mesma transação. O JSONB do log mantém NUMERIC
exato no PostgreSQL; este contrato **não expõe esse log** ao browser como JSON number.
Uma futura API administrativa deverá preservar sua precisão ao serializar.
Transferência mantém `unit_id=NULL` no evento, visível só à auditoria global.
Erros e rollback não deixam alteração financeira nem evento de sucesso.
Não foi necessária alteração da fundação VEN-01 nem de helpers Core.

## Validação e limites

| Camada | Arquivos | Prova |
| --- | --- | --- |
| PGlite em memória | `tests/sales-operations-database.test.ts`, fixture `sales-operations.sql` | Todas as migrations, cinco RPCs, centavos, autoria, grants/RLS, negativos, transferência, histórico inativo, versão e auditoria |
| Adaptador | `tests/sales-api.test.ts` | Strings de entrada/saída, rejeição de number, parâmetros e erros seguros |
| PostgreSQL 17 descartável no CI | job `sales-integration` em `validate.yml` | Mesma matriz SQL executada com papel `authenticated` e identidade de sessão simulada no padrão das fixtures |
| Sessões PostgreSQL independentes | `tests/integration/sales-concurrency.mjs` | `pg_blocking_pids` observado; create/create, edit/edit, edit/delete nas duas ordens, delete/delete, reentrada; revogação de atribuição/perfil/papel/relação/catálogo e inativação na criação/transferência nas duas ordens |

O job cria serviço efêmero apenas no runner GitHub hospedado, sem credenciais ou
destinos de implantação. Os scripts recusam execução PostgreSQL fora desse runner
e exigem URL explícita para `localhost`/`gaucha_sales_ci`. Não há descoberta de
serviços locais nem leitura de `.env`. A suíte normal usa PGlite em memória.
O PostgreSQL de CI simula Auth via `request.jwt.claim.sub`: não comprova login real,
JWT emitido pelo Auth nem transporte PostgREST. A migração completa e grants/RLS/RPCs
são executados efetivamente no PostgreSQL, sem mock de concorrência.

Paginação por offset tem ordem estável em conjunto inalterado; escritas entre
páginas podem deslocar linhas. Não é exportação consistente nem snapshot analítico.
Bloqueios amplos das atribuições do ator privilegiam correção; contenção/deadlocks
com alterações administrativas simultâneas podem abortar e exigir nova leitura.
Não há garantia de ausência de abortos sob todo interleaving administrativo.

Resultados efetivamente executados, SHA e CI ficam no registro de validação e na PR.
Homologação manual, aplicação em banco persistente, papéis reais, telas, dashboard,
Excel, importação, deploy e PROD estão **NÃO EXECUTADOS / FORA DE ESCOPO**.
O titular revisa o diff e decide o merge; não houve segunda revisão humana.

## Preservação e próxima decisão

Nenhuma migration anterior é editada. Não existe plano de apagar linhas/retornar
schema automaticamente: antes de qualquer aplicação persistente, o responsável
deve aprovar inventário, preservação e procedimento operacional. Em defeito futuro,
preferir revogar EXECUTE das assinaturas e corrigir por nova migration, preservando
entradas e auditoria. Esse procedimento é proposta para revisão, sem execução aqui.
Próximos gates: CI, revisão/aceite do titular e decisão explícita de merge;
concessões reais e aplicação em ambientes continuam decisões separadas. VEN-03 e
VEN-04 exigem autorização própria. **Produção: NO-GO.**
