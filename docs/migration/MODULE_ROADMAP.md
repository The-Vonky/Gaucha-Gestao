# Roteiro de migração dos módulos

**Estado revisado em 23/10/2026 (AG-00 / Issue #83):** este documento organiza a **sequência candidata de desenvolvimento**, sem prometer prazos nem autorizar implantação. A fonte de gates é o [Plano Diretor](../planning/PLANO_DIRETOR_2026.md). Curva ABC **v1 integrada na PR #69**; Agendamento de Salas **antecipado como prioridade comunicada pelo responsável**, porém seu AG-00 permanece **PROPOSTO, sem aceite humano integral**. **PROD NO-GO.**

## Finalidade e critérios de sequenciamento

A sequência leva em conta: prioridade atual do negócio; validação da fundação; reaproveitamento de sistemas estáveis; redução de risco antes de domínios complexos.

## Inventário da migração

| Módulo | Situação da origem / plataforma | Risco inicial | Limite e próxima ação |
| --- | --- | --- | --- |
| Auditoria de Qualidade | **v1 implementada na plataforma** | Médio/alto | P1–P9 físicos e O1–O8 operacionais ainda exigem aceite; não reimplementar funcionalidades concluídas |
| Registros ISO / Propostas ISO | Legado concluído | Médio | A origem é funcionalmente de propostas/clientes comerciais apesar do nome histórico ISO; resolver ownership/menu por gate de migração |
| Vendas / Maquininhas | Legado concluído | Baixo | Dashboard e importação |
| Pesquisa de Satisfação | Legado concluído | Baixo | Boa candidata à integração por unidade/período |
| Agendamento de Salas | Nova implementação independente do legado; **AG-00 em revisão documental** | Baixo (autorização/privacidade sujeitos a revisão) | Responsável confirmou decisões D1–D11/F2/D8 e relatou validação com secretária; **AG-01 ainda bloqueado** por parecer independente D5-A, aceite documental/PR e CI, mantendo [brief](../briefs/ROOM_BOOKING_V1.md) + [matriz](../modules/room-booking/ACCEPTANCE_V1.md) |
| Frota | Legado não concluído | Médio | Prosseguir na plataforma quando a fundação permitir |
| Planejado × Realizado | Legado concluído | Médio | Preservar regras de importação/cálculo comprovadas |
| Curva ABC | **Plataforma v1 integrada à main** | Alto | Importação, consulta e revisões presentes; validar ERP, dados sensíveis e duas identidades ([Issue #70](https://github.com/The-Vonky/Gaucha-Gestao/issues/70)); nenhum histórico desktop foi migrado |
| ERP de Contratos | Legado concluído | Alto | Revisar backup/restore, propriedade de dados e gate antes de qualquer migração |

## Fase 0 — Arquitetura e fundação

Entregáveis: decisões arquiteturais, autorização, segurança, propriedade de dados, backup/recuperação e primeiro brief. **Sem corte produtivo.**

## Fase 1 — Fundação + Auditoria

**Estado:** software concluído no repositório; homologação física/operacional ainda aberta. A entrega inclui Auditoria, Planos de Ação, duas classes de evidência, relatórios/exportação e Core/Admin necessários ao uso. **Não refazer partes implementadas.**

A primeira fase não está pronta para produção até a conclusão de [QUALITY_ACCEPTANCE_V1](../modules/audit/QUALITY_ACCEPTANCE_V1.md).

Não antecipar capacidades genéricas para todos os módulos futuros.

## Frente antecipada — Agendamento de Salas v1 (priorização C1 de 23/10)

O responsável comunicou a antecipação de **Agendamento de Salas** na fila de **desenvolvimento**, antes da posição histórica de 4º item da Fase 2. Esta PR AG-00 documenta a escolha, **com D1–D4, D5-A no escopo do responsável, D6–D11, F2/D8 e observações confirmadas pelo responsável; a validação da secretária foi relatada por ele (ainda sem ata formal), e continuam pendentes o parecer independente D5-A, aceite documental/PR e checks**. A antecipação não libera deploy, migração em ambiente persistente, C30/STAGING, GO produtivo nem os gates P1–P9/O1–O8 da Qualidade.

| Etapa | Entrega planejada | Condição de avanço |
|---|---|---|
| **AG-00** | Brief, matriz F/S/C/T/U, decisões, prioridade, validação relatada da secretária e aceite humano rastreável; sem depender do legado | Parecer humano independente de segurança D5-A, ratificação documental de C1, revisão/CI da PR #85 e integração autorizada |
| **AG-01** | Modelo PostgreSQL, permissões, grants, RLS, datas e exclusividade confirmada | AG-00 integralmente aceito; migration somente em laboratório isolado |
| **AG-02** | RPCs transacionais, pedido/fila/aprovação/recusa, gestão, observações e auditoria | AG-01 e F2 definidos |
| **AG-03** | **Interface completa**, incluindo agenda, pedidos, fila **e editor da secretária** | Contratos AG-02 estáveis |
| **AG-04** | Revisão/QA com testes negativos, concorrência PG real e matriz F/S/C/T/U | AG-01/02/03 entregues e CI no SHA |
| **AG-05** | Homologação funcional com secretária e responsável, dados sintéticos | AG-04, aceite humano |
| **AG-06** | Eventual transição/desativação operacional do legado ou disponibilização oficial do novo módulo, sem importação/reconciliação automática de dados antigos | GO formal global, P1–P9/O1–O8, continuidade/backups e autorização explícita |

**Conciliação AG-03/04/05:** no plano de 19/10, AG-04 era chamada de interface da secretária e AG-05 de QA; a numeração **canônica** aqui adotada é AG-03 para **toda a interface**, AG-04 para **QA/revisão**, AG-05 para **homologação**. O relatório histórico `AG04_AG05_AUDIT_20261021.md` é preservado como fotografia de 21/10.

## Fase 2 — Demais domínios estáveis candidatos (sequência histórica, sem GO)

1. Resolver a classificação funcional e a propriedade do legado `Registros_ISO-Gaucha`/Propostas ISO.
2. Vendas / Maquininhas.
3. Pesquisa de Satisfação.
**Agendamento de Salas** saiu da **4ª posição histórica** para a frente de desenvolvimento antecipada acima, **condicionada ao AG-00**. Os três itens anteriores continuam candidatos sem autorização implícita de implantação.

Esses domínios testam cargas diferentes mantendo migração gradual. A posição do ISO depende de decisão do responsável.

## Fase 3 — Expansão operacional/analítica

1. Frota.
2. Planejado × Realizado.

## Fase 4 — Domínios complexos

1. ERP de Contratos (**após** validação da recuperação e segurança da origem).

A Curva ABC não integra mais a lista de futuras migrações da v1: foi antecipada e implementada em outubro. Funcionalidades adicionais da ABC exigem brief/aceite novos. Em 21/10/2026 o responsável pediu a recuperação das funções do sistema antigo: correção P0 da importação ([PR #78](https://github.com/The-Vonky/Gaucha-Gestao/pull/78)), modelo de leitura ([PR #79](https://github.com/The-Vonky/Gaucha-Gestao/pull/79)) e seis áreas analíticas ([brief v2](../briefs/ABC_ANALYTICS_V2.md)), todos **em revisão**; decisões D1–D7 pendentes ([matriz](../modules/abc/MATRIZ_EQUIVALENCIA_LEGADO.md)).

## Histórico da mudança de prioridade da ABC (19/10)

O responsável priorizou Curva ABC à frente das fases 2–4 em 19/10. A PR #69 foi integrada em 20/10, com classificação, upload e revisões. **Isso não remove** os gates P1–P9/O1–O8, não migra histórico do repositório `The-Vonky/CurvaABC-Gaucha` e não autoriza uso produtivo antes da homologação [#70](https://github.com/The-Vonky/Gaucha-Gestao/issues/70).

## Gate para cada módulo novo

**Antes da implementação:** identificar repo/versão legado, inventariar comportamento, regras/cálculos críticos, classificação dos dados, mapeamento Core, permissões, estratégia de migração/cutover e critérios de aceite.

**Antes do corte:** validar equivalência funcional ou diferença aprovada, RLS e escopo, reconciliação origem/destino, backup verificado, caminho de restore/rollback e assinatura do responsável.

## Política para sistemas legados

Não apagar nem sobrescrever o repositório standalone durante a migração. Após cutover aprovado: identificar a última versão legado, congelar desenvolvimento comum e preservá-la como referência histórica/recuperação pelo período definido.

**D11 (23/10):** o novo módulo não reutilizará comportamentos, código ou dados do legado, nem exigirá inventário de ZIP/agenda antiga para AG-01. A instalação anterior fica preservada e intocada. Eventual substituição operacional exige GO separado; nenhuma mudança em C30/STAGING/PROD.

**Uma PR documental ou CI verde não equivale à autorização de corte.**
