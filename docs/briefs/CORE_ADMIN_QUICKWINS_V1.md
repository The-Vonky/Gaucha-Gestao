> **Documento histórico — brief da Fundação Core v2.** Os nomes de branches, bases e estados abaixo pertencem ao plano original. **Não recriar branches antigas nem iniciar implementação por este texto**: confirmar o código da `main`, a issue atual e as regras do [AGENTS.md](../../AGENTS.md). Tradução editorial para pt-BR; decisões e restrições originais foram preservadas.

# Brief de implementação — Melhorias rápidas da Administração Core v1

**Estado histórico: PRONTO PARA IMPLEMENTAÇÃO**  
**Base:** `d2e30774eb7ab354f13edc7968a5b47f1d2a0891`  
**Branch planejada:** `integration/core-foundation-v2`

## Objetivo

Aplicar somente melhorias Core/Admin de baixo risco identificadas na avaliação manual, sem redesenhar lifecycle de contas, RBAC, logs ou módulos de negócio.

## Incluído

1. Busca de unidade/setor por **código de negócio e nome**.
2. Reduzir ruído técnico nas telas: não destacar UUIDs/chaves desnecessárias, mas mantê-las em diagnósticos/detalhes úteis.
3. Substituir texto de produto com jargão de implementação («Auth») por linguagem de operador.
4. Retirar `role_permissions` não utilizado de `UserAssignments`, se comprovadamente sem uso.
5. Tornar erro cliente ambíguo de autorização/versão obsoleta mais honesto, **sem diagnosticar causa não conhecida** a partir de `PGRST116`.

## Fora do escopo

Criar contas, reset de senha, Minha Conta, MFA, consultas novas de revisão de acessos, dossiê de unidade, diretório de autores, impacto de papéis, novas migrations/RPC/policies, comportamento da Qualidade/Planos ou deploy de produção.

## Segurança e compatibilidade

Preservar RLS, semântica de permissões, paginação, versões otimistas e inativação. Sem credenciais privilegiadas. Sem alterar schema.

## Validação original

Typecheck, lint, testes UI/unit afetados, `npm test` completo, build, integração Admin quando viável. Adicionar teste específico para busca código/nome e texto/erros modificados.

## Encerramento previsto à época

Commits pequenos e PR para a branch histórica somente após validações. **Não executar como tarefa nova sem issue vigente.**
