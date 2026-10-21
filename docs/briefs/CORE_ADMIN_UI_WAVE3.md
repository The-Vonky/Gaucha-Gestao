> **Documento histórico — brief da Fundação Core v2.** Os nomes de branches, bases e estados abaixo pertencem ao plano original. **Não recriar branches antigas nem iniciar implementação por este texto**: confirmar o código da `main`, a issue atual e as regras do [AGENTS.md](../../AGENTS.md). Tradução editorial para pt-BR; decisões e restrições originais foram preservadas.

# Administração Core — Onda 3 de interfaces, coordenação original

**Estado histórico: PRONTO PARA DESENVOLVIMENTO; sem deploy/merge direto à main.**  
**Base:** `integration/core-foundation-v2-wave2`, contratos Core até merge `941beda77031e1e8f8a63af15996b2036855c8c4`.

## Resultado esperado

Três visões **somente de leitura** para operadores usando RPCs Core integradas; não redesenhar RBAC nem inventar permissões.

## Propriedade concorrente (histórica, sem sobreposição)

- **A — Acesso do usuário:** `UsersPage.tsx`, novos `UserAccessReview.tsx`, `user-access-review-api.ts`, `user-access-review.css`, `tests/user-access-review.test.tsx`. Não mexer em `UserAssignments.tsx`.
- **B — Acesso da unidade:** novos `UnitAccessReview.tsx`, `unit-access-review-api.ts`, `unit-access-review.css`, `tests/unit-access-review.test.tsx`. Não mexer simultaneamente em `OrganizationPage.tsx`/`SectorUnits.tsx`; integrador monta componente após merge.
- **C — Logs legíveis:** `LogsPage.tsx`, novos `audit-log-review-api.ts`, `audit-log-review.css`, `tests/audit-log-review.test.tsx`. Não mexer em APIs/tipos Admin compartilhados.

**Arquivos transversais reservados à integração:** `apps/web/src/core/admin/api.ts`, `apps/web/src/core/types.ts`, `apps/web/src/core/admin/admin.css`, `apps/web/src/core/admin/parts.tsx`, `apps/web/src/app/App.tsx`, `apps/web/src/shared/**`, `tests/admin.test.tsx` e `tests/admin-api.test.ts`. Qualquer exceção depende de passagem explícita.

## Segurança

UI read-only; RLS/RPC têm autoridade. Não usar `service_role`, contornar permissões nem expandir diretório de usuários. Dados restritos/desconhecidos devem aparecer como **restritos/desconhecidos**, nunca falsamente 0/vazios. Responsabilidade, membro de papel e capacidade efetiva são conceitos diferentes. Referências históricas só para autorizados; UUID/JSON são detalhes secundários. Nenhuma mutação de negócio ou ciclo de contas.

## UX

Seguir Elo. Linguagem pt-BR simples. Responsivo em 375/768/1024/1440 px, rótulos e botões acessíveis, estados carregando/vazio/negado/erro, filtros e paginação estáveis. Evitar scaffolding abstrato desnecessário.

## CI e aceite da época

Em cada branch: testes focados, typecheck, lint, `npm test`, build, verify:build, audit. E2E quando stack descartável estiver disponível; declarar blockers, não inventar resultados. PR para a integração histórica sem force-push/merge autônomo. Coordenador confere conflitos e CI combinada.

**Não recriar as branches históricas acima: verificar contrato e implementação atual antes de reabrir qualquer item.**
