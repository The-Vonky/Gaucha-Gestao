# Authorization Model

Status: accepted v1 model  
Decision reference: ADR-005

## Goal

Give each person only the capabilities and organizational data required for their work, without hard-coding job titles into application logic.

## Authorization equation

```text
ACCESS
=
authenticated identity
+ active Core profile
+ role permission
+ role-assignment scope
+ row/domain rule
```

Missing or ambiguous authorization means deny.

## Identity

Supabase Auth authenticates the user.

`auth.users.id` maps one-to-one to `core.profiles.id`.

Authentication does not imply business access.

A valid session with an inactive Core profile receives no application data access.

## Roles and permissions

A Permission describes one capability.

Pattern:

```text
domain.resource.action
```

A Role is only a reusable bundle of permissions.

Application code checks permissions, not role names.

Correct:

```text
can('audit.inspection.finalize')
```

Incorrect:

```text
role === 'qualidade'
```

## Scoped role assignments

Users can have multiple roles and each assignment carries its own scope.

Examples:

```text
Ana
└── Quality @ global

Bruno
├── Quality @ CMD
└── Fleet @ Matriz

Carla
└── Quality Viewer @ HRAD / Nutrition sector
```

This prevents permissions from inheriting unrelated organizational scope.

## Scope types

### global

Permission applies to all applicable organizational records.

### unit

Permission applies only to records belonging to the assigned unit.

### sector

Permission applies only to records belonging to the specified sector inside the specified unit.

A global assignment covers unit/sector records. A unit assignment covers resources in that unit but does not automatically cover another unit.

## First permission catalog

Audit:
- `audit.inspection.read`
- `audit.inspection.create`
- `audit.inspection.edit`
- `audit.inspection.finalize`
- `audit.inspection.reopen`
- `audit.inspection.export`

Action Plans:
- `action_plan.read`
- `action_plan.create_manual`
- `action_plan.write`
- `action_plan.verify`

Administration:
- `admin.user.read`
- `admin.user.manage`
- `admin.role.read`
- `admin.role.manage`
- `admin.unit.read`
- `admin.unit.manage`
- `admin.sector.read`
- `admin.sector.manage`
- `admin.audit_log.read`

Core:
- `core.unit_cover.read` — view unit cover photos (Unit Cover v1); granted to the `platform_administrator`, `quality` and `quality_viewer` system roles only. Cover management requires `admin.unit.manage`. See `docs/modules/core/UNIT_COVER_V1.md`.

Do not create future module permissions before those modules are implemented.

## Navigation

Navigation is derived from effective permissions.

A navigation group is hidden if the user has no permission that unlocks any child destination.

Navigation filtering is UX only. Database/server enforcement remains authoritative.

## Database enforcement

Every table reachable through the Data API has:
- explicit grants;
- RLS enabled;
- policies based on Core permission/scope helpers.

Initial schemas exposed to the client are expected to include:
- `core`;
- `audit`;
- `action_plans`.

Sensitive internal helper routines should live in a non-exposed schema such as `private`.

## Authorization helpers

Conceptual helpers:

```text
is_active_user()

has_global_permission(permission)

has_unit_permission(permission, unit_id)

has_scoped_permission(permission, unit_id, sector_id)
```

Helpers are implemented and tested once rather than rewriting complex EXISTS clauses throughout every module.

If SECURITY DEFINER is necessary, use a fixed search path and narrowly granted execution.

## Resource rules

A table with `unit_id` uses unit-scoped permission checks.

A table with `unit_id` + `sector_id` uses scoped checks.

A truly platform-global administrative operation requires a global administrative assignment where appropriate.

Modules may add domain invariants in addition to Core authorization. Authorization does not replace business validation.

## Exports and attachments

Export never bypasses read scope.

An attachment inherits authorization from its owning business entity plus the relevant write/delete capability.

Knowing an object key or entity ID must not grant access.

## Realtime

Realtime subscriptions must not become an authorization bypass.

Subscriptions and resulting row access must respect the same RLS/data-scope model used by ordinary reads.

## Administration

Role, permission and scope changes:
- require explicit administrative permission;
- are audited;
- cannot rely only on UI hiding;
- preserve historical actor identifiers.

The Platform Administrator is implemented as a privileged role with a global assignment, not scattered `if admin` bypasses.

## Lifecycle

Users and organizational units are normally deactivated, not deleted, once referenced by history.

Deactivation prevents new operational use while preserving auditability and historical joins.

## Testing requirements

Authorization tests must include:
- inactive user denied;
- no role denied;
- permission absent denied;
- global grant succeeds;
- correct unit grant succeeds;
- different unit denied;
- sector grant succeeds only for matching unit/sector;
- role with one module does not unlock another;
- direct guessed IDs do not bypass scope;
- export respects scope;
- administrative mutations are audited.
