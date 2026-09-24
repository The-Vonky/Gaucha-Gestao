# Core Data Model

Status: accepted logical v1 model  
Decision reference: ADR-005

## Purpose

Define Core ownership and the initial physical model required before Audit enters the platform.

Domain modules own their business records. Core owns stable company-wide identities, organization and authorization.

## Database schema boundaries

Initial schemas:

```text
auth          Supabase-owned identity
core          platform Core
private       non-exposed security/internal helpers
audit         Quality Audit module
action_plans  transversal Action Plans module
```

Future business modules get their own schema when implemented.

Custom exposed schemas must use explicit grants and RLS.

## Core relationships

```text
auth.users
    |
    1:1
    v
core.profiles
    |
    +-------------------------+
    |                         |
    v                         v
core.user_role_assignments   historical created_by/updated_by
    |
    +--> core.roles
    |       |
    |       v
    |   core.role_permissions
    |       |
    |       v
    |   core.permissions
    |
    +--> scope
          | global
          | unit -> core.units
          | sector -> core.units + core.sectors

core.units
    |
    v
core.unit_sectors
    ^
    |
core.sectors
```

## core.profiles

- `id uuid` PK/FK to `auth.users.id`;
- `display_name text not null`;
- `active boolean not null default true`;
- `created_at timestamptz`;
- `updated_at timestamptz`.

Optional HR/profile attributes are not added without a concrete product need.

## core.units

- `id uuid`;
- `code text unique`;
- `name text not null`;
- `active boolean not null default true`;
- created/updated timestamps;
- actor metadata.

Normal lifecycle is deactivate/reactivate.

## core.sectors

- `id uuid`;
- `code text unique`;
- `name text not null`;
- `active boolean not null default true`;
- created/updated timestamps.

## core.unit_sectors

- `unit_id uuid`;
- `sector_id uuid`;
- composite unique/primary key.

Used to validate sector availability within a unit.

## core.permissions

Stable natural key:
- `key text primary key`.

Additional fields:
- `domain text`;
- `resource text`;
- `action text`;
- `description text`;
- `active boolean`.

## core.roles

- `id uuid`;
- `key text unique`;
- `name text`;
- `description text`;
- `system boolean`;
- `active boolean`;
- timestamps.

## core.role_permissions

- `role_id uuid`;
- `permission_key text`;
- composite PK/unique.

## core.user_role_assignments

- `id uuid`;
- `user_id uuid`;
- `role_id uuid`;
- `scope_type` = global/unit/sector;
- nullable `unit_id`;
- nullable `sector_id`;
- `active boolean`;
- `granted_by uuid`;
- timestamps.

Use check constraints for valid scope shapes and uniqueness to avoid duplicate effective assignments.

## core.system_audit_log

Append-oriented platform audit trail:
- `id uuid`;
- `occurred_at timestamptz`;
- nullable `actor_user_id`;
- `module text`;
- `action text`;
- `entity_type text`;
- `entity_id text`;
- nullable `unit_id`;
- nullable `sector_id`;
- nullable `before_data jsonb`;
- nullable `after_data jsonb`;
- `metadata jsonb`;
- nullable correlation/request identifier.

Authenticated clients must not have ordinary write/delete privileges.

## IDs

Use UUIDs for entity identifiers unless a domain has a strong reason for another technical key.

Stable business codes remain separate from UUID identifiers.

## Time

Use `timestamptz` for instants/audit timestamps.

Use PostgreSQL `date` for business dates that do not represent an instant.

## Money

Use PostgreSQL fixed-precision `numeric` for currency.

Never use floating-point storage/arithmetic as the authoritative financial representation.

Each financial module documents rounding semantics.

## Attachments

Binary bytes are stored through Supabase Storage/R2.

Business/database records store controlled metadata and ownership references.

Do not create one universal polymorphic attachment table until concrete cross-module use proves it beneficial. Each module may own attachment metadata while following a shared storage contract.

## Imported source data

Import-heavy modules distinguish:
- source/import batch;
- validation result;
- normalized data;
- mapping aliases;
- audit metadata.

New imports must not silently rewrite historical source data.

## Delete policy

Prefer preservation of referenced history.

Core profiles, units, sectors and roles are normally deactivated.

Business-domain physical deletion rules must be explicit per module.

Never cascade-delete all platform history because a Core unit/user was removed from an administrative screen.

## System audit vs Quality Audit

`core.system_audit_log` is an operational/security trail.

It is completely separate from the business concept:
`Qualidade > Auditorias`.

## Migrations

- append-only after application to a shared environment;
- one source-controlled migration history;
- destructive changes require explicit recovery planning;
- test migrations outside production;
- validate RLS and grants after schema changes.
