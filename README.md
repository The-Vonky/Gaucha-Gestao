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

A plataforma implementa Core/autorização, Audit v1 (incluindo reabertura), Planos de Ação, evidências de execução/verificação, Checklist Evidence por critério e Audit Export & Reporting. O hardening funcional da Qualidade v1 está integrado; a UI institucional aplica o Design System ao App Shell, Home, Administração e superfícies de Qualidade, e o **Login v3 · Elo** foi integrado pela PR #17.

Baseline atual verificada: `main` em `22334995b5b239274c5c1adc98495357ec0d7980`, merge da PR #18. A CI pós-merge passou em `37017170877` (typecheck, lint, 236 testes, build, verify:build, audit e integrações reais em Supabase descartável) e a infraestrutura reproduzível passou em `37017171393`. A validação self-hosted continua sendo evidência reproduzível em runner descartável; não representa deploy ou ambiente de produção.

A rodada final de Qualidade (PR #18) removeu estilos legados do Login, reforçou safe areas e ergonomia mobile, alinhou Checklist Evidence aos tokens compartilhados e adicionou regressão dedicada do controle mostrar/ocultar senha. O fechamento factual e os aceites restantes estão em [Qualidade v1 — matriz factual](docs/modules/audit/QUALITY_COMPLETION_V1.md) e [Qualidade v1 — aceite final](docs/modules/audit/QUALITY_ACCEPTANCE_V1.md).

**Production ready: NÃO enquanto P1–P9 e O1–O8 não estiverem registrados como aprovados.** Código/CI não substituem teste físico, backup/restore, observabilidade e aprovação operacional. Não há autorização implícita para deploy ou migração de dados de produção.

Consulte `docs/architecture/OVERVIEW.md` antes de iniciar implementação estrutural.

