# Registro de decisões, bloqueios e dívida documental

**Snapshot reconciliado:** 20/10/2026, main após PR #69 (`fed0e0f`). **Não é ata de decisão humana.** Atualizações posteriores de issues/PRs devem ser reconsultadas. Para autoridade, prevalecem ADRs aceitos, [Plano Diretor](PLANO_DIRETOR_2026.md) e evidências de aceite.

> **Adendo de evidência, 22/10/2026:** o STAGING persistente foi instalado na C30 (projeto `gaucha-staging`) e testado por SSH, incluindo HTTPS apenas em loopback. Isso responde **onde o STAGING está operando** para a entrada D06, mas **não** encerra a aprovação formal de isolamento, aceite físico D07, continuidade D02–D04 ou GO D09. Uma URL pública temporária via ngrok é **plano de testes**, não implementação/decisão de produção; ver [AS-BUILT](../operations/C30_STAGING_AS_BUILT_20261022.md), [acesso externo](../operations/STAGING_PUBLIC_ACCESS_PLAN.md) e [lacunas de backup](../operations/C30_BACKUP_GAPS.md).

## Decisões arquiteturais confirmadas

| ID | Conteúdo | Autoridade | Estado |
| --- | --- | --- | --- |
| A1 | Monólito modular | [ADR-001](../decisions/ADR-001-modular-monolith.md) | Accepted |
| A2 | Core detém identidade/organização/autorização; módulos detêm domínios | [ADR-002](../decisions/ADR-002-core-and-module-ownership.md) | Accepted |
| A3 | Planos de Ação são módulo transversal | [ADR-003](../decisions/ADR-003-action-plans-transversal-module.md) | Accepted |
| A4 | React/TS/Vite, Supabase self-hosted, Cloudflare/Storage/R2, Compose, CI, recuperação planejada | [ADR-004](../decisions/ADR-004-platform-stack.md) | Accepted; **host original superado** |
| A5 | RBAC + escopo de unidade/setor, RLS/RPC e default deny | [ADR-005](../decisions/ADR-005-core-authorization.md) | Accepted |
| A6 | Perfil reproduzível de cinco serviços em laboratório/CI | [ADR-006](../decisions/ADR-006-infra-v1-reused-hardware.md) + [infra](../../infra/README.md) | Documento ainda **Proposed**, implementação de CI existente |
| A7 | Lenovo ThinkStation C30, Ubuntu LTS bare metal, host dedicado | [ADR-008](../decisions/ADR-008-production-host-thinkstation-c30.md) | Accepted **como escolha**, ainda não como host operacional |

