# Blueprint dos módulos futuros — planejamento sem suposições

**Status: DISCOVERY / TO-BE.** A arquitetura modular, a sequência e os riscos seguem [MODULE_ROADMAP](../migration/MODULE_ROADMAP.md) e [CORE_CONSUMER_CONTRACT_MAP](../architecture/CORE_CONSUMER_CONTRACT_MAP_V1.md). **Não autoriza iniciar migração nem determina prazo ou custo.**

## Sequência e situação

| Domínio | Situação registrada | Próxima descoberta ou aceite |
| --- | --- | --- |
| Auditoria / Qualidade | Integrado na plataforma | Prioridade é fechar gates físicos P1–P9 e operacionais O1–O8; não reimplementar |
| Planos de Ação | Integrado como domínio transversal | Preservar interfaces públicas ao integrar futuros módulos |
| ISO / Propostas ISO | Legado funcional concluído; nome histórico ambíguo | Resolver se trata propostas comerciais/clientes, ownership, navegação, política de dados |
| Vendas / Maquininhas | VEN-01–04B e VEN-05A integradas | Acompanhar VEN-05B–08 no [roadmap](../migration/MODULE_ROADMAP.md). |
| Pesquisa de Satisfação | Standalone concluído | Levantar questionários, anonimato, indicadores, períodos e tratamento de dados |
| Agendamento de Salas | Fundação, operações e interface integradas, AG-D5-C vigente | Homologar [AG-05](../modules/room-booking/ACCEPTANCE_V1.md). O módulo é independente do legado (AG-D11). |
| Frota | Origem em desenvolvimento | Identificar sistema-fonte, entidades, responsáveis, escopos e fluxos reais |
| Planejado × Realizado | Standalone concluído, requer revisão | Levantar fórmulas, periodização, versões, centavos/precisão e conciliação |
| Curva ABC | **Módulo v1 integrado à main pela PR #69; sem histórico migrado** | Homologar amostras ERP/Excel, versões, regras e RLS. Comparações por unidade e classificação A/B/C são integradas |
| ERP de Contratos | Standalone concluído; risco alto | Verificar backup/restore do legado, contratos, anexos, permissões e integridade |

As descrições de funcionalidades futuras orientam a descoberta. O [mapa](../architecture/IMPLEMENTATION_MAP.md) identifica contratos já integrados e os recortes de validação.

## Template obrigatório antes de cada módulo

Cada brief de módulo deve registrar, com dono do negócio e evidência do sistema de origem: problema, alcance e exclusões, personas, jornadas ponta a ponta em Mermaid, dados/linhagem, fonte da verdade, retenção, classificação, esquema próprio, entidades Core, RBAC e escopos, contratos RPC/Storage e alterações de UI, invariantes/cálculos, cenários negativos, migrations incrementais, integrações, telemetria, métricas de carga, testes de paridade, plano de reconciliação, backup/cutover/rollback, critérios de aceite e decisão humana.

~~~mermaid
flowchart LR
  LEG["Inventário do legado"] --> RULES["Regras e dados reais inventariados sem copiar para DEV"]
  RULES --> SCOPE["Propriedade, Core e autorização"]
  SCOPE --> BRIEF["Brief e contratos aprovados"]
  BRIEF --> IMPL["Módulo isolado + CI/RLS"]
  IMPL --> PAR["Paridade / reconciliação / restore"]
  PAR --> GO{"Aceite humano?"}
  GO -- "Não" --> KEEP["Manter legado intacto"]
  GO -- "Sim" --> CUT["Cutover e rollback definidos"]
~~~

## Guardrails de integração

Core não depende de negócio; business modules só consomem Core/Shared e contratos públicos aprovados de outros módulos. Novos schemas e permissões surgem **quando implementados**, não por antecedência. A migração não é big bang e não deve eliminar standalone antes de backup íntegro, testes, validação de dados e janela de reversão. Não prometer que R2, backup físico, integração com ERP e relatórios cross-module existem antes de comprovação.

**Ordem histórica de expansão:** ISO/Propostas → Vendas → Satisfação → Salas → Frota → Planejado×Realizado → Contratos. Prioridades atuais seguem o [roadmap](../migration/MODULE_ROADMAP.md) e decisões específicas por domínio.
