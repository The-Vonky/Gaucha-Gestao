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

A plataforma já implementa Core/autorização, Audit v1 (incluindo reabertura), Planos de Ação e evidências de execução/verificação dos planos. A UI de Qualidade está integrada; Audit Export & Reporting (PR #9), anexos por critério / Checklist Evidence (PR #11) e a correção de paginação do histórico por unidade acima do limite da Data API (PR #13) estão integrados na `main`. O software funcional e o hardening pré-homologação da Qualidade v1 estão concluídos após a PR #14. A composição atual passou na CI pós-merge `36854366048` em `664ed5a95684b15c8035e78c21a413bdbd057103`. Homologação física P1–P9 pendente; prontidão operacional O1–O8 pendente/parcial. **Production ready: NÃO.** Consulte o [contrato e roteiro operacional](docs/modules/audit/CHECKLIST_EVIDENCE_V1.md). Implementação e CI não significam produção.

Consulte a [matriz factual e o escopo restante de Qualidade](docs/modules/audit/QUALITY_COMPLETION_V1.md) e os briefs/contratos relacionados. Implementação no repositório não comprova operação em produção. Não há autorização implícita para deploy ou migração de dados de produção.

Consulte `docs/architecture/OVERVIEW.md` antes de iniciar implementação estrutural.

