> **Brief histórico do Core v2.** As branches de integração, proprietários de arquivos e estados de execução aqui citados valem **somente para a rodada original**. Não iniciar tarefa nova nem recriar essas branches sem uma issue atual aprovada; usar `origin/main` conforme [AGENTS.md](../../AGENTS.md).

# Brief — Interface de revisão de acessos por usuário v1

Ler `AGENTS.md`, `CORE_ADMIN_UI_WAVE3.md`, `ACCESS_GOVERNANCE_READ_V1.md` e implementações `UsersPage/UserAssignments`.

Criar visão **somente de leitura** de acessos do usuário em `UsersPage`:
- resumo por `core.user_access_summary`;
- atribuições ativas e, sob demanda, revogadas por `core.user_access_assignments`;
- papel, escopo global/unidade/setor, concessor/data, evidência de revogação quando autorizada;
- `composition_visibility`, efetividade e permission keys **somente como devolvidas pela RPC**; nulo/restrito = «informação restrita», **nunca «sem permissões»**;
- linguagem clara em pt-BR, IDs técnicos secundários;
- estados loading/erro/negado/vazio acessíveis, largura mínima 375 px, paginação e erros que não vazem privacidade.

Preservar CRUD, grants e comportamento existente. **Atribuição ativa não comprova permissão de negócio efetiva.**

Propriedade histórica: apenas `UsersPage.tsx` e novos `user-access-review*`/testes; sem mexer em API/tipos/CSS/parts compartilhados nem migrations.

Testes mockados: leitor apenas usuário, leitor apenas papéis, composição restrita, atribuição revogada, pessoa/papel inativo e paginação; não regredir fluxos existentes. Push normal para a integração original, sem merge — **não usar essa branch antiga agora**.
