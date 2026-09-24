# ADR-003 — Action Plans as a Transversal Business Module

Status: Accepted  
Date: 2026-09-24

## Context

Action Plans originated inside the Quality Audit system. The post-demonstration requirements explicitly generalize them beyond a checklist item and introduce:
- manual plans;
- optional sector;
- source type/source ID;
- effectiveness criteria;
- monitoring period;
- expected and attached evidence.

Future sources already identified by the requirements include occurrences, non-conformities and meetings.

Making Action Plans an internal Audit table/component would force future domains to depend on Audit internals or duplicate the concept.

Moving Action Plans into Core would also be incorrect: a corrective Action Plan is a business capability, not a stable platform primitive like identity or organizational unit.

## Decision

Action Plans will be a transversal business module/capability.

Conceptually:

```text
Core
  units / sectors / identity / permissions
          |
          v
Action Plans
          ^
          |
Audit ----+
Manual ---+
future approved sources
```

User-facing placement initially remains:

```text
Qualidade > Planos de Ação
```

Technical ownership is independent from menu placement.

## Initial scope

Implement only sources required by the approved Audit evolution:
- `checklist`;
- `manual`.

The existence of source-type values for future domains is not authorization to implement those domains.

## Integration rule

Other modules must not manipulate Action Plan internal persistence directly.

They should use an explicit public application/domain contract, for example operations conceptually equivalent to:
- ensure plan for source;
- create manual plan;
- query plans allowed to current scope;
- update execution fields;
- verify effectiveness;
- attach/remove evidence.

The exact API/function shape depends on the selected platform stack.

## Ownership

Action Plans owns:
- corrective-action lifecycle;
- source reference metadata;
- improvement point/problem description;
- action/how-to/responsible/deadline;
- action status;
- effectiveness planning;
- verification/effectiveness result;
- relationships to evidence metadata.

Core owns:
- users/identity;
- canonical units;
- canonical sectors;
- permissions/scope;
- system audit log.

Source modules own the business records that generated a plan.

## Checklist uniqueness invariant

For a checklist-originated plan, the platform must prevent duplicate active/source records for the same inspection item according to the final schema constraint.

Changing an answer to AT/NAP does not silently destroy historical Action Plan data. Exact close/cancel behavior must be defined in the implementation brief so history is preserved.

## Consequences

Positive:
- Audit does not become a dependency of future quality/administrative workflows;
- manual Action Plans are first-class;
- one effectiveness/evidence model can be reused;
- user-facing Central de Planos can aggregate allowed sources.

Trade-offs:
- requires a clear module contract;
- source navigation must be modeled without tight coupling;
- permission and source-scope evaluation must be designed carefully.

## Guardrail

Do not turn Action Plans into a generic workflow engine.

It remains a focused corrective/improvement-action domain. New abstractions are added only for concrete approved use cases.
