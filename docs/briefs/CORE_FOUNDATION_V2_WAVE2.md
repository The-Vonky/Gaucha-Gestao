> **Brief histórico do Core v2.** As branches de integração, proprietários de arquivos e estados de execução aqui citados valem **somente para a rodada original**. Não iniciar tarefa nova nem recriar essas branches sem uma issue atual aprovada; usar `origin/main` conforme [AGENTS.md](../../AGENTS.md).

# Fundação Core v2 — coordenação da segunda onda

**Estado histórico: PRONTA PARA IMPLEMENTAÇÃO PARALELA.**  
**Baseline histórica:** `integration/core-foundation-v2-wave2`.

## Objetivo

Entregar contratos estáveis de leitura/Admin do Core consumidos pelos módulos, preservando a arquitetura e isolando arquivos entre agentes.

Na época, a branch já continha quick wins Admin até `5d5c9e91fff8a4e167ffed26d4d0647e7336520f`, `CORE_FOUNDATION_V2.md`, `ACCOUNT_LIFECYCLE_V1.md`, `ACCESS_GOVERNANCE_V1.md` e `CORE_CONSUMER_CONTRACT_MAP_V1.md`. Qualidade/Auditoria/Planos ficavam congelados salvo compatibilidade aprovada.

## Trilhas paralelas originais

**A — Resolutores de referência Core:** branch `feat/core-reference-resolvers-v1`, RPCs mínimas para usuários/unidades/setores por ID conhecido, sem enumeração corporativa nem lifecycle/UX; migration aditiva e testes SQL/RLS, sem UI.

**B — Leitura de governança de acessos:** branch `feat/core-access-governance-read-v1`, resumos por usuário/unidade, impacto do perfil e histórico, mantendo RLS; migration e testes, sem mudanças de mutação e sem telas.

**C — Logs sistêmicos legíveis:** branch `feat/core-audit-log-read-model-v1`, projeção/pesquisa autorizada, nome só quando permitido/snapshot existente, IDs originais preservados; migration e testes, sem UI.

**D — Fronteira confiável de identidade:** branch histórica `docs/adr-core-identity-boundary-v1`, definir ADR e brief de runtime confiável, ingress, segredos, operações Auth admin, auditoria, compensação de falhas, healthchecks e deploy. **Somente documentação, sem criar serviço. A proposta antiga não foi aprovada (Issue #49).**

## Regras de exclusividade

A/B/C podiam criar migrations independentes, mas nunca editar migration aplicada; não alteravam Admin React/Shared/Audit/Planos/Auth runtime. D não implementava código. Nenhuma trilha semeava permissões de módulos futuros, enfraquecia RLS, expunha `service_role` ao browser ou criava tabela universal de «pessoas»/anexos.

## Ordem histórica de integração

A/B/C/D concluíam separadamente → revisão de cada delta → merge/rebase serializado em integração → CI completa após cada migration → iniciar consumidores de UI (2B) **somente após contratos prontos**.

**Onda 2B planejada:** revisão de acessos na Administração, dossiê de unidade, logs legíveis; depois de D aceito, runtime de identidade privilegiada/criação/reset/primeiro acesso/Minha Conta. **A condição de D não foi satisfeita** e não deve ser reinterpretada.

## Invariantes permanentes

UUID para referência estável; nomes/códigos para apresentação; entidades inativas preservam histórico; responsabilidade não concede acesso; autorização = permissão + escopo + domínio; Core detém usuários/unidades/setores/RBAC/log, módulos detêm negócio; IDs técnicos disponíveis no detalhe; migrations append-only; nenhum deploy produtivo ou `supabase db reset` em ambiente compartilhado.
