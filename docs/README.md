# Documentação da Gaúcha Gestão

## Desenvolver e operar

| Objetivo | Referência |
| --- | --- |
| Preparar Ubuntu nativo | [Guia Ubuntu](operations/LOCAL_DEV_UBUNTU.md) |
| Preparar Windows com WSL2 | [Guia Windows](operations/LOCAL_DEV_WINDOWS.md) |
| Instalar, retomar, diagnosticar ou recuperar o DEV | [Runbook compartilhado do Compose](operations/DOCKER_LOCAL_STANDARDIZATION.md) |
| Usar Identity no DEV | [Runbook GG-05B](operations/GG_05B_IDENTIDADE_DEV.md) |
| Diagnosticar miniaturas nativas no DEV | [Runbook Storage/imgproxy](operations/AUD_IMG_02_IMGPROXY_LOCAL_RUNBOOK.md) |
| Entender testes de fundação, CI e laboratórios | [Validação da fundação](development/LOCAL_FOUNDATION.md) · [Infraestrutura descartável](../infra/README.md) |
| Trabalhar com agentes e entregar para homologação | [AGENTS.md](../AGENTS.md) · [Coordenação](development/PARALLEL_AGENT_WORKFLOW.md) · [Handover](development/AI_WORKFLOW.md) |
| Diagnosticar ou planejar mudança no STAGING C30 | [Diagnóstico](operations/C30_STAGING_RUNBOOK.md) · [Cloudflare Tunnel](operations/C30_STAGING_CLOUDFLARE_RUNBOOK.md) · [Guia de release](operations/C30_STAGING_RELEASE_GUIDE.md) |
| Preparar continuidade operacional | [Backup e recuperação](architecture/BACKUP_RECOVERY.md) · [Lacunas da C30](operations/C30_BACKUP_GAPS.md) · [Plano operacional](operations/C30_BACKUP_OPERATIONAL_PLAN.md) |

[Instruções do Claude Code](../CLAUDE.md) · [Template de PR](../.github/pull_request_template.md) · [Matriz de operações](operations/OPERATIONS_MATRIX.md)

## Entender arquitetura, contratos e módulos

