# ADR-005 — Core Identity, Authorization and Organizational Scope

Status: Accepted  
Date: 2026-09-24

## Context

Gaúcha Gestão has nine business modules with different audiences and organizational scopes.

A user may need:
- different capabilities in different domains;
- access to all units or only selected units;
- future sector-level restrictions;
- more than one functional responsibility.

Hard-coded application roles such as `admin`, `qualidade`, `gestor` and `viewer` are insufficient for the integrated platform.

## Decision

Authorization uses:

```text
Authenticated User
      |
      v
Core Profile (active?)
      |
      v
User Role Assignment
      |
      +--> Role --> Permissions
      |
      +--> Scope
           global
           unit
           sector
```

A user can have multiple role assignments.

Scope belongs to the role assignment, not globally to the user.

This allows, for example:

```text
User
├── Quality role @ CMD + HRAD
└── Fleet role @ Matriz
```

without granting Quality access to Matriz or Fleet access to CMD/HRAD.

## Authentication

Supabase Auth is the identity provider.

`auth.users.id` is the canonical authenticated identity.

Core owns a one-to-one platform profile that references the Auth user.

An authenticated user whose Core profile is inactive is denied application data access even if their Auth session is still technically valid.

## Database schemas

Initial domain schemas:

```text
core
audit
action_plans
```

Future modules receive their own schema when implemented.

Exposed schemas must be configured explicitly in the Supabase/PostgREST Data API and every exposed table must use RLS plus explicit grants.

Sensitive helper functions that do not need direct API access should live in a non-exposed schema such as `private`.

## Core tables

### core.profiles

Purpose: platform profile associated with `auth.users`.

Initial fields:
- `id uuid primary key` -> `auth.users(id)`;
- `display_name text`;
- `active boolean`;
- optional business metadata added only when justified;
- created/updated timestamps.

Do not store password hashes or duplicate Auth credentials.

### core.units

Canonical company organizational unit.

Initial fields:
- `id uuid`;
- `code text` stable unique business code where available;
- `name text`;
- `active boolean`;
- timestamps;
- created/updated actor metadata.

Units are deactivated by default rather than physically deleted once referenced by business history.

### core.sectors

Canonical sector definition.

Initial fields:
- `id uuid`;
- `code text`;
- `name text`;
- `active boolean`;
- timestamps.

### core.unit_sectors

Associates sectors with the units where they are valid.

This allows one canonical sector concept to exist across multiple units without duplicating the sector definition.

Initial key:
- `unit_id`;
- `sector_id`;
- active/status metadata if later needed.

### core.permissions

Permission catalog.

Use the permission key itself as the stable identifier when practical.

Example key:
`audit.inspection.finalize`

Metadata:
- domain;
- resource;
- action;
- human-readable description;
- active flag.

Permissions are introduced only for implemented capabilities.

### core.roles

Reusable permission bundle.

Initial fields:
- `id uuid`;
- `key text unique`;
- `name text`;
- `description text`;
- `system boolean`;
- `active boolean`;
- timestamps.

Application logic must not branch on role key when a permission can express the requirement.

### core.role_permissions

Many-to-many relation:
- `role_id`;
- `permission_key`.

### core.user_role_assignments

Assigns a role to a user with an organizational scope.

Initial fields:
- `id uuid`;
- `user_id`;
- `role_id`;
- `scope_type`: `global | unit | sector`;
- nullable `unit_id`;
- nullable `sector_id`;
- active flag;
- timestamps;
- granted_by.

Shape rules:
- global => unit_id null, sector_id null;
- unit => unit_id required, sector_id null;
- sector => unit_id required, sector_id required;
- a sector assignment must reference a sector associated with that unit.

Do not create separate `user_unit_access` and `user_sector_access` tables in v1; role-scoped assignments already express the required relationship more precisely.

### core.system_audit_log

Platform security/operational audit trail.

Initial fields:
- `id uuid`;
- `occurred_at timestamptz`;
- `actor_user_id uuid null`;
- `module text`;
- `action text`;
- `entity_type text`;
- `entity_id text/uuid representation`;
- nullable `unit_id`;
- nullable `sector_id`;
- `before_data jsonb null`;
- `after_data jsonb null`;
- `metadata jsonb`;
- correlation/request identifier when available.

Authenticated application clients receive no direct INSERT/UPDATE/DELETE privilege on this table.

Sensitive operations write audit events through trusted database/application mechanisms.

Audit payloads must exclude secrets and unnecessary sensitive content.

## Scope evaluation

For a resource with unit and optional sector:

A permission is granted when:
1. profile is active;
2. an active user-role assignment exists;
3. that role contains the requested permission;
4. assignment scope covers the resource.

