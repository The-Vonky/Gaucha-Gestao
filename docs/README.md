# Documentação integrada — Gaúcha Gestão

**Catálogo técnico e de planejamento** · reconciliado em 20/10/2026 com a `main` após as PRs #69 e #72 (`6373992`). Produção: **NO-GO**.

> **Padrão de idioma:** toda **documentação nova ou atualizada** deve estar em **português brasileiro (pt-BR)**; preservar literalmente comandos, nomes de schemas, arquivos, contratos, produtos e identificadores oficiais. Arquivos históricos existentes em inglês estão sendo traduzidos progressivamente em PRs documentais, sem mudar decisões aceitas, datas ou evidências. Para agentes, consultar [AGENTS.md](../AGENTS.md), [CLAUDE.md](../CLAUDE.md) e [AI_WORKFLOW](development/AI_WORKFLOW.md). Não declarar o acervo integralmente traduzido sem auditoria de todos os documentos.

> **Estado:** código da Fundação Core v2 e Qualidade v1 na main, mas **produção NO-GO**. Este índice organiza e relaciona documentos existentes; não transforma proposta em decisão, não comprova aceite operacional e não autoriza instalação, migração ou deploy.

## C30 STAGING em funcionamento — atualização operacional de 22/10/2026

Os índices e ADRs históricos preservam suas datas originais. Para o estado efetivamente relatado da ThinkStation C30, consultar [inventário AS-IS](operations/C30_STAGING_AS_BUILT_20261022.md), [runbook de diagnóstico](operations/C30_STAGING_RUNBOOK.md), [lacunas de backup](operations/C30_BACKUP_GAPS.md), [release segura](operations/C30_STAGING_RELEASE_GUIDE.md) e [plano de acesso público para testes](operations/STAGING_PUBLIC_ACCESS_PLAN.md). **STAGING ativo e HTTPS somente em loopback não representam PROD GO nem internet publicada.** O servidor está no commit `f9f041e` e não acompanha automaticamente a `main`.

## Início rápido por objetivo

