# VEN-04B — MEL-03 a MEL-06: navegação e experiência visual

Entrega intermediária autorizada em 30/10/2026 na [PR #94](https://github.com/The-Vonky/Gaucha-Gestao/pull/94),
branch `codex/ven-04b-sales-dashboard`, a partir de `d8bb9f67aed71c349f04827e5a46b1c815a59e1d`.
Sem merge, deploy, migration, alteração de papel, RLS ou contrato financeiro.
O SHA da entrega e seus checks ficam registrados na PR; este documento acompanha o mesmo commit.
MEL-01 e correções institucionais anteriores preservadas. MEL-02 e VEN-05–08 fora do escopo.

## Comportamento entregue

| Melhoria | Resultado |
| --- | --- |
| MEL-03 | **Novo lançamento** sempre visível na operação; desabilitado com aviso associado quando não há condição válida. Diferencia catálogo vazio, inativas, ausência de criação, ausência de unidade autorizada, carregamento e erro/retry. Link **Cadastrar unidade** somente com `admin.unit.manage` global. Não abre formulário bloqueado. |
| MEL-04 | Removidas as duas legendas acima dos títulos; títulos **Dashboard gerencial** e **Lançamentos**, descrições e breadcrumb preservados. Nenhuma alteração global em `PageTitle`. |
| MEL-05 | Comercial contém um módulo expansível **Vendas / Maquininhas**, com **Visão geral** e **Lançamentos**, usando o mesmo `MenuBranch`, recuos, destaque, busca e drawer da Curva ABC. Subpáginas filtradas pelas capacidades independentes. Sem item/rota Relatórios. |
| MEL-06 | Um atalho contextual no cabeçalho: **Ir para lançamentos** no dashboard; **Voltar ao dashboard** secundário na operação, ao lado de **Novo lançamento** principal. Atalho ausente sem permissão de destino. Controles gerenciais existentes preservados. |

Um catálogo operacional restrito vazio não comprova ausência global de unidades:
nesse caso a mensagem informa ausência de unidade ativa autorizada. A afirmação de
catálogo global vazio exige grant operacional global e resposta completa bem-sucedida.
O catálogo carrega independentemente da consulta financeira; erro não vira lista vazia.
Nenhuma chamada administrativa adicional serve para descobrir unidades fora do escopo.

## Rotas e filtros

| Endereço | Comportamento |
| --- | --- |
| `/sales` | Dashboard para quem possui `sales.dashboard.read` global/unitária; Lançamentos para acesso exclusivamente operacional. Sem capacidade válida, acesso negado. |
| `/sales?…` | Compatibilidade operacional: `replace` para `/sales/entries?…`, preservando query, hash e estado; inclui `?method=Stone`, unidade, datas e página. |
| `/sales/dashboard` | Visão geral, exclusivamente com `sales.dashboard.read` global/unitária. |
| `/sales/entries` | Operação, com pelo menos uma de `sales.entry.read/create/edit/delete` global/unitária. Cada ação ainda exige sua própria capacidade. |
| `/sales/*` desconhecida | Página não encontrada dentro do módulo, sem rota fictícia. |

Breadcrumb: **Início → Comercial → Vendas / Maquininhas → Visão geral/Lançamentos**.
A entrada do módulo usa redirecionamento substitutivo; os atalhos usam links com
histórico normal, preservando Voltar/Avançar. Competências viram datas inclusivas
(até o último dia do mês, incluindo fevereiro bissexto); datas viram competências.
Stone tem equivalência direta; PIX/ambos usam agregado combinado. O retorno por
estado recupera datas exatas, PIX, página e foco gerencial quando aplicável. Unidade
é revalidada inclusive no estado salvo; sem leitura autorizada no destino, o UUID
não é transferido. Retorno aceita apenas caminhos internos exatos conhecidos.
URLs diretas continuam passando pelo Guard do módulo e pela proteção específica da página.

## Arquivos

- Aplicação: `apps/web/src/app/{App.tsx,navigation.ts}` e `apps/web/src/modules/sales/{SalesModule.tsx,SalesPage.tsx,SalesDashboardPage.tsx,SalesNavigation.tsx,sales.css}`.
- Testes: `tests/sales-ui.test.tsx`, `tests/sales-dashboard-ui.test.tsx`, novo `tests/sales-navigation-ui.test.tsx` e novo `tests/integration/sales-navigation-visual.mjs`.
- Roteiros Auth anteriores adaptados aos novos títulos/atalhos e botão desabilitado: `sales-ui-local.mjs`, `sales-admin-ui-local.mjs`, `sales-dashboard-local.mjs`, `sales-empty-ui-local.mjs`.
- Documentação: contrato VEN-04A/VEN-04B, este relatório, índice, autorização, mapa/diagrama de implementação e roadmap.
- Alterações preexistentes em `package-lock.json` e `supabase/snippets/` preservadas fora da entrega.

## Evidências executadas

| Comando/prova | Resultado real |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test -- --maxWorkers=2` | **804 PASS / 62 arquivos**, 127,16 s |
| Suíte focada UI Vendas/dashboard/navegação | **97 PASS / 3 arquivos** |
| `VEN04A_LOCAL_TEST=gaucha-gestao-local npm test -- tests/sales-operations-database.test.ts tests/sales-units-database.test.ts --maxWorkers=1` | **19 PASS**, PostgreSQL local com ROLLBACK |
| `VEN03_LOCAL_TEST=gaucha-gestao-local npm test -- tests/sales-analytics-database.test.ts --maxWorkers=1` | **15 PASS**, PostgreSQL local com ROLLBACK |
| `npm run build` e `npm run verify:build` | PASS; aviso preexistente de chunk >500 kB |
| `npm audit --audit-level=moderate` | **0 vulnerabilidades**, consulta online concluída |
| `node tests/integration/sales-navigation-visual.mjs` | Chromium PASS, **375/768/1024/1440**, duas telas sem overflow externo, menu mobile, teclado, histórico, compatibilidade, bloqueios e permissões |
| `git diff --check` | PASS |

Os testes incluem criação/edição/exclusão, valores exatos e contratos VEN-03,
Platform Administrator, papéis institucionais, D5-B de Salas e regressões dos demais módulos.
Casos negativos de UI/SQL cobrem gerencial puro, operacional puro, ambos, sem acesso,
setorial, perfil inativo, revogação, unidade externa e URLs diretas. Nenhuma permissão
foi ampliada por navegação. O diff foi revisado pelo agente.

A prova visual usa **frontend e Chromium reais com Auth/RPC interceptados por fixtures**.
Não lê nomes, dados financeiros ou perfis reais e não escreve no Supabase. Os testes
SQL locais usam o runtime existente e fixtures transacionais revertidas. **Não foi
reexecutado Auth/PostgREST real nesta rodada**, nem os quatro roteiros Auth adaptados;
o roteiro de catálogo global vazio exigiria baseline zero e não foi executado sobre
a unidade existente. As provas históricas desses roteiros não são provas deste commit.
Não foi executada nova auditoria integral de acessibilidade nem homologação manual do titular.

## Preservação do notebook

Destino confirmado por `docker ps`/inspeção do helper: `supabase_db_gaucha-gestao-local`,
PostgreSQL em `127.0.0.1:54322`, API em `127.0.0.1:54321`. Vite local existente
reutilizado e preservado. Sem novo banco/container/volume/worktree, reset, seed
persistente, criação/recriação de identidade ou limpeza de dados anteriores.

| Cadastro/estado | Antes | Depois |
| --- | ---: | ---: |
| `core.units` | 1 | 1 |
| `core.sectors` | 13 | 13 |
| `core.profiles` | 77 | 77 |
| `core.roles` | 9 | 9 |
| Migrations locais | 29 | 29 |

Zero triggers de negócio desabilitados ao final. A unidade atual pertence à baseline
do mantenedor e foi preservada; o estado zero da MEL-01 é uma evidência histórica.
Chromium e bibliotecas ausentes foram baixados/extractados em `/tmp`, sem instalar
pacotes no sistema ou alterar a infraestrutura Supabase.

## Screenshots

Fixtures exclusivamente sintéticas; não representam dados ou login real do mantenedor.
Capturas inspecionadas visualmente pelo agente, com animações desativadas.

- [Dashboard e menu expandido — 1440](evidence/ven04b-mel03-06/dashboard-1440.png).
- [Lançamentos — 1440](evidence/ven04b-mel03-06/entries-1440.png).
- [Catálogo vazio e aviso — 1440](evidence/ven04b-mel03-06/entries-empty-1440.png).
- [Menu expandido mobile — 375](evidence/ven04b-mel03-06/menu-mobile-375.png).

## Revisão, limites e reversão

Mantenedor único revisa diff/CI/riscos e decide merge; não houve segunda revisão
humana nem aceite formal presumido. Reversão: reverter o commit de interface desta
entrega; não há schema ou dado persistente a reverter. Status dos checks do novo SHA
é registrado separadamente na PR #94 após o push. CI não substitui homologação
VEN-07/P1–P9/O1–O8. STAGING, PROD, C30 e legado intocados. **PROD NO-GO.**