Coverage:

```text
global
  -> every unit/sector allowed by permission

unit(U)
  -> resources belonging to unit U

sector(U,S)
  -> resources belonging to sector S within unit U
```

A broader scope covers a narrower resource.

A sector-scoped assignment does not grant access to unrelated unit-wide records unless the resource explicitly belongs to that sector.

## Trusted authorization helpers

Use database helpers conceptually equivalent to:

- `private.is_active_user()`
- `private.has_global_permission(permission_key)`
- `private.has_unit_permission(permission_key, unit_id)`
- `private.has_scoped_permission(permission_key, unit_id, sector_id)`

Exact signatures may evolve during implementation.

Security-definer helpers, when used, must:
- have a fixed/empty search path;
- fully qualify referenced relations;
- expose execute permission only where necessary;
- not become generic privilege bypasses.

## RLS pattern

Every exposed table uses RLS.

A module table that belongs to a unit should use the relevant Core helper in SELECT/INSERT/UPDATE/DELETE policies.

Example concept:

```text
audit.inspections SELECT
-> has_unit_permission('audit.inspection.read', unit_id)

audit.inspections INSERT
-> has_unit_permission('audit.inspection.create', unit_id)
```

UI filtering mirrors these rules but is never authoritative.

## First permission catalog

### Audit

- `audit.inspection.read`
- `audit.inspection.create`
- `audit.inspection.edit`
- `audit.inspection.finalize`
- `audit.inspection.reopen`
- `audit.inspection.export`

### Action Plans

- `action_plan.read`
- `action_plan.create_manual`
- `action_plan.write`
- `action_plan.verify`

### Platform Administration

- `admin.user.read`
- `admin.user.manage`
- `admin.role.read`
- `admin.role.manage`
- `admin.unit.read`
- `admin.unit.manage`
- `admin.sector.read`
- `admin.sector.manage`
- `admin.audit_log.read`

Do not seed permissions for unimplemented business modules yet.

## Initial role templates

Seed templates are convenience only and may be managed later.

### Platform Administrator

Global assignment only.

Contains all currently implemented administration and business permissions.

This role is privileged and its assignment/removal must be audited.

### Quality

Intended to be assignable globally or to selected units.

Contains Audit and Action Plan operational permissions required by Quality.

### Quality Viewer

Read/export-only Audit/Action Plan capabilities where needed.

Exact template composition is migration seed data, not authorization logic.

## User lifecycle

Creation:
- Auth account is created/invited through an approved administrative flow;
- Core profile is created;
- no business access is granted until role assignment exists, except explicitly bootstrapped initial administrator.

Deactivation:
- set Core profile `active = false`;
- all RLS authorization helpers deny access;
- preserve historical actor references;
- optionally revoke Auth sessions through the administrative process.

Reactivation:
- explicit administrative action;
- existing role assignments may be restored only according to policy.

Physical deletion of users is not the ordinary lifecycle mechanism.

## Unit lifecycle

Once referenced by business data:
- do not hard-delete through ordinary UI;
- set `active = false`;
- preserve historical references.

Inactive units disappear from normal creation selectors but remain readable in historical records for users with permission.

## Administrative safeguards

- role/permission/scope changes generate system audit events;
- a user cannot grant permissions they are not authorized to administer;
- ordinary client-side code cannot bypass RLS using a privileged secret;
- service/secret keys never ship to the browser;
- destructive administration actions require explicit confirmation UI and server/database enforcement.

## Consequences

Positive:
- supports multiple responsibilities per user;
- supports different unit scope by role/domain;
- avoids role explosion;
- avoids module-specific user copies;
- creates a stable authorization contract for all modules.

Trade-offs:
- authorization queries are more complex than one enum role;
- RLS helpers require careful indexing and tests;
- administrator UX must explain role + scope clearly.

## Rejected v1 alternatives

### One role field on profile
Rejected because it cannot represent multiple domains/scopes.

### Separate user-unit access independent of role
Rejected because it would grant the same organizational scope to every permission a user has and cannot express Quality@UnitA + Fleet@UnitB cleanly.

### Per-user direct permission overrides
Deferred. Roles are sufficient for v1 and direct overrides create audit/UX complexity.

### Custom authorization data stored only in JWT claims
Rejected as the primary source of truth. Database authorization must reflect current assignments without relying on stale long-lived claims.

## Revisit when

Reconsider the model if:
- permission evaluation becomes a measurable database bottleneck;
- a real use case requires explicit per-user permission overrides;
- hierarchy beyond unit/sector becomes necessary;
- external identity/SSO changes account lifecycle requirements.
