# Product Structure and Navigation

Status: accepted baseline  
Date: 2026-09-24

## User-facing information architecture

```text
Gaúcha Gestão
│
├── Qualidade
│   ├── Auditorias
│   ├── Planos de Ação
│   ├── Registros ISO
│   └── Pesquisa de Satisfação
│
├── Custos
│   ├── Curva ABC
│   └── Planejado × Realizado
│
├── Administrativo
│   ├── Contratos
│   └── Agendamento de Salas
│
├── Comercial
│   └── Vendas / Maquininhas
│
├── Transporte
│   └── Frota
│
└── Administração
    ├── Usuários
    ├── Perfis
    ├── Permissões
    ├── Unidades
    ├── Setores
    └── Logs
```

This tree is the initial product/navigation baseline.

It is not the source-code folder structure.

## Technical ownership map

| Visible area | Technical owner |
| --- | --- |
| Qualidade > Auditorias | Audit business module |
| Qualidade > Planos de Ação | transversal Action Plans business module |
| Qualidade > Registros ISO | ISO business module |
| Qualidade > Pesquisa de Satisfação | Satisfaction business module |
| Custos > Curva ABC | ABC business module |
| Custos > Planejado × Realizado | Planned vs Actual business module |
| Administrativo > Contratos | Contracts business module |
| Administrativo > Agendamento de Salas | Meetings/Room Booking business module |
| Comercial > Vendas / Maquininhas | Sales business module |
| Transporte > Frota | Fleet business module |
| Administração > Usuários | Core identity/profile administration |
| Administração > Perfis | Core authorization administration |
| Administração > Permissões | Core authorization administration |
| Administração > Unidades | Core organizational structure |
| Administração > Setores | Core organizational structure |
| Administração > Logs | Core system audit trail |

## Navigation is permission-driven

The sidebar/menu must be derived from permissions, not from job-title conditionals.

A user should only see groups containing at least one capability they can access.

Examples:

### Transport user

Possible visible navigation:

```text
Início
Transporte
└── Frota

Administrativo
└── Agendamento de Salas
```

### Quality user

Possible visible navigation:

```text
Início
Qualidade
├── Auditorias
├── Planos de Ação
├── Registros ISO
└── Pesquisa de Satisfação
```

### Executive user

May receive read access across several business areas while not receiving platform-administration capabilities.

## Home experience

The Home/Overview is a platform surface, not a tenth business module.

It should compose only data the current user is authorized to read.

The first release does not need a complete cross-domain executive dashboard. Start with useful module entry/status cards and add cross-module KPIs only after their source modules produce trusted data.

## Unit context

A canonical Core Unit can be a cross-module navigation context.

A future unit view may aggregate authorized information such as:
- Audit conformity and pending Action Plans;
- Satisfaction indicators;
- ABC/cost indicators;
- Planned vs Actual;
- Fleet costs;
- related contracts where the domain relationship is valid.

This aggregated view must use public module read contracts and permission checks. It must not make Core depend on module internals.

## Mobile

The same information architecture applies on mobile.

The persistent desktop sidebar may become a drawer/sheet, but permission filtering, group names and module ownership stay consistent.

## Guardrail

Changing where an item appears in navigation must not require moving its business logic between modules.

Menu grouping is a product concern; module ownership is an architecture concern.
