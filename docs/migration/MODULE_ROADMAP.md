# Roteiro de migração dos módulos

**VEN-05A — 03/11/2026:** exportação Excel do período aplicado e histórico completo
autorizado implementada, **pendente de revisão do mantenedor**, sem homologação ou
implantação. RPC específica, ajustes em aba separada, paginação com detecção de
mudanças, reconciliação exata e testes XLSX/readback. [Contrato e limites](../modules/sales/VEN05A_EXCEL_EXPORT.md).
VEN-04B foi integrada pela PR #94, merge `91bd16b`. Registros abaixo são históricos;
VEN-05B permanece fora do escopo, aguardando revisão da 05A. Em 04/11, refinados
UX, nomes/XLSX e nome do criador; migrations aplicadas somente no notebook
autorizado, com preservação dos dados. Sem STAGING/PROD, merge ou deploy.

**VEN-04B — correção visual de 03/11/2026:** apresentação reconstruída na PR #94,
com quatro KPIs, Panorama, gráficos e cores por UUID, mantendo VEN-03 e permissões.
[Antes/depois, refinamentos de usabilidade e validação atual](../modules/sales/VEN04B_VISUAL_FIDELITY.md).
Diário independente, legendas, seletores mês/ano e toolbar refinados no mesmo escopo.
Revisão visual/merge pelo titular pendentes; VEN-05–08 e PROD NO-GO preservados.

**MEL-01 — 30/10/2026:** limpeza autorizada somente no notebook, catálogo de unidades
vazio, fixtures com teardown físico dirigido e correção de consultas globais sem unidades
(`20261030145036_sales_empty_units.sql`). [Evidências](../modules/sales/VEN04B_MEL01_LOCAL_CLEANUP.md).
PR #94 continua para revisão; sem merge ou deploy.

**Vendas — atualização de 29/10/2026:** VEN-01/02/03 integradas nas PRs #90/#91/#92
(`95589f7`). VEN-04A integrada pela PR #93 (`7ddcd31`):
[operação e contrato auxiliar](../modules/sales/VEN04A_OPERATIONS_UI.md).
VEN-04B autorizada expressamente em 29/10 para frontend, PR e testes sintéticos no
notebook `gaucha-gestao-local`; [dashboard e matriz EQ01–22](../modules/sales/VEN04B_DASHBOARD_UI.md)
e [evidências locais](../modules/sales/VEN04B_LOCAL_VALIDATION.md). MEL-03–06 acrescentam
menu agrupado, entrada gerencial, atalhos contextuais e avisos de cadastro;
[contrato e validação intermediária](../modules/sales/VEN04B_MEL03_06_VALIDATION.md). Implementada para revisão,
sem homologação. VEN-05–08 permanecem dependentes de autorizações próprias.
Correção pré-merge autorizada: composição explícita de sete capacidades de Vendas
no administrador existente, papéis institucionais Sales Manager/Operator e catálogo
local limpo, com teardown que não acumula papéis. [Relatório](../modules/sales/VEN04B_ACCESS_CORRECTION.md).
STAGING/PROD não alterados; nenhuma atribuição automática a funcionários ou migração financeira.

**Melhorias aprovadas em 26/10/2026 após teste manual:** foto privada da sala gerida somente por `room_booking.manage`, status verde/vermelho e contagem pelo relógio do servidor, visão da secretária sem cards de solicitante e histórico geral paginado somente para gestão. D5-B, agenda, pedidos próprios e decisões anteriores preservados. [Contrato, segurança e validação](../modules/room-booking/EXPERIENCE_V1.md).

**Agendamento — atualização de 26/10/2026:** PR #88 mantém AG-01/02/03 e adota D5-B (D5-A revogada): administrador sem gestão; provisionamento do gestor técnico e auditado. [Contrato e evidências](../modules/room-booking/D5B_ACCESS.md). Merge e homologação humanos pendentes; demais decisões e prioridades preservadas.

**Atualização vigente — 26/10/2026:** o responsável ampliou expressamente a PR #88
para AG-02/AG-03, mantendo a branch existente, e autorizou aplicação incremental
não destrutiva no `gaucha-gestao-local`. RPCs e interface implementadas; merge cabe
exclusivamente ao mantenedor. D5-B vigente, sem exigência de segundo revisor.
Os limites históricos abaixo não revogam essa autorização local. Evidências e
pendências atuais em [AG-02/AG-03 local](../modules/room-booking/AG02_AG03_LOCAL.md). C30/STAGING/PROD permanecem fora do escopo.


**Adendo operacional — 23/10/2026:** equipe atual formada por **um único desenvolvedor/aprovador humano**. D5-A aprovada pelo titular, e a falta de revisor humano independente é exceção de governança documentada nas Issues #83/#87, não impedimento para preparar e submeter a PR AG-01. CI, testes de autorização e revisão do próprio titular antes do merge permanecem obrigatórios. Implantação e bancos persistentes não estão autorizados.

