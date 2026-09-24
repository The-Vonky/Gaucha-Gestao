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

Este repositório está na fase de arquitetura e fundação. Não há autorização implícita para deploy ou migração de dados de produção.

Consulte `docs/architecture/OVERVIEW.md` antes de iniciar implementação estrutural.
