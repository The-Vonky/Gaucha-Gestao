# Implementation Brief — Platform Foundation v1

Status: CLOSED FOR IMPLEMENTATION PREPARATION  
Date: 2026-09-24

> This brief defines the first application-code foundation for Gaúcha Gestão. It does not authorize production deployment, production infrastructure configuration, or migration of standalone business data.

## Objective

Create the minimum working platform skeleton needed to host Audit as the first business module while establishing:
- application shell;
- Supabase client integration;
- Core identity/profile;
- units/sectors;
- RBAC with scoped role assignments;
- permission-driven navigation;
- system audit-log foundation;
- database schema/migrations;
- automated validation.

Do not migrate the Audit domain in this brief.

## Required reading

Before implementation:
- `AGENTS.md`;
- `docs/decisions/ADR-001-modular-monolith.md`;
- `docs/decisions/ADR-002-core-and-module-ownership.md`;
- `docs/decisions/ADR-004-platform-stack.md`;
- `docs/decisions/ADR-005-core-authorization.md`;
- `docs/architecture/PRODUCT_STRUCTURE.md`;
- `docs/architecture/AUTHORIZATION.md`;
- `docs/architecture/DATA_MODEL.md`;
- `docs/architecture/SECURITY.md`.

Do not read unrelated module documentation unless required by an encountered dependency.

## Stack

Use the accepted stack:
- React;
- TypeScript;
- Vite;
- Supabase client;
- PostgreSQL/Supabase migration files;
- npm workspace/monorepo organization appropriate for the modular monolith.

Do not configure the physical ML350, Cloudflare, R2 or production Supabase deployment in this brief.

## Target repository shape

Keep the initial repository small.

Expected conceptual organization:

```text
apps/
  web/
    src/
      app/
      core/
      modules/
      shared/

supabase/
  migrations/

docs/
```

Do not create empty folders/files for all nine modules.

Only create module placeholders when required for navigation contracts.

## Frontend foundation

Create:
- React/Vite/TypeScript application;
- router;
- application shell;
- responsive desktop sidebar;
- responsive mobile navigation/drawer;
- login/session boundary;
- current-user/profile bootstrap;
- loading/error/unauthorized states;
- permission-aware navigation registry.

Initial visible product structure may show only destinations the current implementation actually supports.

Do not build fake dashboards for unimplemented modules.

## Product navigation model

The registry must be capable of representing the accepted groups:
- Qualidade;
- Custos;
- Administrativo;
- Comercial;
- Transporte;
- Administração.

A destination declares required permission(s).

Groups with no visible destination are omitted.

For v1 foundation, Administration pages implemented below and Audit placeholder/entry may be registered only when its permission contract is real.

## Core database schemas

Create source-controlled migrations for:
- schema `core`;
- schema `private`;
- required custom enums/domains only when justified;
- tables from ADR-005/DATA_MODEL;
- indexes;
- grants;
- RLS;
- authorization helper functions.

Core tables:
- `core.profiles`;
- `core.units`;
- `core.sectors`;
- `core.unit_sectors`;
- `core.permissions`;
- `core.roles`;
- `core.role_permissions`;
- `core.user_role_assignments`;
- `core.system_audit_log`.

Do not create Audit/Action Plan business tables in this brief.

## Auth integration

Use Supabase Auth.

Requirements:
- authenticated identity maps to `core.profiles`;
- inactive profile receives no application data access;
- no service/secret key in browser code;
- first-user/bootstrap administrator mechanism must be explicit and safe;
- ordinary sign-up must not accidentally grant business access.

If public self-signup is not needed for the company workflow, keep account creation/invitation administration-oriented rather than designing consumer signup UX.

Do not implement custom password storage.

## Authorization

Implement the ADR-005 model.

A user may have multiple `user_role_assignments`.

Assignment scope:
- global;
- unit;
- sector.

Implement narrowly scoped database helper functions for effective permission evaluation.

RLS remains authoritative.

Frontend helper(s) such as `can(permission)` and scope-aware equivalents may cache/display effective access but cannot replace database enforcement.

## Initial permissions

Seed only:

Audit contract:
- `audit.inspection.read`;
- `audit.inspection.create`;
- `audit.inspection.edit`;
- `audit.inspection.finalize`;
- `audit.inspection.reopen`;
- `audit.inspection.export`.

Action Plan contract:
- `action_plan.read`;
- `action_plan.create_manual`;
- `action_plan.write`;
- `action_plan.verify`.

