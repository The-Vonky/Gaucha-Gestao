# Roteiro de migração dos módulos

**Revisão em 25/11/2026, baseline `e0b6f5c`.** O [Mapa de Implementação](../architecture/IMPLEMENTATION_MAP.md) acompanha código, contratos e testes. O [Guia Mestre GG-01–GG-15](../planning/GUIA_MESTRE_PREPARACAO_USO_GAUCHA_GESTAO_2026-11-04.md) governa as pendências de preparação. Aqui ficam as dependências entre entregas, a preparação para eventual migração e o trabalho ainda em descoberta. **PROD NO-GO.**

## Fundação e primeira entrega operacional

O Core, Auditorias e Planos de Ação estão integrados. Qualidade v1 permanece como primeira entrega operacional segundo o [Plano Diretor](../planning/PLANO_DIRETOR_2026.md), com evolução funcional no repositório, incluindo a [exclusão de auditorias e planos de ação](../modules/audit/EXCLUSAO_DEFINITIVA.md), e com escopo e gate próprios [P1–P9/O1–O8](../modules/audit/QUALITY_ACCEPTANCE_V1.md). Identity GG-05B existe no DEV opt-in e tem pendências de recuperação, revisão e adoção previstas no [Guia Mestre](../planning/GUIA_MESTRE_PREPARACAO_USO_GAUCHA_GESTAO_2026-11-04.md).

## Módulos integrados com trabalho de homologação ou evolução

| Domínio | Dependências e próximo marco |
| --- | --- |
| **Curva ABC** | Domínio, correções de importação e analytics integrados (PRs #69, #78–81). Validar XLSX ERP/Excel em [D13/#86](https://github.com/The-Vonky/Gaucha-Gestao/issues/86) e fechar as lacunas aplicáveis na [matriz de equivalência](../modules/abc/MATRIZ_EQUIVALENCIA_LEGADO.md). A [#70](https://github.com/The-Vonky/Gaucha-Gestao/issues/70) encerrada registra o acompanhamento anterior. Histórico do desktop, novos cadastros e métricas dependem de escopo e decisão próprios. |
| **Vendas / Maquininhas** | **VEN-00** consolidou o recorte (#89). **VEN-01/02/03/04A/04B** integraram fundação, operações, análise, UI e dashboard (#90–94). **VEN-05A** integrou Excel em Lançamentos, filtros, período e histórico autorizado (#98). A [GG-04](../architecture/AUTHORIZATION.md#perfis-institucionais-de-vendas--gg-04) consolidou Sales Manager, Sales Viewer e Platform Administrator (#126), com aceite no DEV. **VEN-05B** (impressão/PDF) e **VEN-06** (reconciliação sintética) permanecem planejadas. **VEN-07** exige QA e homologação do recorte aprovado. **VEN-08** exige recuperação, reconciliação e GO específico de eventual migração e corte. [Sequência completa no VEN-00](../briefs/VEN-00_consolidada_vendas_maquininhas_2026-10-28.md). |
| **Agendamento de Salas** | A frente antecipada C1 incorporou decisões AG-00, base AG-01, operações AG-02 e interface AG-03. A **AG-04** reúne revisão e QA, com novas evidências na PR #134. AG-D5-C vigente (#129) e GG-08/09 (#116) integradas. **AG-05** continua pendente com secretária, responsável e dispositivo físico na [#84](https://github.com/The-Vonky/Gaucha-Gestao/issues/84). A decisão AG-D11 define módulo independente, sem portabilidade ou importação das reservas legadas. [Matriz de aceite](../modules/room-booking/ACCEPTANCE_V1.md). |
| **Comunicados e Relatos** | GG-10/11 são módulos transversais integrados (#117). Relatos com anexos no perfil estrito foi corrigido e homologado no DEV (#133). Publicação, suporte, retenção, recuperação e aceite da candidata seguem os respectivos [contratos GG-10](../modules/announcements/ADMINISTRATION_V1.md) e [GG-11](../modules/feedback/FEEDBACK_V1.md). |

A prioridade da Curva ABC foi antecipada em 19/10, antes da integração da PR #69. A decisão C1 de 23/10 antecipou o desenvolvimento de Salas. Esses marcos são históricos. [Registro de decisões](../planning/DECISION_REGISTER.md) · [Fotografia anterior do roadmap](https://github.com/The-Vonky/Gaucha-Gestao/blob/e0b6f5cf563eb66a45a16e03a9137d36211d9ef3/docs/migration/MODULE_ROADMAP.md).

## Domínios futuros

| Domínio | Situação na plataforma | Dependência de descoberta |
| --- | --- | --- |
| **Registros ISO / Propostas ISO** | Planejado | Identificar domínio real e dono da informação (D11), fluxos, nomenclatura e política de dados. |
| **Pesquisa de Satisfação** | Planejada | Confirmar fontes, questionários, indicadores, anonimato, escopo e tratamento de dados. |
| **Frota** | Planejada | Confirmar sistema-fonte, estágio do legado, responsáveis, escopo de manutenção e integrações. |
| **Planejado × Realizado** | Planejado | Validar fontes, fórmulas, competência, precisão, versões e reconciliação. |
| **ERP de Contratos** | Planejado | Inventário funcional, classificação de dados e anexos, recuperação independente do legado e autorização operacional própria. |

O [blueprint](../planning/MODULE_BLUEPRINTS.md) orienta a descoberta. A sequência histórica de expansão está no [Mapa de Execução arquivado](../history/planning/EXECUTION_MAP.md). A ordem efetiva depende de brief autorizado, relevância, maturidade do legado, recuperação, contratos Core e capacidade de homologação.

## Gate para cada módulo novo

Antes da implementação, registrar dono, inventário funcional e de dados, regras/cálculos críticos, classificação, contratos Core, autorização, plano de testes e critérios de aceite. Para um módulo com legado, planejar migração, reconciliação, preservação da origem, backup, restore e rollback. Consulte os [contratos de leitura do Core](../architecture/CORE_FOUNDATION_V2.md#8-consumo-pelos-módulos-e-contratos-de-leitura) e o [inventário histórico de consumidores](../history/architecture/CORE_CONSUMER_CONTRACT_MAP_V1.md).

Antes do corte, demonstrar equivalência ou diferenças aprovadas, permissões por escopo, reconciliação origem/destino, recuperação verificável e assinatura do responsável. Preservar standalone e dados até decisão autorizada de congelamento/retirada. Para Salas, a decisão AG-D11 prevê preservar a instalação anterior intacta e tratar eventual substituição como operação separada.