- [Visão da arquitetura](architecture/OVERVIEW.md) · [ADRs](decisions/) · [Mapa técnico de implementação](architecture/IMPLEMENTATION_MAP.md) · [Contratos de API](architecture/API_CONTRACTS.md)
- [Autorização](architecture/AUTHORIZATION.md) · [Segurança](architecture/SECURITY.md) · [Design GG-05B](architecture/GG05B_IDENTITY_DESIGN.md)
- [Core e governança de acesso](modules/core/ACCESS_GOVERNANCE_READ_V1.md) · [Qualidade e Planos de Ação](modules/audit/OPERATOR_GUIDE_V1.md) · [Checklist e evidências](modules/audit/CHECKLIST_EVIDENCE_V1.md) · [Fotos nos relatórios](modules/audit/REPORT_EVIDENCE_EXPORT.md)
- [Curva ABC](modules/abc/OPERATOR_GUIDE_V1.md) · [Homologação D13](https://github.com/The-Vonky/Gaucha-Gestao/issues/86)
- [Vendas — operações](modules/sales/VEN02_OPERATIONS.md) · [Lançamentos](modules/sales/VEN04A_OPERATIONS_UI.md) · [Análises](modules/sales/VEN03_ANALYTICS.md) · [Dashboard](modules/sales/VEN04B_DASHBOARD_UI.md) · [Exportação](modules/sales/VEN05A_EXCEL_EXPORT.md)
- [Agendamento — AG-D5-C](modules/room-booking/D5C_ADMIN_MODES.md) · [Experiência](modules/room-booking/EXPERIENCE_V1.md) · [Matriz de aceite](modules/room-booking/ACCEPTANCE_V1.md) · [Homologação AG-05](https://github.com/The-Vonky/Gaucha-Gestao/issues/84)
- [Comunicados](modules/announcements/ADMINISTRATION_V1.md) · [Relatos e sugestões](modules/feedback/FEEDBACK_V1.md)

### Referências complementares

- [Diagramas](architecture/DIAGRAMS.md) · [Fluxos](architecture/WORKFLOWS.md) · [Modelo de dados](architecture/DATA_MODEL.md) · [Modelo de ameaças](architecture/THREAT_MODEL.md) · [Estrutura de produto](architecture/PRODUCT_STRUCTURE.md)
- [Integração da stack](architecture/STACK_INTEGRATION.md) · [Racional tecnológico](architecture/TECHNOLOGY_DECISIONS.md) · [Fundação Core v2](architecture/CORE_FOUNDATION_V2.md)
- [Fonte de verdade da Auditoria](modules/audit/AUDIT_SOURCE_OF_TRUTH.md) · [Planos de Ação](briefs/ACTION_PLAN_DOMAIN_V1.md) · [ABC](briefs/ABC_DOMAIN_V1.md) · [Brief de Salas](briefs/ROOM_BOOKING_V1.md) · [Fundação de Vendas](modules/sales/VEN01_FOUNDATION.md) · [UI de Comunicados](ui/GG10_INSTITUTIONAL_ANNOUNCEMENTS.md) · [Design System Elo](briefs/DESIGN_SYSTEM_ELO_V1.md)

Quando um contrato incluir uma fotografia anterior, confira o [Registro de Decisões](planning/DECISION_REGISTER.md), a revisão em uso e a decisão aplicada pela migration. Para Agendamento, a regra integrada é [AG-D5-C](modules/room-booking/D5C_ADMIN_MODES.md).

## Acompanhar prioridades e liberação

- [Guia Mestre GG-01–GG-15](planning/GUIA_MESTRE_PREPARACAO_USO_GAUCHA_GESTAO_2026-11-04.md) — prioridades, evidências e dependências.
- [Plano Diretor](planning/PLANO_DIRETOR_2026.md) · [P1–P9 e O1–O8](modules/audit/QUALITY_ACCEPTANCE_V1.md) — critérios de liberação. **PROD NO-GO**.
- [Registro de Decisões](planning/DECISION_REGISTER.md) · [Roadmap de migração](migration/MODULE_ROADMAP.md) — decisões e sequência de adoção.

## Consultar evidências e histórico

- **Revalidação da C30:** [AS-BUILT de 30/10](operations/C30_STAGING_CLOUDFLARE_AS_BUILT_20261030.md) e [inventário GG-01 de 05/11](operations/C30_GG01_INVENTORY_20261105.md). Confira o ambiente quando houver autorização operacional.
- **Histórico:** [índice de decisões anteriores, validações, experimentos e evolução dos módulos](HISTORY.md).

## Regra de manutenção documental

| Assunto | Fonte principal |
| --- | --- |
| Governança dos agentes | [AGENTS.md](../AGENTS.md) |
| Apresentação e início rápido | [README](../README.md) |
| Navegação | Este portal |
| Estado técnico | [Mapa de implementação](architecture/IMPLEMENTATION_MAP.md) |
| Prioridades e acompanhamento | [Guia Mestre](planning/GUIA_MESTRE_PREPARACAO_USO_GAUCHA_GESTAO_2026-11-04.md) |
| Liberação | [Plano Diretor](planning/PLANO_DIRETOR_2026.md) e matrizes de aceite |
| Decisões | [ADRs](decisions/) e [Registro de Decisões](planning/DECISION_REGISTER.md) |
| Operação e comportamento | [Runbooks](operations/) e [contratos de módulo](modules/) |
| Validações anteriores | [Índice histórico](HISTORY.md) e evidências datadas, com revisão, ambiente, resultado e limites |

Atualize na mesma PR as fontes canônicas afetadas por mudanças de comportamento, contrato, autorização, migration, operação, caminho documental ou artefato referenciado. Vincule as fontes em resumos e índices. Preserve caminhos consumidos por código, testes ou automações e a integridade de registros históricos. Execute [a validação documental](development/LOCAL_FOUNDATION.md#validação-documental). Uma proposta exige decisão rastreável para tornar-se vigente. Integração, CI, homologação local, implantação e GO operacional têm evidências próprias.
