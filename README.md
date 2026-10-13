# Gaúcha Gestão

Plataforma corporativa modular para centralizar os sistemas internos desenvolvidos para a Gaúcha Alimentação.

## Objetivo

Unificar autenticação, autorização, unidades, setores, anexos, logs, segurança, backup e experiência de navegação, mantendo cada domínio de negócio isolado como módulo.

A plataforma nasce a partir da consolidação gradual dos sistemas existentes. Os sistemas standalone permanecem preservados como referência e contingência durante a migração.

## Módulos previstos

| Módulo | Situação de origem |
| --- | --- |
| Auditoria de Qualidade | em desenvolvimento; prioridade atual |
| Registros ISO | finalizado |
| Vendas / Maquininhas | finalizado |
| Pesquisa de Satisfação | finalizado |
| Agendamento de Sala de Reunião | finalizado; requer revisão |
| Frota | em desenvolvimento |
| Planejado × Realizado | finalizado; requer revisão |
| Curva ABC | em desenvolvimento |
| ERP de Contratos | finalizado; requer revisão de backup |

## Princípios

- monólito modular;
- segurança e autorização desde a fundação;
- módulos dependem do Core, nunca o contrário;
- dados corporativos compartilhados não devem ser duplicados por módulo;
- migração incremental, sem big bang;
- backups com restauração testada;
- ambientes e dados de produção protegidos;
- KISS, DRY e YAGNI;
- decisões arquiteturais registradas em ADRs;
- documentação curta, específica e amigável a agentes de código.

## Estado atual

A plataforma implementa Core/autorização, Audit v1 (incluindo reabertura), Planos de Ação, evidências de execução/verificação, Checklist Evidence por critério e Audit Export & Reporting. O hardening funcional da Qualidade v1 está integrado; a UI institucional aplica o Design System ao App Shell, Home, Administração e superfícies de Qualidade, e o **Login v3 · Elo** foi integrado pela PR #17. O [Design System Elo v1](docs/briefs/DESIGN_SYSTEM_ELO_V1.md) leva a linguagem do Login (neutros, material de campos e botões, foco verde e movimento) a toda a aplicação, sem alterar regras de negócio. O [Audit UX v2](docs/briefs/AUDIT_UX_V2.md) organiza a experiência da Auditoria por unidade monitorada (visão geral, unidade, histórico e abas da auditoria), sem alterar domínio nem contratos.

Baseline de aplicação verificada e integrada pela PR #18: commit `22334995b5b239274c5c1adc98495357ec0d7980`. A CI pós-merge passou em `37017170877` (typecheck, lint, 236 testes, build, verify:build, audit e integrações reais em Supabase descartável) e a infraestrutura reproduzível passou em `37017171393`. A validação self-hosted continua sendo evidência reproduzível em runner descartável; não representa deploy ou ambiente de produção.

A rodada final de Qualidade (PR #18) removeu estilos legados do Login, reforçou safe areas e ergonomia mobile, alinhou Checklist Evidence aos tokens compartilhados e adicionou regressão dedicada do controle mostrar/ocultar senha. O fechamento factual e os aceites restantes estão em [Qualidade v1 — matriz factual](docs/modules/audit/QUALITY_COMPLETION_V1.md) e [Qualidade v1 — aceite final](docs/modules/audit/QUALITY_ACCEPTANCE_V1.md).

## Fundação Core v2 — consolidação da integração (2026-10-13)

As PRs #25–#33, #35 e #36 entregaram resolvers de referências, governança e revisão de acessos por usuário/unidade, logs administrativos, correções de dependências de desenvolvimento e testes de autorização com JWT/PostgREST reais. Estão em `integration/core-foundation-v2-wave2` e **ainda não estão na `main`**. Snapshot pós-PR #36: `14900b63` (81 commits/91 arquivos em relação à `main`, antes desta documentação); os PRs #35 e #36 passaram em CI, mas a CI do HEAD combinado deve ser revalidada.

O responsável informou ter concluído os testes manuais em 13/10/2026; detalhes/evidências individuais não foram anexados e não equivalem à homologação P1–P9/O1–O8. A configuração de proteção da `main` foi **adiada por decisão do responsável**, permanecendo risco de governança explícito.

Para avaliar em computador/Android, com banco **local atualizado** e sem tocar em ambiente compartilhado, siga [Teste manual Core v2](docs/development/CORE_V2_MANUAL_TEST.md). A [matriz de prontidão de consolidação](docs/briefs/CORE_V2_CONSOLIDATION_READINESS.md) registra o que falta para considerar promoção à `main`, incluindo revisão dos módulos fora do Core e sincronização documental.

O novo serviço privilegiado de criação/recuperação de contas **não está implementado**; o ADR-007 permanece proposto no PR #24. CI verde da integração não é aprovação de produção.

**Production ready: NÃO enquanto P1–P9 e O1–O8 não estiverem registrados como aprovados.** Código/CI não substituem teste físico, backup/restore, observabilidade e aprovação operacional. Não há autorização implícita para deploy ou migração de dados de produção.

Consulte `docs/architecture/OVERVIEW.md` antes de iniciar implementação estrutural.

