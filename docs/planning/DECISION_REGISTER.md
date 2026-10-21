# Registro de decisões, bloqueios e dívida documental

**Snapshot reconciliado:** 20/10/2026, main após PR #69 (`fed0e0f`). **Não é ata de decisão humana.** Atualizações posteriores de issues/PRs devem ser reconsultadas. Para autoridade, prevalecem ADRs aceitos, [Plano Diretor](PLANO_DIRETOR_2026.md) e evidências de aceite.

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

**Registro de decisão:** cada Dnn exige uma issue/ADR ou ata referenciável contendo autor, data, alternativas, impacto, aprovação, SHA e requisitos de testes. Apenas a existência de exemplo de env, diagrama ou PR Draft **não resolve** o item.

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
