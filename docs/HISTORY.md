# Histórico da Gaúcha Gestão

Use este índice para localizar decisões anteriores, experimentos e evidências de execução. Para desenvolver, operar ou conferir um requisito vigente, comece pelo [portal documental](README.md).

A revisão anterior à reorganização está preservada na [árvore de `1f9dee5`](https://github.com/The-Vonky/Gaucha-Gestao/tree/1f9dee5dce78e4062d8eba2b666511b047056c13/docs). Os ajustes em registros movidos na DOC-04 são de navegação. Os nomes-base foram preservados e permitem localizar os originais nessa revisão. Os artefatos associados permanecem nos caminhos registrados. Datas, ambientes, SHAs e limites da prova estão em cada registro.

## Arquitetura, Core v2 e identidade

Referências vigentes: [arquitetura](architecture/OVERVIEW.md), [Fundação Core v2 e trilha de sistema](architecture/CORE_FOUNDATION_V2.md#11-contrato-da-trilha-de-sistema), [mapa de implementação](architecture/IMPLEMENTATION_MAP.md) e [governança de leitura](modules/core/ACCESS_GOVERNANCE_READ_V1.md).

| Período e ambiente | Assunto e origem | Registros |
| --- | --- | --- |
| Outubro/2026 · inventário de código e legados | Contratos de leitura e ownership que orientaram a onda 2, integrada pela [PR #38](https://github.com/The-Vonky/Gaucha-Gestao/pull/38) | [Mapa de consumidores da época](history/architecture/CORE_CONSUMER_CONTRACT_MAP_V1.md), [brief do mapa](history/development/core-v2/CORE_CONSUMER_CONTRACT_MAP_V1.md), [brief da fundação](history/development/core-v2/CORE_FOUNDATION_CONTRACT_V2.md) e [desenho de governança](history/development/core-v2/CORE_ACCESS_GOVERNANCE_V1.md). O [desenho detalhado de governança](architecture/ACCESS_GOVERNANCE_V1.md) permanece junto das referências de autorização, com a classificação de suas recomendações. |
| Outubro/2026 · branches de integração e CI | Preparação, contratos de leitura e prontidão da onda 2 | [Coordenação](history/development/core-v2/CORE_FOUNDATION_V2_WAVE2.md), [resolutores](history/development/core-v2/CORE_REFERENCE_RESOLVERS_V1.md), [modelo de leitura do log](history/development/core-v2/CORE_AUDIT_LOG_READ_MODEL_V1.md), [brief de governança citado pela migration](briefs/CORE_ACCESS_GOVERNANCE_READ_V1.md), [revisão de integração](history/development/core-v2/CORE_FOUNDATION_V2_INTEGRATION_REVIEW.md) e [auditoria de prontidão](history/development/core-v2/CORE_V2_CONSOLIDATION_READINESS.md). |
| Outubro/2026 · DEV e branches originais | Ondas administrativas e validação da baseline do Core v2 | [Quick wins](history/development/core-v2/CORE_ADMIN_QUICKWINS_V1.md), [coordenação da onda 3](history/development/core-v2/CORE_ADMIN_UI_WAVE3.md), [revisão por usuário](history/development/core-v2/CORE_USER_ACCESS_REVIEW_UI_V1.md), [revisão por unidade](history/development/core-v2/CORE_UNIT_ACCESS_REVIEW_UI_V1.md), [navegação por unidade](history/development/core-v2/CORE_UNIT_ACCESS_NAVIGATION_V1.md), [logs legíveis](history/development/core-v2/CORE_READABLE_LOGS_UI_V1.md) e [teste manual PC/Android e limites](history/development/core-v2/CORE_V2_MANUAL_TEST.md). |
| 08/10 a 23/11/2026 · desenho e DEV pessoal | Alternativas de identidade, proposta encerrada e recortes homologados | [Desenho anterior](history/architecture/ACCOUNT_LIFECYCLE_V1.md), [brief](history/development/core-v2/CORE_ACCOUNT_LIFECYCLE_V1.md), [proposta encerrada sem merge](https://github.com/The-Vonky/Gaucha-Gestao/pull/24), [Issue #49](https://github.com/The-Vonky/Gaucha-Gestao/issues/49), [procedimento e matriz GG-05A](operations/GG_05A_PROVISIONAMENTO.md) e [evidência da PR #127](https://github.com/The-Vonky/Gaucha-Gestao/pull/127). O [contrato GG-05B](architecture/GG05B_IDENTITY_DESIGN.md) vale no perfil DEV opt-in. A [D01](planning/DECISION_REGISTER.md) mantém os gates de identidade e recuperação. |

## Qualidade, Planos de Ação e imagens privadas

Referências vigentes: [Auditoria](modules/audit/OPERATOR_GUIDE_V1.md), [evidências](modules/audit/CHECKLIST_EVIDENCE_V1.md), [relatórios](modules/audit/REPORT_EVIDENCE_EXPORT.md), [Planos de Ação](briefs/ACTION_PLAN_DOMAIN_V1.md), [P1–P9/O1–O8](modules/audit/QUALITY_ACCEPTANCE_V1.md) e [runbook de transformação nativa](operations/AUD_IMG_02_IMGPROXY_LOCAL_RUNBOOK.md).

| Período e ambiente | Assunto e origem | Registros |
| --- | --- | --- |
| Setembro a novembro/2026 · código, DEV e CI | Evolução da Qualidade desde a comparação com o legado e fechamento técnico da v1 | [Mapa de migração de Auditoria](history/migration/MIGRATION_MAP.md) e [matriz factual Qualidade v1](history/modules/audit/QUALITY_COMPLETION_V1.md). |
| 16/10/2026 · teste em memória | Correção de datas do formulário e medição do carregamento da listagem, [PR #65](https://github.com/The-Vonky/Gaucha-Gestao/pull/65) | [Validação do Dia 2](history/development/DAY2_ACTION_PLAN_VALIDATION.md). |
| 04/11/2026 · DEV e CI descartável | Revisão E3, cache volátil e proposta de derivados, PRs [#99](https://github.com/The-Vonky/Gaucha-Gestao/pull/99) e [#101](https://github.com/The-Vonky/Gaucha-Gestao/pull/101) | [Tráfego, políticas de upload e ensaio físico](modules/audit/EVIDENCE_IMAGE_TRAFFIC.md), [validação de tráfego](history/modules/audit/EVIDENCE_IMAGE_VALIDATION_20261104.md), [desenho](history/modules/audit/AUD_IMG_02_DESIGN_20261104.md), [implementação](history/modules/audit/AUD_IMG_02_IMPLEMENTATION_20261104.md), [validação](history/modules/audit/AUD_IMG_02_VALIDATION_20261104.md) e [prova negativa de segurança](history/modules/audit/AUD_IMG_02_REAL_SECURITY_20261104.md). |
| 05–06/11/2026 · DEV pessoal e CI | GO local e executor legado sob `npm run dev`, PRs [#101](https://github.com/The-Vonky/Gaucha-Gestao/pull/101) e [#110](https://github.com/The-Vonky/Gaucha-Gestao/pull/110) | [Runbook da prova GO C](history/modules/audit/AUD_IMG_02_LOCAL_GO_C_RUNBOOK.md), [resultado GO C](history/modules/audit/AUD_IMG_02_LOCAL_GO_C_20261105.md), [executor manual](history/modules/audit/AUD_IMG_02_LOCAL_EXECUTOR_20261105.md), [revisão final](history/modules/audit/AUD_IMG_02_FINAL_REVIEW_20261105.md), [integração do executor](history/modules/audit/AUD_IMG_02_INTEGRATED_DEV_20261106.md), [diagnóstico de CI](history/modules/audit/AUD_IMG_CI_01_DIAGNOSTICO_20261106.md) e [MED-01/AUD-IMG-04](history/modules/audit/MED01_FRONTEND_CLOSURE_20261106.md). |
| 11–12/11/2026 · laboratório e DEV pessoal | Prova da transformação privada nativa Storage/imgproxy, PRs [#119](https://github.com/The-Vonky/Gaucha-Gestao/pull/119)–[#121](https://github.com/The-Vonky/Gaucha-Gestao/pull/121) | [POC e medições](history/modules/audit/AUD_IMG_02_STORAGE_IMGPROXY_POC_20261111.md) e [runbook vigente com a validação de 12/11](operations/AUD_IMG_02_IMGPROXY_LOCAL_RUNBOOK.md). |
| 18/11/2026 · DEV e CI | Compatibilidade de exportação, provas de PDF/XLSX e diagnóstico de dependências, [PR #125](https://github.com/The-Vonky/Gaucha-Gestao/pull/125) | [Finalização técnica](history/modules/audit/PR125_FINALIZACAO_TECNICA_20261118.md) e [artefatos de exportação](modules/audit/evidence/reporting-export-20261118/). |

## Agendamento de Salas

Referências vigentes: [AG-D5-C](modules/room-booking/D5C_ADMIN_MODES.md), [experiência](modules/room-booking/EXPERIENCE_V1.md) e [matriz de aceite](modules/room-booking/ACCEPTANCE_V1.md).

| Período e ambiente | Assunto e origem | Registros |
| --- | --- | --- |
| 21–27/10/2026 · revisão estática e DEV pessoal | Critérios de prontidão, operações e interface originais; [PR #88](https://github.com/The-Vonky/Gaucha-Gestao/pull/88) | [Parecer AG-04/05](history/modules/room-booking/AG04_AG05_AUDIT_20261021.md) e [prova AG-02/03](history/modules/room-booking/AG02_AG03_LOCAL.md), incluindo recortes dos runners antigos e suas limitações. |
| 26/10 e 23/11/2026 · DEV e CI | D5-A revogada, veto administrativo de D5-B superado na [PR #129](https://github.com/The-Vonky/Gaucha-Gestao/pull/129); regressões atualizadas na [PR #134](https://github.com/The-Vonky/Gaucha-Gestao/pull/134) | [D5-B e concessão técnica na baseline anterior](history/modules/room-booking/D5B_ACCESS.md), [capturas](modules/room-booking/evidence/) e [decisões AG](planning/DECISION_REGISTER.md#adendo-ag-d5-c--23112026). O aceite AG-05 segue na [Issue #84](https://github.com/The-Vonky/Gaucha-Gestao/issues/84). |

## Vendas / Maquininhas

Referências vigentes: [operações](modules/sales/VEN02_OPERATIONS.md), [lançamentos](modules/sales/VEN04A_OPERATIONS_UI.md), [analytics](modules/sales/VEN03_ANALYTICS.md), [dashboard](modules/sales/VEN04B_DASHBOARD_UI.md), [Excel](modules/sales/VEN05A_EXCEL_EXPORT.md) e [roadmap VEN-07/08](migration/MODULE_ROADMAP.md).

| Período e ambiente | Assunto e origem | Registros |
| --- | --- | --- |
| 28/10/2026 · decisão documental | Origem das decisões VEN-D01–VEN-D12 e equivalência com o legado | [VEN-00](briefs/VEN-00_consolidada_vendas_maquininhas_2026-10-28.md), mantido no caminho citado pela migration de fundação. |
| Outubro/2026 · DEV pessoal | Evidências de análises, lançamentos e dashboard consumidas pelo catálogo local de testes | [VEN-03](modules/sales/VEN03_LOCAL_VALIDATION.md), [VEN-04A](modules/sales/VEN04A_LOCAL_VALIDATION.md) e [VEN-04B](modules/sales/VEN04B_LOCAL_VALIDATION.md). |
| 29/10 a novembro/2026 · DEV pessoal e CI | Acesso, limpeza autorizada de fixtures, navegação e equivalência visual da [PR #94](https://github.com/The-Vonky/Gaucha-Gestao/pull/94), catálogo institucional consolidado depois na [PR #126](https://github.com/The-Vonky/Gaucha-Gestao/pull/126) | [Correção de acesso](history/modules/sales/VEN04B_ACCESS_CORRECTION.md), [limpeza MEL-01](history/modules/sales/VEN04B_MEL01_LOCAL_CLEANUP.md), [MEL-03–06](history/modules/sales/VEN04B_MEL03_06_VALIDATION.md), [fidelidade visual](history/modules/sales/VEN04B_VISUAL_FIDELITY.md) e [capturas e medições](modules/sales/evidence/). |

## Comunicados, Relatos e interface

Referências vigentes: [Comunicados](modules/announcements/ADMINISTRATION_V1.md), [Relatos](modules/feedback/FEEDBACK_V1.md) e [Design System Elo](briefs/DESIGN_SYSTEM_ELO_V1.md).

| Período e ambiente | Assunto e origem | Registros |
| --- | --- | --- |
| 21/10/2026 · branch experimental | POC isolada de Tailwind v4, `1db89f4`, e condições para adoção | [UI-00](history/development/TAILWIND_V4_UI00.md). |
| 04–10/11/2026 · DEV pessoal e CI | UI, visual compacto, persistência e validação inicial GG-10/GG-11, [PR #117](https://github.com/The-Vonky/Gaucha-Gestao/pull/117) | [Validação da interface](history/modules/announcements/GG10_VALIDATION_20261104.md), [refinamento compacto](history/modules/announcements/GG10_COMPACT_VALIDATION_20261105.md), [validação local de Comunicados](history/modules/announcements/LOCAL_VALIDATION_20261105.md), [validação GG-10/GG-11](history/modules/announcements/GG10_GG11_VALIDATION_20261110.md) e [capturas](ui/evidence/). |
| Novembro/2026 · DEV pessoal com Identity e CI | Correção homologada de anexos privados de Relatos, [PR #133](https://github.com/The-Vonky/Gaucha-Gestao/pull/133) | [Provas de envio, download e negativas](modules/feedback/FEEDBACK_V1.md#provas-da-compatibilidade-com-identity). O aceite integral GG-11 tem escopo próprio. |

## Infraestrutura, recuperação e custódia

Referências vigentes: [backup e recuperação](architecture/BACKUP_RECOVERY.md), [runbook da C30](operations/C30_STAGING_CLOUDFLARE_RUNBOOK.md), [lacunas](operations/C30_BACKUP_GAPS.md) e [plano de backup operacional](operations/C30_BACKUP_OPERATIONAL_PLAN.md). O [AS-BUILT de 30/10](operations/C30_STAGING_CLOUDFLARE_AS_BUILT_20261030.md) e o [inventário GG-01 de 05/11](operations/C30_GG01_INVENTORY_20261105.md) são evidências de apoio à revalidação da C30.

| Período e ambiente | Assunto e origem | Registros |
| --- | --- | --- |
| 16–21/10/2026 · laboratório isolado | Backup/restore a frio, [Issue #51](https://github.com/The-Vonky/Gaucha-Gestao/issues/51) e [PR #62](https://github.com/The-Vonky/Gaucha-Gestao/pull/62), 8 PASS e DR-08 parcial | [Roteiro, relatório, diagrama e limites da prova](history/operations/02_RESTORE_DRILL.md). |
| 22–30/10/2026 · C30 STAGING e revisão documental | Inventário inicial em `c642c24`, plano via ngrok, troca para Cloudflare Tunnel e auditoria dos documentos | [AS-BUILT de 22/10](history/operations/C30_STAGING_AS_BUILT_20261022.md), [plano de acesso substituído](history/operations/STAGING_PUBLIC_ACCESS_PLAN.md) e [auditoria da transição](history/operations/C30_CLOUDFLARE_DOC_AUDIT_20261030.md). |
| 06/11/2026 · laboratórios sintéticos locais | Restic GG-02B e Restic + Rclone GG-02C, PRs [#108](https://github.com/The-Vonky/Gaucha-Gestao/pull/108) e [#111](https://github.com/The-Vonky/Gaucha-Gestao/pull/111) | [POC GG-02B](history/operations/GG02B_RESTIC_LOCAL_POC_20261106.md), [resultados GG-02C](history/operations/GG02C_LAB_RESULTS_20261106.md), [procedimento e custódia GG-02C](history/operations/GG02C_RCLONE_DRIVE_20261106.md) e artefatos dos laboratórios [GG-02B](../tests/labs/gg02b/README.md) e [GG-02C](../tests/labs/gg02c/README.md). |
| 09/11/2026 · Windows e Drive dedicado, massa sintética | GG-02D, [Issue #113](https://github.com/The-Vonky/Gaucha-Gestao/issues/113) e [PR #114](https://github.com/The-Vonky/Gaucha-Gestao/pull/114). Provas, pendências de custódia e recuperação em segundo host | [Registro do ensaio](history/operations/GG02D_DRIVE_SYNTHETIC_20261109.md). |

## Planejamento e decisões anteriores

Referências vigentes: [Guia Mestre GG-01–GG-15](planning/GUIA_MESTRE_PREPARACAO_USO_GAUCHA_GESTAO_2026-11-04.md), [Plano Diretor](planning/PLANO_DIRETOR_2026.md), [Registro de Decisões](planning/DECISION_REGISTER.md), [roadmap](migration/MODULE_ROADMAP.md) e [coordenação atual](development/PARALLEL_AGENT_WORKFLOW.md).

| Período e ambiente | Assunto e origem | Registros |
| --- | --- | --- |
| Outubro/2026 · planejamento | Plano de cinco dias e divisão Dev A/Dev B, issues #46–#59, baseline `fed0e0f` | [Mapa de Execução arquivado](history/planning/EXECUTION_MAP.md) e [descrição original da divisão de trabalho](https://github.com/The-Vonky/Gaucha-Gestao/blob/1f9dee5dce78e4062d8eba2b666511b047056c13/docs/development/PARALLEL_AGENT_WORKFLOW.md#1-responsabilidade-e-limites). |
| 16/10/2026 · proposta de operação | Política de primeira implantação, [Issue #50](https://github.com/The-Vonky/Gaucha-Gestao/issues/50), sem execução | [Dados limpos](history/planning/01_DADOS_LIMPOS.md). |
| 04/11/2026 · planejamento | Protocolo de trabalho e sequenciamento daquela rodada | [Protocolo original](history/planning/PROTOCOLO_DESENVOLVIMENTO_PARALELO_GAUCHA_GESTAO_2026-11-04.md). O [blueprint de descoberta](planning/MODULE_BLUEPRINTS.md) conserva o template de novos briefs e sua sequência histórica. |
| Outubro a novembro/2026 · decisões e revisão de código | Escolha do host substituída pelo ADR-008, mantendo as demais decisões de stack. Descoberta inicial da Curva ABC na [Issue #70](https://github.com/The-Vonky/Gaucha-Gestao/issues/70) | [ADR-004](decisions/ADR-004-platform-stack.md), [ADR-008](decisions/ADR-008-production-host-thinkstation-c30.md) e [matriz de equivalência ABC](modules/abc/MATRIZ_EQUIVALENCIA_LEGADO.md). |
