# Registro de decisões, bloqueios e dívida documental

> **Evidência operacional posterior — 30/10/2026:** o STAGING C30 foi disponibilizado em `https://teste.gauchagestao.online` por Cloudflare Tunnel Free, Caddy 4181 e Supabase existente. Login, consulta de auditoria/histórico, fotos, criação de auditoria e download foram relatados em PC e celular; o ngrok anterior esgotara sua cota. Este fato **não altera as decisões D01–D19, ADR-004/ADR-008, o aceite de segurança ou o PROD NO-GO**. A nota de 22/10 sobre ngrok abaixo permanece registro histórico, **não estado atual**. Ver [AS-BUILT](../operations/C30_STAGING_CLOUDFLARE_AS_BUILT_20261030.md) e [runbook](../operations/C30_STAGING_CLOUDFLARE_RUNBOOK.md).

**Decisão vigente — 23/11/2026 (AG-D5-C):** o mantenedor substituiu o veto administrativo de D5-B. `platform_administrator` global recebe `room_booking.manage`, pode criar secretária com `room_booking_manager` e alternar entre as vistas **Room Booking Requester** e **Room Booking Manager**. O seletor é exclusivo do administrador e altera a apresentação, não o grant do banco. A concessão do papel à secretária continua explícita e auditada. D5-A (23/10) e D5-B (26/10) ficam no histórico; D1–D4, D6–D11 e F2 são preservadas. Ver [AG-D5-C](../modules/room-booking/D5C_ADMIN_MODES.md). Não autoriza C30/STAGING/PROD.


**Histórico — exceção de governança D5-A, 23/10/2026 (decisão de produto revogada em 26/10):** o titular declarou ser o único desenvolvedor/aprovador humano. A ampliação de `room_booking.manage` ao administrador geral está aprovada pelo titular. **Parecer humano independente não existe, e nenhum parecer será inventado.** O titular aceita o risco residual de ausência de segundo revisor para este módulo e substitui a exigência operacional inviável por PR do agente + testes/CI + revisão do próprio titular + decisão de merge. Esta exceção aplica-se ao desenvolvimento/integração da PR AG-01, não autoriza implantações ou alterações em ambientes compartilhados/persistentes.

**Revisão de leitura em 25/11/2026, baseline `e0b6f5c`.** O registro preserva a síntese original de 20/10 (`fed0e0f`) e os adendos datados. **Aceita** designa decisão aprovada pela autoridade competente. **Vigente** indica o contrato aplicável hoje. **Substituída** identifica a regra superada por sucessora (D5-B → D5-C). **Revogada** registra retirada de autoridade (D5-A). **Proposta** aguarda aprovação (ADR-006) ou foi encerrada como no caso da PR #24. **Pendente** identifica decisão ou aceite ainda devido. O [Guia Mestre](GUIA_MESTRE_PREPARACAO_USO_GAUCHA_GESTAO_2026-11-04.md) acompanha trabalho restante, e os ADRs aceitos e as provas humanas governam o alcance.

> **Adendo de evidência, 22/10/2026:** o STAGING persistente foi instalado na C30 (projeto `gaucha-staging`) e testado por SSH, incluindo HTTPS apenas em loopback. Isso responde **onde o STAGING está operando** para a entrada D06, mas **não** encerra a aprovação formal de isolamento, aceite físico D07, continuidade D02–D04 ou GO D09. Uma URL pública temporária via ngrok é **plano de testes**, não implementação/decisão de produção; ver [AS-BUILT](../history/operations/C30_STAGING_AS_BUILT_20261022.md), [acesso externo](../history/operations/STAGING_PUBLIC_ACCESS_PLAN.md) e [lacunas de backup](../operations/C30_BACKUP_GAPS.md).

## Planos de Ação

