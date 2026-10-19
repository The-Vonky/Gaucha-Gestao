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
| Reserva de Salas | Standalone concluído, requer revisão | Levantar reservas, conflito de agenda, recurso, recorrência e regras de cancelamento |
| Frota | Origem em desenvolvimento | Identificar sistema-fonte, entidades, responsáveis, escopos e fluxos reais |
| Planejado × Realizado | Standalone concluído, requer revisão | Levantar fórmulas, periodização, versões, centavos/precisão e conciliação |
| Curva ABC | Origem em desenvolvimento; risco maior | Levantar regras de classificação, fontes, históricos, importações e limites de escopo |
| ERP de Contratos | Standalone concluído; risco alto | Verificar backup/restore do legado, contratos, anexos, permissões e integridade |

As descrições de funcionalidades em futuro são **perguntas de discovery**, não requisitos validados. Nenhum dos oito módulos futuros é identificado como implementação integrada em apps/web/src/modules na fotografia de 19/10/2026.

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

**Ordem de expansão candidata:** após Qualidade aceita, resolver gate ISO/Propostas → Vendas → Satisfação → Salas → Frota → Planejado×Realizado → ABC → Contratos; prioridade pode mudar por decisão formal e risco do inventário.
