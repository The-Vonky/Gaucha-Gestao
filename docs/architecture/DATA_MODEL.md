# Core Data Model

## Purpose

This document defines ownership and relationships, not a final SQL schema.

Physical tables and migrations will be specified only after the platform stack and first foundation brief are approved.

## Core-owned concepts

### User identity

Represents authenticated identity and its platform profile.

Core should own:
- identity reference;
- display/profile information required by the platform;
- active/inactive state;
- authorization assignments.

Do not duplicate platform users per module.

### Organizational Unit

Canonical representation of a company unit/branch/location used across modules.

Modules that need a unit reference should use the Core identity of that unit instead of maintaining private copies.

Module-specific aliases used during import may exist inside import/mapping logic without becoming another source of truth for units.

### Sector

Optional organizational subdivision.

Not every module must use sectors. A module can reference a Core sector when business rules require it.

### Role and Permission

Canonical authorization definitions described in AUTHORIZATION.md.

### User Scope

Associates a user/role/access assignment with allowed organizational scope.

Exact physical representation remains open until authorization requirements are tested against the selected database/auth stack.

### Attachment metadata

Common capability for controlled file references when shared storage behavior is established.

A module remains owner of the business entity to which an attachment belongs.

### System Audit Event

Records security/operational mutations distinct from the business module Quality Audit.

## Domain ownership

Each business module owns its business records and invariants.

Examples:

Audit owns:
- inspections;
- checklist answers;
- quality audit-specific records.

Fleet owns:
- vehicles;
- fleet expenses;
- mileage/import rules.

Contracts owns:
- contracts;
- adjustments;
- contract-domain pending items.

ABC owns:
- import batches;
- items;
- price history/classification logic.

Core must not absorb business entities simply because dashboards want to aggregate them.

## Cross-module references

Prefer stable IDs to duplicated master data.

A business module may reference Core entities such as:
- unit_id;
- sector_id;
- created_by / updated_by identity.

Cross-module business-to-business references must be justified by a use case and designed through a public contract, not ad-hoc foreign keys to internal tables by default.

## IDs

Identifier strategy is intentionally not finalized. UUIDs are a strong candidate for globally unique records, but the physical choice belongs in the database foundation decision.

## Time

Persist timestamps consistently with timezone-aware semantics where supported.

Business dates that are truly date-only should not be forced into timestamp semantics.

## Money

Financial modules must not use floating-point arithmetic for currency.

Use fixed-precision decimal/numeric semantics in the final data model and deterministic rounding rules documented by each domain.

## Imported source data

Imported spreadsheets/files must be treated as external input.

For import-heavy modules, distinguish:
- source/import batch;
- validation results;
- normalized business data;
- mapping/aliases;
- audit metadata.

Never overwrite historical data silently just because a new spreadsheet was imported.

## Migrations

- append-only migration history after application to shared environments;
- explicit data migration steps;
- backup/recovery plan for destructive transformations;
- migration validated outside production first.

## Data retention

Retention periods are not defined yet. Contractual, financial, quality and audit-log retention requirements must be identified before automatic deletion policies are implemented.
