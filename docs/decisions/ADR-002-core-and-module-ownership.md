# ADR-002 — Core and Module Ownership

Status: Accepted  
Date: 2026-09-24

## Context

The existing standalone systems may each contain their own versions of units, users, file handling, navigation and other shared concepts.

Copying those concepts into the integrated platform would preserve fragmentation under one repository.

Moving all common-looking data into a giant Core would create the opposite problem: an overcoupled shared domain.

## Decision

Core owns only stable corporate/platform concepts and capabilities.

Initial Core candidates:
- identity/profile;
- authorization;
- organizational units;
- sectors;
- user organizational scope;
- system audit logging;
- common file/attachment capability when storage design is approved.

Each business module owns its domain-specific records, rules and workflows.

The dependency direction is one-way: business modules may depend on Core; Core never depends on a business module.

## Consequences

- modules use canonical corporate identities instead of private copies;
- module migration requires mapping old master data to Core;
- module-specific aliases/import mappings can remain inside modules;
- executive reporting must consume public module data/contracts rather than turning Core into a duplicate warehouse of every domain.

## Guardrail

A field/table/component does not belong in Core merely because two modules currently need something similar. Move it to Core/Shared only when its meaning is stable and genuinely platform-wide.
