# Design Brief — Core Foundation Contract v2

Status: DESIGN ONLY
Base: `d2e30774eb7ab354f13edc7968a5b47f1d2a0891`
Target integration branch: `integration/core-foundation-v2`

## Objective

Define the stable platform-wide Core contract that all current and future business modules may consume.

This track must not implement code.

## Required reading

- `AGENTS.md`
- `docs/decisions/ADR-001-modular-monolith.md`
- `docs/decisions/ADR-002-core-and-module-ownership.md`
- `docs/decisions/ADR-005-core-authorization.md`
- `docs/architecture/AUTHORIZATION.md`
- `docs/architecture/DATA_MODEL.md`
- `docs/architecture/PRODUCT_STRUCTURE.md`
- current Core/Admin code and migrations at the branch base.

## Questions to close

Define canonical contracts and lifecycle semantics for:
- Auth identity vs Core profile;
- user/person usable as a responsible party in business modules;
- active/inactive user behavior and historical references;
- unit identity, code, name, active/inactive lifecycle;
- sector identity and unit-sector validity;
- role, permission and scoped assignment semantics;
- how modules select/reference users, units and sectors;
- what happens when referenced users/units/sectors become inactive;
- read contracts suitable for selectors/directories without bypassing RLS;
- ownership boundary between Core and business modules;
- system audit trail contract.

## Deliverable

Create a new architecture document, preferably:
`docs/architecture/CORE_FOUNDATION_V2.md`

It must contain:
- entity ownership table;
- relationship diagram;
- lifecycle/state rules;
- module-consumption rules;
- authorization invariants;
- historical-reference rules;
- explicit non-goals;
- unresolved product decisions requiring PO approval.

Do not silently decide uncertain product behavior. Mark decisions clearly.

## Guardrails

Core owns stable corporate concepts only.
Core never depends on Audit or another business module.
Do not pre-seed permissions for unimplemented modules.
Do not design a universal polymorphic business model.
No code/migration changes in this branch.