**Estado revisado em 23/10/2026 (AG-00 / Issue #83):** este documento organiza a **sequência candidata de desenvolvimento**, sem prometer prazos nem autorizar implantação. A fonte de gates é o [Plano Diretor](../planning/PLANO_DIRETOR_2026.md). Curva ABC **v1 integrada na PR #69**; Agendamento de Salas **antecipado como prioridade comunicada pelo responsável**, porém seu AG-00 permanece **PROPOSTO, sem aceite humano integral**. **PROD NO-GO.**

## Finalidade e critérios de sequenciamento

A sequência leva em conta: prioridade atual do negócio; validação da fundação; reaproveitamento de sistemas estáveis; redução de risco antes de domínios complexos.

## Inventário da migração

| Módulo | Situação da origem / plataforma | Risco inicial | Limite e próxima ação |
| --- | --- | --- | --- |
| Auditoria de Qualidade | **v1 implementada na plataforma** | Médio/alto | P1–P9 físicos e O1–O8 operacionais ainda exigem aceite; não reimplementar funcionalidades concluídas |
| Registros ISO / Propostas ISO | Legado concluído | Médio | A origem é funcionalmente de propostas/clientes comerciais apesar do nome histórico ISO; resolver ownership/menu por gate de migração |
| Vendas / Maquininhas | VEN-01–04B integradas #90–94; VEN-05A Excel implementada, pendente de revisão | Alto: precisão financeira, escopo e concorrência | Mantenedor revisa [contrato VEN-05A](../modules/sales/VEN05A_EXCEL_EXPORT.md), diff/CI, negativos de acesso e limites; decide merge. VEN-05B–08 seguem gates próprios. Sem homologação ou corte. |
| Pesquisa de Satisfação | Legado concluído | Baixo | Boa candidata à integração por unidade/período |
| Agendamento de Salas | Nova implementação independente; AG-00 integrado, AG-01 na PR #88 | Médio: RLS/grants e concorrência requerem teste | Desenvolvimento local com `gaucha-gestao-local` existente, sem criar banco/container extra. Revisão/merge pelo mantenedor único, PR e CI; próximas etapas AG-02 (RPCs) e AG-03 (UI). Sem deploy PROD. Ver [brief](../briefs/ROOM_BOOKING_V1.md) e [matriz](../modules/room-booking/ACCEPTANCE_V1.md). |
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

O responsável comunicou a antecipação de **Agendamento de Salas** na fila de **desenvolvimento**, antes da posição histórica de 4º item da Fase 2. Esta PR AG-00 documenta a escolha, **com D1–D4, D5-B adotada em 26/10, D6–D11, F2/D8 e observações confirmadas pelo responsável; a validação da secretária foi relatada por ele (ainda sem ata formal), e continuam pendentes a revisão do mantenedor, aceite documental/PR e checks**. A antecipação não libera deploy, migração em ambiente persistente, C30/STAGING, GO produtivo nem os gates P1–P9/O1–O8 da Qualidade.

| Etapa | Entrega planejada | Condição de avanço |
|---|---|---|
| **AG-00** | Brief, matriz F/S/C/T/U, decisões, prioridade, validação relatada da secretária e aceite humano rastreável; sem depender do legado | Revisão do mantenedor sobre D5-B, ratificação documental de C1 e integração autorizada |
| **AG-01** | Modelo PostgreSQL, permissões, grants, RLS, datas e exclusividade confirmada | AG-00 e revisão do mantenedor; migration incremental autorizada no local existente, preservando dados |
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

## Agendamento — AG-01 em revisão (23/10/2026)

Responsável autorizou expressamente implementar fundação e abrir PR após AG-00 documental integrado (#85). Schema, catálogo Core e RLS preparados; [contrato e limites](../modules/room-booking/AG01_FOUNDATION.md). AG-02/03 não implementados por esta entrega; revisão final do titular (exceção de mantenedor único `9e20199`), merge, QA, homologação e implantação continuam pendentes.

## Comunicação transversal — GG-10 (05/11/2026)

[Barra compacta](../ui/GG10_COMPACT_VALIDATION_20261105.md) implementada na PR #102:
48 px de referência, leitura em modal, CTA compacto e presets Elo. Aceite visual
pendente do mantenedor. [Administração v1](../modules/announcements/ADMINISTRATION_V1.md)
em branch/PR própria: comunicados persistidos por RPC, capacidade global explícita,
perfil Gestor de Comunicados, histórico e fonte única autenticada. Migration
aplicada somente no localhost autorizado (31→32 migrations), com barra/administração e persistência reais [validadas](../modules/announcements/LOCAL_VALIDATION_20261105.md). JSON público retirado somente
na Entrega B. Homologação operacional, revisão e merge dependem do mantenedor.
GG-11 permanece indisponível. GG-10 não encerrado; PROD NO-GO.

## Agendamento — GG-08 e GG-09

Contato institucional por sala editável pela gestão efetiva e consulta de reservas diretas separada do histórico de solicitações existente. As duas migrations incrementais integram a candidata em revisão. Aplicação persistente, homologação pela secretária e GO operacional seguem como etapas separadas. [Contrato e plano de aplicação](../modules/room-booking/EXPERIENCE_V1.md#gg-08-e-gg-09--contato-e-histórico-de-gestão).