| Necessidade | Ponto de partida | Aprofundamento |
| --- | --- | --- |
| Entender o produto e seus limites | [README principal](../README.md) | [Estrutura do produto](architecture/PRODUCT_STRUCTURE.md) |
| Enxergar a plataforma e os componentes | [Diagramas AS-IS/TO-BE](architecture/DIAGRAMS.md) | [Visão arquitetural](architecture/OVERVIEW.md) |
| Consultar APIs e RPCs existentes | [Catálogo de interfaces](architecture/API_CONTRACTS.md) | [Mapa de implementação](architecture/IMPLEMENTATION_MAP.md) |
| Entender escolhas tecnológicas, alternativas e trade-offs | [Racional da stack](architecture/TECHNOLOGY_DECISIONS.md) | [ADRs](decisions/), [Integração](architecture/STACK_INTEGRATION.md) |
| Compreender como cada stack se conecta | [Integração das stacks](architecture/STACK_INTEGRATION.md) | [ADR-004](decisions/ADR-004-platform-stack.md), [ADR-006](decisions/ADR-006-infra-v1-reused-hardware.md), [ADR-008](decisions/ADR-008-production-host-thinkstation-c30.md) |
| Entender os fluxos reais de negócio | [Fluxos ponta a ponta](architecture/WORKFLOWS.md) | [Fonte da verdade de Auditorias](modules/audit/AUDIT_SOURCE_OF_TRUTH.md), [Action Plans brief](briefs/ACTION_PLAN_DOMAIN_V1.md) |
| Relacionar funcionalidades com código | [Mapa de implementação](architecture/IMPLEMENTATION_MAP.md) | [Modelo de dados](architecture/DATA_MODEL.md), [Autorização](architecture/AUTHORIZATION.md) |
| Saber o que fazer a seguir | [Mapa de execução e gates](planning/EXECUTION_MAP.md) | [Plano Diretor 2026](planning/PLANO_DIRETOR_2026.md) |
| Ver decisões, incógnitas e impedimentos | [Registro de decisões e lacunas](planning/DECISION_REGISTER.md) | [ADRs](decisions/), [Issue #49](https://github.com/The-Vonky/Gaucha-Gestao/issues/49) |
| Consultar a prova histórica de backup e restore sintético | [Relatório DR-01–DR-09](planning/02_RESTORE_DRILL.md) | [Limites de continuidade](architecture/BACKUP_RECOVERY.md), [Issue #51](https://github.com/The-Vonky/Gaucha-Gestao/issues/51) |
| Operar e recuperar com segurança | [Matriz operacional](operations/OPERATIONS_MATRIX.md) | [Backup e recuperação](architecture/BACKUP_RECOVERY.md), [Infraestrutura de laboratório](../infra/README.md) |
| Avaliar ameaças e controle de acesso | [Modelo de ameaças](architecture/THREAT_MODEL.md) | [Segurança](architecture/SECURITY.md), [ADR-005](decisions/ADR-005-core-authorization.md) |
| Operar e conferir a Curva ABC | [Guia ABC v1](modules/abc/OPERATOR_GUIDE_V1.md) | [Brief ABC](briefs/ABC_DOMAIN_V1.md), [Testes #70](https://github.com/The-Vonky/Gaucha-Gestao/issues/70) |
| Usar o módulo de Qualidade | [Guia do operador (pré-homologação)](modules/audit/OPERATOR_GUIDE_V1.md) | [Aceite da Qualidade](modules/audit/QUALITY_ACCEPTANCE_V1.md) |
| Aceitar a primeira entrega | [Qualidade P1–P9 / O1–O8](modules/audit/QUALITY_ACCEPTANCE_V1.md) | [Matriz de conclusão](modules/audit/QUALITY_COMPLETION_V1.md) |
| Entender a proposta de Agendamento de Salas (ainda não aprovada) | [Brief AG-00](briefs/ROOM_BOOKING_V1.md) | [Critérios de aceite](modules/room-booking/ACCEPTANCE_V1.md), [PR #72](https://github.com/The-Vonky/Gaucha-Gestao/pull/72) |
| Planejar os módulos futuros | [Blueprint por domínio](planning/MODULE_BLUEPRINTS.md) | [Roadmap canônico](migration/MODULE_ROADMAP.md) |
| Evoluir módulos legados | [Roadmap de migração](migration/MODULE_ROADMAP.md) | [Mapa de consumidores Core](architecture/CORE_CONSUMER_CONTRACT_MAP_V1.md) |
| Agentes: regras comuns e instruções específicas | [AGENTS.md](../AGENTS.md) | [CLAUDE.md](../CLAUDE.md), [AI_WORKFLOW](development/AI_WORKFLOW.md) |
| Contribuir com vários agentes | [Protocolo paralelo](development/PARALLEL_AGENT_WORKFLOW.md) | [AGENTS](../AGENTS.md), [Template PR](../.github/pull_request_template.md) |

## Mapa visual do acervo

~~~mermaid
flowchart TD
  HOME["README principal"] --> INDEX["docs/README — índice"]
  INDEX --> V["DIAGRAMS — visão AS-IS / TO-BE"]
  INDEX --> S["STACK_INTEGRATION — interfaces e ambientes"]
  INDEX --> WHY["TECHNOLOGY_DECISIONS — racional da stack"]
  INDEX --> ABC["ABC — operação e conferência"]
  INDEX --> F["WORKFLOWS — jornadas e exceções"]
  INDEX --> I["IMPLEMENTATION_MAP — rastreabilidade"]
  INDEX --> P["EXECUTION_MAP — fases e gates"]
  INDEX --> D["DECISION_REGISTER — pendências"]
  INDEX --> O["OPERATIONS_MATRIX — operação"]
  INDEX --> T["THREAT_MODEL — ameaças"]
  V --> ADR["ADRs aceitos / propostos"]
  S --> ADR
  F --> CANON["Briefs e contratos dos módulos"]
  I --> CODE["Código / migrations / testes"]
  P --> MASTER["PLANO_DIRETOR_2026"]
  P --> ACCEPT["QUALITY_ACCEPTANCE_V1"]
  O --> REC["BACKUP_RECOVERY e infra/README"]
  T --> SEC["SECURITY e AUTHORIZATION"]
~~~

## Classes de evidência e hierarquia

- **IMPLEMENTADO / AS-IS:** comportamento verificável no código do commit indicado e sua documentação contratual; CI anterior não prova execução no novo commit nem ambiente de produção.
- **DECIDIDO:** ADR com status Accepted, observadas substituições parciais. ADR-004 continua válido **exceto host**, alterado por ADR-008. ADR-006 continua marcado Proposed apesar de seu perfil mínimo estar implementado e validado em CI.
- **PLANEJADO / TO-BE:** topologia, serviço, roteiro ou meta futura. Não declarar como provisionado.
- **PENDENTE / BLOQUEADO:** falta decisão humana, evidência, requisito numérico, homologação ou aprovação. Falta de evidência não vira PASS.
- **HISTÓRICO:** docs datados/briefs/PRs podem registrar fotografia anterior à main e precisam ser lidos junto da implementação atual.

Em conflito: **o código e os testes revelam o comportamento atual**, mas não autorizam novos comportamentos; **ADRs aceitos** controlam decisões; o [Plano Diretor](planning/PLANO_DIRETOR_2026.md) rege sequência/gates; briefs aprovados regem escopo. Registrar e corrigir divergências por PR, nunca resolvê-las tacitamente.

## Regra de manutenção documental

Toda PR que mude uma jornada, schema/RPC, permissão, dependência, integração, topologia, risco ou gate deve atualizar **no mesmo diff** o documento canônico atingido e seus diagramas/mapas, com commit-base, estado AS-IS/TO-BE, link para issue/ADR e evidência de validação. Não duplicar uma regra detalhada em vários arquivos: manter resumo + link para fonte canônica. Revisão de produção e novas tecnologias exigem aprovação humana/ADR; este índice não substitui nenhuma das duas.

### Escopo e limites deste catálogo

O catálogo original foi preparado em 19/10 e reconciliado em 20/10 com a `main` após as PRs #69 e #72. O brief de Agendamento de Salas foi integrado como documento **proposto, sem aprovação funcional ou implementação**. Curva ABC v1 está integrada ao código, mas sem homologação de produção; a Issue #68 registra DEV compartilhado, não PROD. Não foram executados testes, testes físicos, restore, benchmark, instalação ou consulta a ambientes operacionais. PRs abertos podem evoluir depois desta fotografia; confirme seu estado antes de agir.
