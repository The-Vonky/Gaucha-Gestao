# Roteiro de migração dos módulos

**Estado revisado em 21/10/2026:** este documento organiza a **sequência candidata** de migrações, sem prometer prazos ou autorizar implementação. A fonte de prioridades e gates é o [Plano Diretor](../planning/PLANO_DIRETOR_2026.md). A Curva ABC **v1 foi integrada à main na PR #69**; Agendamento de Salas tem somente brief AG-00 **proposto**. **PROD NO-GO.**

## Finalidade e critérios de sequenciamento

A sequência leva em conta: prioridade atual do negócio; validação da fundação; reaproveitamento de sistemas estáveis; redução de risco antes de domínios complexos.

## Inventário da migração

| Módulo | Situação da origem / plataforma | Risco inicial | Limite e próxima ação |
| --- | --- | --- | --- |
| Auditoria de Qualidade | **v1 implementada na plataforma** | Médio/alto | P1–P9 físicos e O1–O8 operacionais ainda exigem aceite; não reimplementar funcionalidades concluídas |
| Registros ISO / Propostas ISO | Legado concluído | Médio | A origem é funcionalmente de propostas/clientes comerciais apesar do nome histórico ISO; resolver ownership/menu por gate de migração |
| Vendas / Maquininhas | Legado concluído | Baixo | Dashboard e importação |
| Pesquisa de Satisfação | Legado concluído | Baixo | Boa candidata à integração por unidade/período |
| Agendamento de Salas | Legado funcional, experiência frágil; **brief AG-00 proposto** | Baixo | Considerar nova implementação apoiada no Core; [brief](../briefs/ROOM_BOOKING_V1.md) e [aceite](../modules/room-booking/ACCEPTANCE_V1.md) requerem aprovação do responsável e secretária |
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

## Fase 2 — Domínios estáveis iniciais (candidatos, após Qualidade)

1. Resolver a classificação funcional e a propriedade do legado `Registros_ISO-Gaucha`/Propostas ISO.
2. Vendas / Maquininhas.
3. Pesquisa de Satisfação.
4. Agendamento de Salas (**somente após aceite AG-00**).

Esses domínios testam cargas diferentes mantendo migração gradual. A posição do ISO depende de decisão do responsável.

## Fase 3 — Expansão operacional/analítica

1. Frota.
2. Planejado × Realizado.

## Fase 4 — Domínios complexos

1. ERP de Contratos (**após** validação da recuperação e segurança da origem).

A Curva ABC não integra mais a lista de futuras migrações da v1: foi antecipada e implementada em outubro. Funcionalidades adicionais da ABC exigem brief/aceite novos.

## Histórico da mudança de prioridade da ABC (19/10)

O responsável priorizou Curva ABC à frente das fases 2–4 em 19/10. A PR #69 foi integrada em 20/10, com classificação, upload e revisões. **Isso não remove** os gates P1–P9/O1–O8, não migra histórico do repositório `The-Vonky/CurvaABC-Gaucha` e não autoriza uso produtivo antes da homologação [#70](https://github.com/The-Vonky/Gaucha-Gestao/issues/70).

## Gate para cada módulo novo

**Antes da implementação:** identificar repo/versão legado, inventariar comportamento, regras/cálculos críticos, classificação dos dados, mapeamento Core, permissões, estratégia de migração/cutover e critérios de aceite.

**Antes do corte:** validar equivalência funcional ou diferença aprovada, RLS e escopo, reconciliação origem/destino, backup verificado, caminho de restore/rollback e assinatura do responsável.

## Política para sistemas legados

Não apagar nem sobrescrever o repositório standalone durante a migração. Após cutover aprovado: identificar a última versão legado, congelar desenvolvimento comum e preservá-la como referência histórica/recuperação pelo período definido.

**Uma PR documental ou CI verde não equivale à autorização de corte.**
