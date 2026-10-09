# Auditoria de prontidão de consolidação — Core v2

Registro inicial: 2026-10-09. Status: **REVISÃO EM ANDAMENTO**, não é autorização de merge, deploy ou execução de migrations em banco compartilhado.

## Baseline imutável consultada

- `main`: `70cfbae24d10093d1ee94a8e87ce4d0a4af117e5`.
- `integration/core-foundation-v2-wave2`: `9d5a68661bce9cee667ff2b7a88259a58cb7446e`.
- `main...integration` via GitHub compare: **61 commits à frente, zero atrás, 83 arquivos diferentes** (snapshot antes deste PR documental). Não somar contagens de branches filhas: herdam histórico da integração.
- PRs #25–#31: mergeados **na integração**, não na `main`. PR #23 fechado sem merge direto; conteúdo segue na ancestralidade da integração. PR #24 (Identity Boundary/ADR-007) segue **aberto**, não aceito nem integrado.
- CI de integração `37933225921`: 1ª tentativa, jobs `validate` e `action-plans-integration` com sucesso, sem jobs skipped/cancelled.
- `main` run `37669780765`: sucesso **após re-run** (attempt=2); 1ª tentativa: `action-plans-integration` falhou em `node tests/integration/audit-evidence.mjs` com `CHECK_FAILED`; etapas seguintes `unit-cover` e `admin` foram puladas por interrupção. O log registra também `toomanyrequests` em pulls externos de imagens Docker, **sem relação causal comprovada** com o `CHECK_FAILED`. Não catalogar como defeito corrigido nem erro transitório comprovado.
- Evidência de infra reproduzível na `main`: run `37669780931` verde. Não é homologação de produção.

## Escopo de mudanças na integração

- Core/Admin: consultas de referências, governança, logs, novas interfaces, montagem da visão por unidade.
- Alterações existentes em Qualidade/Audit, Planos de Ação, App Shell, shared, workflows, quatro migrations e testes. A revisão de escopo deve verificar as mudanças **fora do Core**, não presumir que 83 arquivos sejam apenas dessa fundação.
- Nenhuma migration aplicada à produção por este trabalho.

## Gatilhos de promoção à main (todos requerem evidência)

- [ ] Revisão dos 83 arquivos e dos 61 commits, aprovação explícita de alterações não-Core, dependências e compatibilidade.
- [ ] Revisão de permissões efetivas, escopos/RLS e ausência de enumeração de usuários por consumidores/UI.
- [ ] Guia de teste manual executado com banco descartável atualizado, desktop e Android real, perfis autorizados/restritos e histórico de revogações.
- [ ] README, AGENTS, arquitetura e briefs com estado factual sincronizado (design histórico × implementação integrada × decisões pendentes).
- [ ] Investigar/reproduzir a causa de `CHECK_FAILED` em `audit-evidence.mjs` no primeiro run da main; registrar evidência, mesmo que não se reproduza.
- [ ] Branch protection/ruleset e checks requeridos da `main` confirmados (a API anteriormente informou `protected=false`).
- [ ] CI completa no HEAD candidato final; sem jobs cancelados/ignorados relevantes. Registrar tentativas e motivos de re-runs, se ocorrerem.
- [ ] PR específico de consolidação para `main`, revisado e **autorizado explicitamente** pelo responsável.
- [ ] CI pós-merge de `main` aprovada; limpar branches somente após checar ancestralidade e ausência de trabalho não promovido.
- [ ] Homologação para produção tratada em gate separado: backup/restore, observabilidade, critérios de Qualidade P1–P9 e O1–O8. Nunca inferir prontidão de produção da CI.

## Estratégia de segurança e continuidade

- Não fazer force-push, reset, migração destrutiva, deploy ou exclusão antecipada de branches.
- Preservar PR #24 como Proposed; não implementar serviço privilegiado de contas antes das decisões de segurança e aprovação do ADR.
- Usar worktrees separados para agentes, testes e integração. Evitar banco Supabase compartilhado.
- A documentação deste PR é **preparatória**; não conclui nenhum gate automaticamente.