- **AP-01 — decisão integrada e homologada em 27/11/2026.** A [PR #139](https://github.com/The-Vonky/Gaucha-Gestao/pull/139) foi integrada em `1e894d4`. Quality e Platform Administrator podem excluir definitivamente planos no escopo autorizado, com prévia, confirmação, trilha, remoção de objetos pelo Storage e retomada quando necessária. A auditoria e os cadastros são preservados. [Contrato AP-01](../modules/audit/EXCLUSAO_DEFINITIVA.md#ap-01--exclusão-definitiva-de-planos-de-ação).
- **AP-02 — aprovada para implementação no DEV.** Delegação por UUID, execução por atribuição, conclusão pela capacidade específica e relato independente. Integração condicionada à homologação e ao aceite do mantenedor. [Contrato AP-02](../modules/audit/DELEGACAO_PLANOS_ACAO.md).

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
| D01 | Identity Boundary / criação e recuperação de contas | [GG-05B](../architecture/GG05B_IDENTITY_DESIGN.md) autorizada em DEV; [PR #127](https://github.com/The-Vonky/Gaucha-Gestao/pull/127) integrada em 23/11 (`df113c2`) e homologada no notebook. Temporária válida até troca, substituição ou bloqueio. | **Implementada no DEV, não encerrada operacionalmente:** homologação integral pelo Vite, revisão de segurança aplicável, recuperação emergencial do administrador, recuperação integral do DEV com Identity, adoção na C30 e GO do piloto seguem abertos. |
| D02 | RPO técnico e RTO dentro/fora do horário seg–sex 07–18h | Valores numéricos, cenários e responsáveis aprovados, medidos quando houver infra | O1 e go-live bloqueados; não declarar RPO zero |
| D03 | Retenções para DB/WAL, objetos, dados removidos e logs | Política escrita, justificativa legal/negócio, mecanismos e testes | Purge, custos, compliance e O1/O6 abertos |
| D04 | Ferramenta de backup e PITR, destino independente/off-site, chaves e segurança | Escolher WAL-G/pgBackRest ou equivalente por ADR/ensaio; definir restauração de objetos | O3/O4 bloqueados em PROD |
| D05 | Carga esperada, unidades, usuários simultâneos e latência p95 | Requisitos quantificados e teste sobre C30 Ubuntu | Não há aceite de capacidade |
| D06 | Finalidade do servidor legado e condições do STAGING | C30/STAGING registrado no AS-BUILT. Revalidar em GG-01 e decidir isolamento, manutenção e rede | Operação persistente sujeita a autorização própria |
| D07 | Aceite físico da C30 e preservação do SSD/HD HPE/outros volumes | Laudo, inventário, preservação/restore, autorização de reinstalação; [#48](https://github.com/The-Vonky/Gaucha-Gestao/issues/48), [#52](https://github.com/The-Vonky/Gaucha-Gestao/issues/52) | **Nunca formatar/inicializar sem GO** |
| D08 | Monitoração/alertas, reconciliação Storage, retenção e resposta a incidentes | Runbooks, responsáveis, testes de alerta e prova real | O5/O6/O7/O8 pendentes |
| D09 | Liberação de produção e proteção de main | Decisão documentada de release; proteção main adiada conscientemente no plano v1.3 | Sem enforcement técnico automático: disciplina manual; produção NO-GO |
| D10 | Qualidade v1 em aparelhos Android/iOS e ambientes válidos | [P1–P9 / O1–O8](../modules/audit/QUALITY_ACCEPTANCE_V1.md) com evidência e sign-off | Proibido classificar v1 como homologada |
| D11 | Categoria/ownership real do legado chamado Registros ISO/Propostas ISO | Inventário funcional e dono da informação; [MODULE_ROADMAP](../migration/MODULE_ROADMAP.md) | Implementação de migração ISO bloqueada |
| D12 | Cópia/recuperação de objetos em R2 e política de headers/links | Design testado em staging/infra real | Não assumir que R2, CDN ou signed URL resolvem backup e proteção |
| D13 | Curva ABC (matriz D1): aceitar tema OOXML canônico | PR #81 integrada. Homologar amostras ERP/Excel na [#86](https://github.com/The-Vonky/Gaucha-Gestao/issues/86) | Tema permitido no formato canônico. Demais partes extras seguem barradas pelo parser |
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
| **AG-D5-A / C2 — histórica, revogada em 26/10** | Responsável, futuro administrador geral, **aprovou** conceder `room_booking.manage` integral ao `platform_administrator`: delega e **pode gerir reservas diretamente**, com auditoria. | **Aceite do responsável sobre privilégio e risco** em 23/10; exigência histórica de parecer independente substituída pelo fluxo de mantenedor único; decisão D5-A posteriormente revogada. |
| **AG-D5-B / C2 — histórica, substituída em 23/11** | Administrador tinha três permissões sem gestão; o gestor exigia provisionamento técnico auditado. | **Aprovada em 26/10/2026, posteriormente substituída por D5-C**. Guardar como decisão histórica de PR #88. |
| **AG-D5-C / C2 — vigente** | Administrador global detém as quatro capacidades de Room Booking e escolhe entre as vistas Requester/Manager, sem troca de credencial; operador autorizado pode cadastrar Manager ou Requester global, sem unidade/setor, por delegação e atribuição explícitas. | **Decisão expressa do mantenedor em 23/11/2026.** Integrada pela [PR #129](https://github.com/The-Vonky/Gaucha-Gestao/pull/129), com homologação funcional no DEV. AG-05 mantém escopo próprio e aplicação em outro ambiente exige GO. [Contrato](../modules/room-booking/D5C_ADMIN_MODES.md). |
| **AG-D8 — futuro** | `starts_at` estritamente posterior ao instante corrente aferido pelo banco/backend, **inclusive horário já transcorrido hoje**; não depender do navegador. | Escolha expressa de 23/10; testes ainda não executados e aceite integral não concedido. |
| **AG-D8 — fim e limites** | Mesmo dia civil em `America/Sao_Paulo`, `ends_at > starts_at`, fim `<= 23:59`, `timestamptz`; sem expediente, duração mínima/máxima, antecedência máxima ou grade obrigatória de 15 min; entrada `HH:mm` com minutos livres. | Escolha comunicada e complementada expressamente em 23/10; testar borda `23:59`, `[início, fim)` e precisão. |
| **AG-D8 — aprovação tardia** | Pedido `pending` cujo início já passou não pode ser aprovado; permanece `pending` até recusa manual, sem expiração automática. | Escolha expressa de 23/10; testar relógio do banco, passagem de tempo, conflito e recusa. |
| **AG-D8 — edição histórica** | Reunião iniciada/histórica: somente `booked_for` e `secretary_notes` podem ser corrigidos por `manage`, com versão e auditoria; `purpose`, horários e demais campos imutáveis. | **Escolha expressa do responsável em 23/10**; ainda exige testes negativos, privacidade e validação com secretária. |
| **AG-observações** | `secretary_notes` de reserva confirmada/direta editável por `manage`, separado de `purpose`, **visível obrigatoriamente a todos os leitores autorizados da agenda confirmada**. | Responsável confirmou e relatou validação da secretária; proibir vazamento a não autorizados e conteúdo executável. |
| **AG-C1** | Antecipar **desenvolvimento** do Agendamento em relação à 4ª posição da Fase 2. | Prioridade comunicada; formalizar aceite no PR, preservando gates da Qualidade e PROD NO-GO. |
| **AG-F2 — ESCOLHA CONFIRMADA** | Novo pedido que conflita com reserva **já confirmada** deve ser rejeitado sem registrar solicitação, inclusive se a reserva for confirmada durante o preenchimento. | Decisão expressa do responsável em 23/10; testar UI/RPC/banco. D2 continua permitindo pedidos concorrentes enquanto `pending`; aceite operacional da secretária pendente. |
| **AG-D1** | Uma única `Sala de Reunião`, global e compartilhada, sem vínculo de unidade/filial na v1. | **Aprovada pelo responsável (23/10)**; conferir realidade com secretária. |
| **AG-D4** | Solicitante recebe `room_booking_requester` por concessão individual explícita via Core pelo administrador, inclusive novas contas; sem auto-grant/lote. | **Aprovada pelo responsável (23/10)**; três permissões de solicitante preservadas em AG-D5-C. |
| **AG-D6** | Responsável nomeia substituta; operador autorizado concede `room_booking_manager` global temporário e revoga no retorno, ambos auditados. | **Aprovada pelo responsável (23/10)**; delegação Core sob AG-D5-C. |
| **AG-D7** | Solicitante cancela só o próprio pedido `pending` **com início ainda futuro** no instante do banco; pedido vencido aguarda recusa manual pela gestora. | **Aprovada pelo responsável (23/10)**; testar negados e fuso. |
| **AG-D9** | Avisos e status apenas em `Meus pedidos`/fila do módulo, sem e-mail, WhatsApp ou notificações externas. | **Aprovada pelo responsável (23/10)**; validar UX com secretária. |
| **AG-D10** | `Administrativo > Agendamento de Salas`, rota `/rooms` com visibilidade pela permissão. | **Aprovada pelo responsável (23/10)**; entrega de UI somente em AG-03. |
| **AG-D11** | **Implementação inteiramente nova, independente do legado**, sem portar funcionalidades como requisito nem importar/reconciliar reservas/dados antigos. Preservar legado sem toque. | Decisão **substitutiva expressa do responsável em 23/10**, revoga o plano anterior de conferência/reconciliação de reservas futuras; eventual transição operacional só com GO separado. |
| **AG-D12** | Homologação antes de qualquer corte e GO global da plataforma. | Restrição obrigatória inalterada; PROD **NO-GO**. |

**Estado de 23/10 após PR #85 e abertura da PR #88:** AG-00 integrado; D5-A aprovada pelo responsável único; AG-01 com schema/RLS/grants propostos e testes relatados na PR #88. **Revisão e decisão de merge pertencem ao único mantenedor humano**, com risco residual da ausência de segundo revisor documentado, sem inventar parecer independente. **Desenvolvimento e testes manuais devem aproveitar o Docker/Supabase local existente**, inspecionando estado e preservando dados; não há obrigação de criar banco/volume/container adicional. Sem autorização para STAGING/C30/PROD.

**Numeração canônica:** AG-03 = interface **incluindo fila/editor da secretária**; AG-04 = revisão/QA; AG-05 = homologação. O plano de 19/10 chamava AG-04 a interface e AG-05 o QA; manter o parecer de 21/10 como registro histórico, sem transportar a divergência para o roadmap.

## Evidência recente que muda a leitura de documentos antigos

- [Issue #51](https://github.com/The-Vonky/Gaucha-Gestao/issues/51) relata **ensaio sintético a frio v2 com restore funcional PASS parcial em 19/10**, com [relatório técnico](../history/operations/02_RESTORE_DRILL.md) preparado na [PR #62](https://github.com/The-Vonky/Gaucha-Gestao/pull/62); a issue consta encerrada no GitHub. DR-08 permanece parcial no relatório. Trata-se de laboratório, não demonstra backups on-line, WAL/PITR, destino off-site ou restauração de PROD.
- [Issue #52](https://github.com/The-Vonky/Gaucha-Gestao/issues/52) informa que ERP de Contratos foi levado para outro computador e que funcionamento foi relatado, **sem** garantia de restauração independente da instância antiga; preservar tudo até autorização de descarte. A inspeção do HD HPE e da C30 ainda está sujeita ao gate.
- [PR #66](https://github.com/The-Vonky/Gaucha-Gestao/pull/66) **foi integrada à main** em `eaffb4f`.
- [PR #69](https://github.com/The-Vonky/Gaucha-Gestao/pull/69) **foi integrada à main** em `fed0e0f`; Curva ABC v1 está em código, mas importação das amostras ERP, validações de confiança e homologação aplicável seguem os critérios do módulo. A [Issue #70](https://github.com/The-Vonky/Gaucha-Gestao/issues/70) está encerrada e [D13/#86](https://github.com/The-Vonky/Gaucha-Gestao/issues/86) segue aberta.
- [PR #72](https://github.com/The-Vonky/Gaucha-Gestao/pull/72) foi integrada como documentação de Agendamento de Salas (AG-00) em `6373992`, naquele recorte. A fundação e as operações foram posteriormente integradas na PR #88. AG-D5-C é vigente e o aceite AG-05 continua próprio.
- [Issue #68](https://github.com/The-Vonky/Gaucha-Gestao/issues/68) está encerrada e registra um recorte histórico de DEV compartilhado com duas contas independentes. Qualquer reuso requer confirmar instância, versão e critérios de acesso. Não é STAGING nem PROD.
- O histórico original dos documentos de Core v2 é anterior à [PR #38](https://github.com/The-Vonky/Gaucha-Gestao/pull/38) que integrou a onda 2. O [contrato Core v2](../architecture/CORE_FOUNDATION_V2.md) mantém o recorte antigo identificado e registra a integração posterior.
- [ADR-006](../decisions/ADR-006-infra-v1-reused-hardware.md) mantém Proposed apesar de existir Compose em CI. Documentação de teste e status arquitetural são dimensões diferentes.
- [01_DADOS_LIMPOS](../history/planning/01_DADOS_LIMPOS.md) é proposta documental, não script de limpeza nem autorização para tocar em produção.

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

## Adendo GG-02C — 06/11/2026

O mantenedor autorizou integração Restic + Rclone em laboratório exclusivamente sintético e preparação documental do Drive. [Procedimento e próxima autorização](../history/operations/GG02C_RCLONE_DRIVE_20261106.md); [matriz executada](../history/operations/GG02C_LAB_RESULTS_20261106.md). Backend local via stdio, snapshots, integridade e recuperação secundária lógica comprovados; conta Google não conectada. OAuth/primeira operação na conta, recuperação física em outro PC e custódia externa continuam pendentes. Arquitetura de pacote completo gratuito segue confirmação do mantenedor/PR #106, naquele recorte; a PR #106 foi posteriormente integrada. Não encerra D02/D03/D04/D08/D12, GG-02/GG-03, O3/O4 ou autoriza C30/PROD.

## Adendo AG-01 — 23/10/2026

O responsável instruiu expressamente iniciar codificação de migration, grants, RLS e testes isolados na branch reservada e abrir PR. Essa autorização atual substitui o bloqueio de início de codificação registrado em AG-00. Não equivale a parecer independente D5-A ou autorização de integração/produção. Ver [contrato implementado para revisão](../modules/room-booking/AG01_FOUNDATION.md); revisão final pelo titular conforme exceção de mantenedor único registrada em `9e20199`, sem inventar parecer independente.

## Adendo GG-02D — 09/11/2026

A [Issue #113](https://github.com/The-Vonky/Gaucha-Gestao/issues/113) autoriza somente o [ensaio sintético no Drive dedicado](../history/operations/GG02D_DRIVE_SYNTHETIC_20261109.md), com OAuth interativo pelo mantenedor no Windows e escopo `drive.file`. A execução depende de quota observada, confirmação da conta e pasta UUID. O ensaio físico secundário está BLOCKED pela indisponibilidade de outro computador. D02/D03/D04/D08/D12 e GG-02/GG-03 operacionais continuam abertos.

A decisão na [PR #114](https://github.com/The-Vonky/Gaucha-Gestao/pull/114#issuecomment-6750171277) direciona OAuth Desktop próprio com `drive.file` e consentimento External / In production. A [proposta operacional C30](../operations/C30_BACKUP_OPERATIONAL_PLAN.md) mantém os gates e decisões de acesso, agenda, retenção, alertas e recuperação abertos.


## Adendo AG-D5-C — 23/11/2026

O responsável revisou a separação de funções: o administrador global da plataforma deve ter capacidade efetiva de gestão de salas, mas vê dois botões para atuar como **Room Booking Manager** ou **Room Booking Requester**. A alteração é avulsa, fora das GG-01–GG-15, e convive com a GG-05B integrada pela PR #127. A [D5-B histórica](../history/modules/room-booking/D5B_ACCESS.md) é superada somente na proibição ao administrador; as demais regras do módulo permanecem. Não criar concessões de gestores automaticamente e não reescrever a migration histórica. A seleção da tela é uma preferência transitória de apresentação, não uma barreira de autorização no servidor. [Especificação e critérios de aceite](../modules/room-booking/D5C_ADMIN_MODES.md).

## AUD-DELETE-01 · 26/11/2026

O mantenedor autorizou exclusão irreversível da auditoria e dos planos originados nela, inclusive verificados, mantendo logs do Core e backups. A exceção física ao fluxo HTTP é a reconciliação operacional de versões órfãs no DEV pessoal. [Procedimento e contrato](../modules/audit/EXCLUSAO_DEFINITIVA.md).
