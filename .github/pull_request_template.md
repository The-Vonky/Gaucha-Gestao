## Objetivo, contexto e escopo

- Issue/brief aprovado:
- Responsável humano pela decisão:
- Módulo / proprietário dos dados:
- O que mudou (AS-IS anterior → novo comportamento):
- Fora de escopo / dependências:
- Documentação canônica/ADR envolvidos:

## Isolamento e riscos

- [ ] Branch/worktree exclusiva; alterações concorrentes nos mesmos arquivos coordenadas
- [ ] Runtime de testes exclusivo; sem acesso a PROD, DEV compartilhado ou banco persistente não autorizado
- [ ] Nenhuma migration já aplicada foi editada; alterações incrementais e plano de reversão analisados
- [ ] Sem segredos, dados pessoais/financeiros reais, senhas, JWTs, dumps ou URLs assinadas no diff/logs
- [ ] Impacto em Auth/RLS/Storage, escopos, concorrência e auditoria revisado quando pertinente
- [ ] Não há deploy, reset, migração remota nem exclusão de volumes implicitamente autorizados
- [ ] **Documentação em pt-BR**, preservados comandos/identificadores; fluxos, ADRs, roadmap e diagramas atualizados quando mudaram

## Validação realmente executada (informar SHA e resultado)

- Baseline / HEAD testado:
- Typecheck e lint:
- Testes unitários / banco RLS:
- Testes de integração / E2E:
- Build, verify:build e `npm audit`:
- Links e renderização de diagramas (se documental):
- Revisão de diff e autorização/escopo:
- Homologação manual/dispositivos (ou **NÃO EXECUTADO**):

## Revisão e integração

- [ ] `validate`, `action-plans-integration` e `infra-validate` aprovados quando exigidos
- [ ] Revisão humana independente apropriada ao risco registrada
- [ ] Se houve aprovação **verbal**, foi documentada como tal (não como review formal `APPROVED`)
- [ ] Comentários e conflitos resolvidos; branch sincronizada com `main`
- [ ] Limitações, riscos residuais e rollback/forward-fix documentados
- [ ] Produção, dados persistentes e decisões bloqueadas continuam sem alteração, exceto autorização específica

**Pendências e provas que não foram executadas:**

**Impacto operacional / segurança / disponibilidade:**

> CI verde não autoriza produção. Seguir [AGENTS.md](../AGENTS.md), [protocolo paralelo](../docs/development/PARALLEL_AGENT_WORKFLOW.md) e os gates P1–P9/O1–O8.
