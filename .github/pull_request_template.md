## Objetivo, contexto e escopo

- Issue/brief aprovado:
- Responsável humano pela decisão:
- Módulo / proprietário dos dados:
- O que mudou (AS-IS anterior → novo comportamento):
- Fora de escopo / dependências:
- Documentação canônica/ADR envolvidos:

## Isolamento e riscos

- [ ] Branch da tarefa identificada; checkout do notebook preparado para homologação; worktree extra somente se justificada; conflitos reais coordenados
- [ ] Reutilizado o Supabase/Docker local existente quando aplicável, sem provisionamento desnecessário; nenhuma alteração em PROD/STAGING/banco remoto sem autorização
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

## Entrega para homologação no notebook (ANTES do merge)

- Checkout/pasta que serve o localhost (não inserir caminhos sensíveis):
- Branch e SHA entregues para teste:
- URL local e smoke test executado (ou **NÃO EXECUTADO**):
- Banco/migrations locais: aplicado e verificado / não necessário / bloqueado (motivo):
- [ ] Para entrega que exige teste manual e **com acesso local**, agente sincronizou o HEAD da PR no checkout usado pelo localhost e comprovou o SHA (**N/A motivado** se não aplicável).
- [ ] Quando **sem acesso ao notebook**, foi registrado **PENDENTE DE SINCRONIZAÇÃO LOCAL** e fornecido procedimento específico, sem declarar pronto para homologação (**N/A motivado** quando sincronizado).
- [ ] Para funcionalidade testável, o mantenedor homologou no localhost **antes** da autorização de merge; registrar aceite ou pendências (**N/A motivado** para alteração apenas documental).

## Revisão e integração

- [ ] `validate`, `action-plans-integration` e `infra-validate` aprovados quando exigidos
- [ ] Aceite local e decisão de merge do mantenedor registrados (se único desenvolvedor, indicar que não houve segunda revisão e quais testes/checagens compensam esse risco)
- [ ] Se houve aprovação **verbal**, foi documentada como tal (não como review formal `APPROVED`)
- [ ] Comentários e conflitos resolvidos; branch sincronizada com `main`
- [ ] Limitações, riscos residuais e rollback/forward-fix documentados
- [ ] Produção, dados persistentes e decisões bloqueadas continuam sem alteração, exceto autorização específica

**Pendências e provas que não foram executadas:**

**Impacto operacional / segurança / disponibilidade:**

> CI verde e PR publicada não significam que o notebook foi atualizado. A homologação local precede o merge. A atualização do checkout do notebook **não** autoriza mudanças na C30/STAGING/PROD. Seguir [AGENTS.md](../AGENTS.md), [protocolo paralelo](../docs/development/PARALLEL_AGENT_WORKFLOW.md) e os gates P1–P9/O1–O8.
