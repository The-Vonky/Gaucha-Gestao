## Objetivo e escopo

- Issue/brief:
- Responsável humano:
- O que foi implementado:
- Fora do escopo / dependências:

## Isolamento e riscos

- [ ] Branch/worktree exclusiva; sem alterações concorrentes nos mesmos arquivos
- [ ] Ambiente de testes isolado; sem acesso a produção ou banco compartilhado
- [ ] Nenhuma migration já aplicada foi editada
- [ ] Sem segredos, dados reais, senhas, JWTs ou URLs assinadas em código, commits e logs
- [ ] Efeitos em Auth/RLS/Storage/concorrência foram analisados quando pertinentes
- [ ] Mudanças fora da propriedade inicialmente combinada foram coordenadas

## Validação executada

Descrever os comandos e **resultados reais**; indicar explicitamente os não executados.

- Typecheck / lint:
- Testes unitários:
- Testes de integração / E2E:
- Build / audit:
- Verificação de diff:
- Revisão de autorização/escopo:
- Verificação manual em dispositivos, quando aplicável:

## Revisão e liberação

- [ ] `validate`, `action-plans-integration` e `infra-validate` aprovados quando exigidos
- [ ] Revisão independente por outro humano concluída
- [ ] Conversas de review resolvidas
- [ ] Nenhum merge, deploy ou migração em produção será executado automaticamente
- [ ] Riscos residuais e ações de rollback/forward-fix documentados, se aplicável

**Pendências / limitações conhecidas:**

**Notas de impacto operacional:**

> CI verde não significa produção autorizada. Seguir `docs/development/PARALLEL_AGENT_WORKFLOW.md` e os gates P1–P9/O1–O8.
