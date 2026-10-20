# Blueprint dos módulos futuros — planejamento sem suposições

**Status: DISCOVERY / TO-BE.** A arquitetura modular, a sequência e os riscos seguem [MODULE_ROADMAP](../migration/MODULE_ROADMAP.md) e [CORE_CONSUMER_CONTRACT_MAP](../architecture/CORE_CONSUMER_CONTRACT_MAP_V1.md). **Não autoriza iniciar migração nem determina prazo ou custo.**

## Sequência e situação

| Domínio | Situação registrada | Descoberta necessária antes de implementar |
| --- | --- | --- |
| Auditoria / Qualidade | Integrado na plataforma | Prioridade é fechar gates físicos P1–P9 e operacionais O1–O8; não reimplementar |
| Planos de Ação | Integrado como domínio transversal | Preservar interfaces públicas ao integrar futuros módulos |
| ISO / Propostas ISO | Legado funcional concluído; nome histórico ambíguo | Resolver se trata propostas comerciais/clientes, ownership, navegação, política de dados |
| Vendas / Maquininhas | Standalone concluído | Levantar importação, conciliação, totais, unidades, autorização e paridade |
| Pesquisa de Satisfação | Standalone concluído | Levantar questionários, anonimato, indicadores, períodos e tratamento de dados |
| Reserva de Salas | Brief AG-00 integrado como documentação na PR #72, **PROPOSTO**, não implementado | [ROOM_BOOKING_V1](../briefs/ROOM_BOOKING_V1.md) e [ACCEPTANCE_V1](../modules/room-booking/ACCEPTANCE_V1.md): validar legado, secretária, permissões, privacidade, horário, conflitos e sequência do roadmap antes do AG-01 |
| Frota | Origem em desenvolvimento | Identificar sistema-fonte, entidades, responsáveis, escopos e fluxos reais |
| Planejado × Realizado | Standalone concluído, requer revisão | Levantar fórmulas, periodização, versões, centavos/precisão e conciliação |
| Curva ABC | **Módulo v1 integrado à main pela PR #69; sem histórico migrado** | Homologar amostras ERP, versões, regras, RLS; comparações/exportação/categorias são etapas posteriores |
| ERP de Contratos | Standalone concluído; risco alto | Verificar backup/restore do legado, contratos, anexos, permissões e integridade |

As descrições de funcionalidades em futuro são **perguntas de discovery**, não requisitos validados. A PR #72 acrescentou somente o brief e a matriz de aceite de Agendamento de Salas, ainda sem aprovação da secretária/dono funcional; não antecipar AG-01 nem alterar a ordem canônica do roadmap por inferência. A Curva ABC saiu da lista de módulos futuros ao integrar a PR #69 em 20/10/2026. Os outros domínios permanecem sem migração concluída; o merge não equivale a liberação produtiva.

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

**Ordem de expansão candidata:** após Qualidade aceita, resolver gate ISO/Propostas → Vendas → Satisfação → Salas → Frota → Planejado×Realizado → Contratos; prioridade pode mudar por decisão formal e risco do inventário.