**ADR-007:** não está em main; antiga proposta do [PR #24](https://github.com/The-Vonky/Gaucha-Gestao/pull/24) foi fechada sem merge. NÃO catalogar como aceita, nem usar seu design como autorização de implementação.

## Decisões ainda devidas ao responsável

| ID | Questão / alternativa | Condição de aprovação | Impacto enquanto aberta |
| --- | --- | --- | --- |
| D01 | Identity Boundary / criação e recuperação de contas (ADR-007) | Novo ADR com provas contra GoTrue pinado, parecer independente e GO explícito; [#49](https://github.com/The-Vonky/Gaucha-Gestao/issues/49) | **P0: runtime privilegiado, migração Auth e cutover bloqueados** |
| D02 | RPO técnico e RTO dentro/fora do horário seg–sex 07–18h | Valores numéricos, cenários e responsáveis aprovados, medidos quando houver infra | O1 e go-live bloqueados; não declarar RPO zero |
| D03 | Retenções para DB/WAL, objetos, dados removidos e logs | Política escrita, justificativa legal/negócio, mecanismos e testes | Purge, custos, compliance e O1/O6 abertos |
| D04 | Ferramenta de backup e PITR, destino independente/off-site, chaves e segurança | Escolher WAL-G/pgBackRest ou equivalente por ADR/ensaio; definir restauração de objetos | O3/O4 bloqueados em PROD |
| D05 | Carga esperada, unidades, usuários simultâneos e latência p95 | Requisitos quantificados e teste sobre C30 Ubuntu | Não há aceite de capacidade |
| D06 | Finalidade do servidor legado e host real do STAGING | Definir isolamento, manutenção, rede e custos | Não implantar staging persistente por inferência |
| D07 | Aceite físico da C30 e preservação do SSD/HD HPE/outros volumes | Laudo, inventário, preservação/restore, autorização de reinstalação; [#48](https://github.com/The-Vonky/Gaucha-Gestao/issues/48), [#52](https://github.com/The-Vonky/Gaucha-Gestao/issues/52) | **Nunca formatar/inicializar sem GO** |
| D08 | Monitoração/alertas, reconciliação Storage, retenção e resposta a incidentes | Runbooks, responsáveis, testes de alerta e prova real | O5/O6/O7/O8 pendentes |
| D09 | Liberação de produção e proteção de main | Decisão documentada de release; proteção main adiada conscientemente no plano v1.3 | Sem enforcement técnico automático: disciplina manual; produção NO-GO |
| D10 | Qualidade v1 em aparelhos Android/iOS e ambientes válidos | [P1–P9 / O1–O8](../modules/audit/QUALITY_ACCEPTANCE_V1.md) com evidência e sign-off | Proibido classificar v1 como homologada |
| D11 | Categoria/ownership real do legado chamado Registros ISO/Propostas ISO | Inventário funcional e dono da informação; [MODULE_ROADMAP](../migration/MODULE_ROADMAP.md) | Implementação de migração ISO bloqueada |
| D12 | Cópia/recuperação de objetos em R2 e política de headers/links | Design testado em staging/infra real | Não assumir que R2, CDN ou signed URL resolvem backup e proteção |
| D13 | Curva ABC (matriz D1): aceitar partes inertes (tema, `docProps/custom.xml`) de planilha salva no Excel | Amostra real reexportada; nova `parser_version`; recusa de imagens/macros/`calcChain` mantida | Planilha salva no Excel é recusada com orientação de reexportar do ERP |
| D14 | Curva ABC (D2): suporte a `.xls` | Recomendação: **não aprovar** (sem leitor seguro no navegador) | `.xls` recusado com mensagem própria |
| D15 | Curva ABC (D3): cadastro de categorias comerciais e associação por código ERP, permissão `abc.category.manage` | Brief com modelo, RLS, auditoria e "Não classificado" explícito | Área Categorias mostra só classes A/B/C; nenhuma inferência por prefixo |
| D16 | Curva ABC (D4): ajuste manual auditável de itens | Brief; manter revisão imutável (tabela de ajustes, `abc.report.adjust`) | Correção somente por nova revisão (reexportação) |
| D17 | Curva ABC (D5): exportação em planilha (e se exige `abc.report.export`) | Decisão de governança sobre exportação | Só impressão/PDF pelo navegador nos Relatórios |
| D18 | Curva ABC (D6): comparação entre unidades | Confirmação de que o código ERP identifica o mesmo produto em todas as filiais; leitura das duas unidades | Comparação somente dentro de uma unidade |
| D19 | Curva ABC (D7): repetir "período fechado" na RPC de publicação | Aprovação de migration pequena | Regra aplicada só na prévia do navegador |

**Registro de decisão:** cada Dnn exige uma issue/ADR ou ata referenciável contendo autor, data, alternativas, impacto, aprovação, SHA e requisitos de testes. Apenas a existência de exemplo de env, diagrama ou PR Draft **não resolve** o item.

## Agendamento de Salas — adendo de decisões AG-00 (23/10/2026)

**Origem e autoridade:** escolhas relatadas pelo responsável no plano local e na [Issue #83](https://github.com/The-Vonky/Gaucha-Gestao/issues/83), comparadas ao [brief](../briefs/ROOM_BOOKING_V1.md), [aceite](../modules/room-booking/ACCEPTANCE_V1.md) e [roadmap](../migration/MODULE_ROADMAP.md). Em **23/10/2026**, o responsável também confirmou expressamente D1/D4/D6/D7/D9/D10/D11 e a lista fechada dos campos corrigíveis em reunião histórica. São **aprovações das escolhas de produto**, não aceite integral da secretária/segurança nem autorização para AG-01. Os códigos AG-Dn pertencem ao **módulo**, não às decisões D01–D19 de plataforma acima. Sem implementar grants, tabela, RPC ou rota nesta etapa.

| Referência do módulo | Escolha registrada ou situação | Situação do aceite / impacto |
|---|---|---|
| **AG-D2** | Pedidos `pending` idênticos coexistem; só reservas `confirmed` são exclusivas. | Responsável confirmou; validado com secretária **conforme relato de 23/10**. Testes concorrentes futuros. |
| **AG-D3** | Todo usuário autenticado, com perfil ativo e `schedule.read`, **deve ver** `booked_for` e `secretary_notes` das confirmadas; `purpose`, identidade de solicitante, pendentes e decisões permanecem privados. | **Confirmação expressa do responsável e validação com secretária segundo relato**; testes de segurança/privacidade e texto seguro futuros. |
| **AG-D5-A / C2** | Responsável, futuro administrador geral, **aprovou** conceder `room_booking.manage` integral ao `platform_administrator`: delega e **pode gerir reservas diretamente**, com auditoria. | **Aceite do responsável sobre privilégio e risco** em 23/10; **parecer humano independente de segurança ainda bloqueante antes de AG-01**. |
| **AG-D8 — futuro** | `starts_at` estritamente posterior ao instante corrente aferido pelo banco/backend, **inclusive horário já transcorrido hoje**; não depender do navegador. | Escolha expressa de 23/10; testes ainda não executados e aceite integral não concedido. |
| **AG-D8 — fim e limites** | Mesmo dia civil em `America/Sao_Paulo`, `ends_at > starts_at`, fim `<= 23:59`, `timestamptz`; sem expediente, duração mínima/máxima, antecedência máxima ou grade obrigatória de 15 min; entrada `HH:mm` com minutos livres. | Escolha comunicada e complementada expressamente em 23/10; testar borda `23:59`, `[início, fim)` e precisão. |
| **AG-D8 — aprovação tardia** | Pedido `pending` cujo início já passou não pode ser aprovado; permanece `pending` até recusa manual, sem expiração automática. | Escolha expressa de 23/10; testar relógio do banco, passagem de tempo, conflito e recusa. |
| **AG-D8 — edição histórica** | Reunião iniciada/histórica: somente `booked_for` e `secretary_notes` podem ser corrigidos por `manage`, com versão e auditoria; `purpose`, horários e demais campos imutáveis. | **Escolha expressa do responsável em 23/10**; ainda exige testes negativos, privacidade e validação com secretária. |
| **AG-observações** | `secretary_notes` de reserva confirmada/direta editável por `manage`, separado de `purpose`, **visível obrigatoriamente a todos os leitores autorizados da agenda confirmada**. | Responsável confirmou e relatou validação da secretária; proibir vazamento a não autorizados e conteúdo executável. |
| **AG-C1** | Antecipar **desenvolvimento** do Agendamento em relação à 4ª posição da Fase 2. | Prioridade comunicada; formalizar aceite no PR, preservando gates da Qualidade e PROD NO-GO. |
| **AG-F2 — ESCOLHA CONFIRMADA** | Novo pedido que conflita com reserva **já confirmada** deve ser rejeitado sem registrar solicitação, inclusive se a reserva for confirmada durante o preenchimento. | Decisão expressa do responsável em 23/10; testar UI/RPC/banco. D2 continua permitindo pedidos concorrentes enquanto `pending`; aceite operacional da secretária pendente. |
| **AG-D1** | Uma única `Sala de Reunião`, global e compartilhada, sem vínculo de unidade/filial na v1. | **Aprovada pelo responsável (23/10)**; conferir realidade com secretária. |
| **AG-D4** | Solicitante recebe `room_booking_requester` por concessão individual explícita via Core pelo administrador, inclusive novas contas; sem auto-grant/lote. | **Aprovada pelo responsável (23/10)**; design D5-A requer parecer de segurança. |
| **AG-D6** | Responsável nomeia substituta; administrador delega `room_booking_manager` temporário e revoga no retorno, ambos auditados. | **Aprovada pelo responsável (23/10)**; validar nomes/autoridade sem expor PII e revisar D5-A. |
| **AG-D7** | Solicitante cancela só o próprio pedido `pending` **com início ainda futuro** no instante do banco; pedido vencido aguarda recusa manual pela gestora. | **Aprovada pelo responsável (23/10)**; testar negados e fuso. |
| **AG-D9** | Avisos e status apenas em `Meus pedidos`/fila do módulo, sem e-mail, WhatsApp ou notificações externas. | **Aprovada pelo responsável (23/10)**; validar UX com secretária. |
| **AG-D10** | `Administrativo > Agendamento de Salas`, rota `/rooms` com visibilidade pela permissão. | **Aprovada pelo responsável (23/10)**; entrega de UI somente em AG-03. |
| **AG-D11** | **Implementação inteiramente nova, independente do legado**, sem portar funcionalidades como requisito nem importar/reconciliar reservas/dados antigos. Preservar legado sem toque. | Decisão **substitutiva expressa do responsável em 23/10**, revoga o plano anterior de conferência/reconciliação de reservas futuras; eventual transição operacional só com GO separado. |
| **AG-D12** | Homologação antes de qualquer corte e GO global da plataforma. | Restrição obrigatória inalterada; PROD **NO-GO**. |

**Fechamento AG-00:** responsável confirmou ampliação D5-A e exposição D3/observações; relatou que **a secretária validou todas as decisões atuais**, sem ata direta anexada. D11 foi **substituída por implementação independente**, dispensando inventário ZIP e reconciliação de dados/agenda antiga para desenvolver. Antes do AG-01 ainda pendem: **parecer humano independente de segurança D5-A**, registro rastreável do aceite/validação da secretária e da prioridade C1, revisão/CI e **integração autorizada da PR documental**. Os testes F/S/C/T/U são gates das etapas futuras AG-01–AG-05, não provas exigíveis antes da implementação. **AG-01 segue bloqueado.**

**Etapas futuras, numeração canônica:** AG-03 = interface **incluindo fila/editor da secretária**; AG-04 = revisão/QA; AG-05 = homologação. O plano de 19/10 chamava AG-04 a interface e AG-05 o QA; manter o parecer de 21/10 como registro histórico, sem transportar a divergência para o roadmap.

## Evidência recente que muda a leitura de documentos antigos

- [Issue #51](https://github.com/The-Vonky/Gaucha-Gestao/issues/51) relata **ensaio sintético a frio v2 com restore funcional PASS parcial em 19/10**, com [relatório técnico](02_RESTORE_DRILL.md) preparado na [PR #62](https://github.com/The-Vonky/Gaucha-Gestao/pull/62); a **issue permanece aberta**, pois DR-08 não foi concluído. Trata-se de laboratório, não demonstra backups on-line, WAL/PITR, destino off-site ou restauração de PROD.
- [Issue #52](https://github.com/The-Vonky/Gaucha-Gestao/issues/52) informa que ERP de Contratos foi levado para outro computador e que funcionamento foi relatado, **sem** garantia de restauração independente da instância antiga; preservar tudo até autorização de descarte. A inspeção do HD HPE e da C30 ainda está sujeita ao gate.
- [PR #66](https://github.com/The-Vonky/Gaucha-Gestao/pull/66) **foi integrada à main** em `eaffb4f`.
- [PR #69](https://github.com/The-Vonky/Gaucha-Gestao/pull/69) **foi integrada à main** em `fed0e0f`; Curva ABC v1 está em código, mas importação das amostras ERP, validações de confiança e homologação com dois operadores ([Issue #70](https://github.com/The-Vonky/Gaucha-Gestao/issues/70)) continuam abertas.
- [PR #72](https://github.com/The-Vonky/Gaucha-Gestao/pull/72) foi integrada como documentação de Agendamento de Salas (AG-00) em `6373992`, mas seu [brief](../briefs/ROOM_BOOKING_V1.md) continua **PROPOSTO** e depende de aceite do responsável/secretária; não cria autorização para AG-01, permissão, migration ou mudança no roadmap.
- [Issue #68](https://github.com/The-Vonky/Gaucha-Gestao/issues/68) registra DEV compartilhado com duas contas independentes; os critérios de rede, autoria e RLS ainda exigem confirmação. Não é STAGING nem PROD.
- Há documentos de Core v2 que mantêm banner de outubro anterior a [PR #38](https://github.com/The-Vonky/Gaucha-Gestao/pull/38) e dizem que a integração não está em main; esse trecho **histórico** não revoga o fato de o Core v2 ter sido consolidado. Mantenha o conteúdo como snapshot ou corrija o banner em PR focada, sem reescrever contratos antigos sem aprovação.
- [ADR-006](../decisions/ADR-006-infra-v1-reused-hardware.md) mantém Proposed apesar de existir Compose em CI. Documentação de teste e status arquitetural são dimensões diferentes.
- [01_DADOS_LIMPOS](01_DADOS_LIMPOS.md) é proposta documental, não script de limpeza nem autorização para tocar em produção.

## Critérios de débito documental

| Lacuna | Correção responsável | Evidência mínima |
| --- | --- | --- |
| Diagramas ficarão desatualizados quando novas stacks entrarem | PR do módulo/infra altera DIAGRAMS/STACK_INTEGRATION | Diff com fonte de dados/código/ADR |
| Catálogo de RPCs é amostral | Cada módulo mantém especificação de contrato versionada a partir de DDL e adaptadores | Endpoints/assinaturas/parâmetros, RLS, negativa, compatibilidade |
| Status físicos/operacionais mudam fora do repo | Atualizar acceptance e registros após execução | Data, operador, cenário, artefato redigido, SHA |
| Procedimentos de PROD não estão executáveis | Implementação futura com revisão técnica e autorização humana | Backup/restore independente, rollback, hardening, incidentes |
| Não há orçamento final ou prazo firmado nesta síntese | Usar Plano Diretor; quantificar somente com metas e escopo aprovados | Premissas rastreadas e aprovação |
| Fluxos de usuário futuros ainda não desenhados por domínio | Brief individual de migração por módulo | Personas, regras, diagramas, testes, decisão do PO |

## Como encerrar uma decisão

1. Registrar evidência técnica e alternativa rejeitada.
2. Emitir ADR/issue com proprietário e impacto.
3. Obter aprovação humana e, quando requerido, parecer independente.
4. Implementar por PR focada com testes da versão exata, sem segredos ou dados reais.
5. Atualizar este registro, roadmap, diagramas e operação, preservando histórico.

**Proibição:** nenhum item deste arquivo constitui GO implícito, autorização para formatar, resetar banco, provisionar produção, mover dados pessoais ou expor a API.
