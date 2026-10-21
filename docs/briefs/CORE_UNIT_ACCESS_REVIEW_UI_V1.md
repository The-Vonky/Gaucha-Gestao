> **Brief histórico do Core v2.** As branches de integração, proprietários de arquivos e estados de execução aqui citados valem **somente para a rodada original**. Não iniciar tarefa nova nem recriar essas branches sem uma issue atual aprovada; usar `origin/main` conforme [AGENTS.md](../../AGENTS.md).

# Brief — Interface de revisão de acessos por unidade v1

Ler `AGENTS.md`, `CORE_ADMIN_UI_WAVE3.md`, `ACCESS_GOVERNANCE_READ_V1.md` e `OrganizationPage`.

Desenvolver componente React `UnitAccessReview` **autocontido e exportável**, para montagem posterior pelo coordenador, que:
- chama `core.unit_access_summary` e `core.unit_access_assignments` pelo adaptador `unit-access-review-api.ts`;
- mostra contexto da unidade, totais de usuários/atribuições quando autorizados, origem global/unidade/setor, ativa/revogada, rótulos e filtro setorial seguro;
- distingue visibilidade da unidade da autorização de listar pessoas; contagem restrita **não pode aparecer como zero**;
- diferencia composição nula/restrita, usuários/papéis inativos e grants sobrepostos;
- suporta paginação, carregando/erro/negado/vazio, responsividade e acessibilidade pt-BR.

**Divisão de arquivos histórica:** não alterar `OrganizationPage.tsx`, `SectorUnits.tsx`, API/tipos/CSS compartilhados Admin ou `App.tsx` de outro proprietário; o coordenador montaria após integrar as duas branches. CSS/testes próprios permitidos.

Sem schema, migration, ampliação de acesso ou mutação. Informar se UI está pronta mas **não montada**. Testar casos negativos de privacidade. A PR original seria para `integration/core-foundation-v2-wave2`, sem merge autônomo; **essa instrução não vale para novas tarefas**.