Administration:
- `admin.user.read`;
- `admin.user.manage`;
- `admin.role.read`;
- `admin.role.manage`;
- `admin.unit.read`;
- `admin.unit.manage`;
- `admin.sector.read`;
- `admin.sector.manage`;
- `admin.audit_log.read`.

Do not seed permissions for other modules.

## Initial roles

Seed:
- Platform Administrator;
- Quality;
- Quality Viewer.

Role composition should be declared in seed/migration data but application logic must not depend on role keys.

The bootstrap administrator receives Platform Administrator with global scope.

## Administration UI

Implement the minimum usable administration surface for:

### Users
- list Core profiles;
- active/inactive status;
- inspect role assignments;
- activate/deactivate;
- assign/remove role with scope.

Do not physically delete users.

### Roles
- list roles;
- inspect permission composition;
- create/edit non-system role if this can be done safely within the brief;
- assign permissions.

Protect system roles against accidental destructive deletion.

### Units
- list;
- create;
- edit;
- activate/deactivate.

Do not hard-delete referenced units.

### Sectors
- list;
- create;
- edit;
- activate/deactivate;
- associate sector with units.

### Permissions
Read-only catalog is sufficient for v1. Do not provide arbitrary creation of permission strings through ordinary UI.

### Logs
- read-only paginated system audit-log view;
- permission protected;
- basic filters: date, actor, module/action when practical.

## System audit events

At minimum record:
- user/profile activation/deactivation;
- role creation/update;
- role permission changes;
- user role assignment grant/revoke;
- unit create/update/activate/deactivate;
- sector create/update/activate/deactivate;
- unit-sector relationship change.

Client code must not write arbitrary audit rows directly.

## RLS / security requirements

For every exposed Core table:
- enable RLS;
- grant only required operations;
- test anonymous denial;
- test authenticated denial without permission;
- test correct scoped access.

Keep internal helpers in `private` where they do not need Data API exposure.

If a SECURITY DEFINER function is required:
- fixed/empty search_path;
- fully qualified table names;
- minimal execute grants.

Do not rely on hidden buttons for security.

## Concurrency

Administration mutations that can overwrite concurrent edits should use a simple optimistic strategy where useful (updated_at/version), without creating a generic framework.

Do not overengineer concurrency for immutable permission seed rows.

## UX

- professional corporate shell consistent with the product structure;
- responsive desktop/mobile;
- keyboard accessible;
- visible focus;
- explicit loading/empty/error states;
- no native `alert()`, `confirm()`, `prompt()`;
- destructive/deactivation actions use application modal/dialog;
- mobile keyboard opens only by explicit field interaction.

Do not build decorative dashboards without useful data.

## Out of scope

Do not implement:
- Audit inspections/checklist;
- Action Plan business tables/UI;
- ISO;
- Satisfaction;
- ABC;
- Planned vs Actual;
- Contracts;
- Meetings;
- Sales;
- Fleet;
- Cloudflare deployment;
- R2 buckets;
- production Docker Compose;
- Ansible;
- PITR scripts;
- monitoring stack;
- Supabase Studio exposure;
- production secrets.

## Automated tests

At minimum cover authorization logic:

1. inactive user denied;
2. authenticated user with no assignment denied;
3. missing permission denied;
4. global role assignment grants allowed permission;
5. unit role assignment grants only matching unit;
6. other unit denied;
7. sector assignment grants only matching sector/unit;
8. multiple role assignments compose correctly without sharing scopes;
9. role from one domain does not grant another-domain permission;
10. administrative permission is required for admin mutations;
11. audit log cannot be arbitrarily inserted/updated/deleted by normal client;
12. direct guessed IDs do not bypass RLS.

Frontend tests should cover permission-driven navigation and critical admin flows if the chosen testing setup supports them reasonably.

## Validation

Before completion:
- dependency install succeeds;
- typecheck passes;
- lint passes if configured;
- automated tests pass;
- production build passes;
- migration applies cleanly to a fresh local/test Supabase/PostgreSQL environment where available;
- RLS tests pass;
- final diff contains no secrets;
- no native `alert(`, `confirm(`, `prompt(`;
- no production deploy/configuration performed.

If local Supabase execution is unavailable, report that exact limitation rather than claiming migration/RLS validation passed.

## Git

Use focused atomic commits.

A sensible split:
1. workspace/app skeleton;
2. Core migrations + authorization helpers;
3. auth/profile bootstrap;
4. permission-aware shell/navigation;
5. administration UI;
6. tests/hardening.

Do not force this exact split when a smaller atomic grouping is clearer.

## Completion report

Return:
1. main files changed;
2. migrations created;
3. tests/validation executed;
4. real pending issues;
5. commits.
