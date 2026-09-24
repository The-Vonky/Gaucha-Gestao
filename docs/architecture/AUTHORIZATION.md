# Authorization Model

## Goal

Support users who need different modules, different actions and different organizational scopes without creating one hard-coded role for every job title.

## Model

Authorization is composed from three concepts:

1. Permission — what operation may be performed.
2. Role — reusable collection of permissions.
3. Scope — where the permission applies.

Conceptually:

~~~
User
-> one or more Roles
-> Permissions
+
User organizational scope
-> Units / sectors
~~~

Access is granted only when both permission and required scope are satisfied.

## Permission naming

Use stable capability-oriented permissions rather than screen names.

Pattern:

~~~
domain.resource.action
~~~

Examples:

~~~
audit.inspection.read
audit.inspection.write
audit.inspection.finalize

action_plan.read
action_plan.write
action_plan.verify

iso.record.read
iso.record.write

sales.dashboard.read
sales.import.execute

satisfaction.dashboard.read
satisfaction.survey.manage

meeting.booking.read
meeting.booking.manage

fleet.dashboard.read
fleet.expense.write
fleet.import.execute

pxr.dashboard.read
pxr.import.execute

abc.dashboard.read
abc.import.execute

contracts.contract.read
contracts.contract.write

admin.user.manage
admin.role.manage
~~~

The exact catalog will be introduced incrementally with modules. Do not create every speculative permission on day one.

## Roles

Roles provide convenient defaults, not hard-coded application branches.

Initial role templates may include examples such as:
- platform administrator;
- director/executive;
- quality;
- transport;
- viewer.

Role names must not be relied upon as authorization checks if a permission can express the requirement.

Prefer:

~~~
can("fleet.expense.write")
~~~

over:

~~~
role === "transport"
~~~

## Organizational scope

Permissions can be constrained by organizational access.

Potential dimensions:
- all units;
- selected units;
- sector where applicable.

Example:

~~~
User A
permission: audit.inspection.read
scope: CMD, HRAD
~~~

User A must not access an inspection from another unit merely by guessing/changing an ID.

## Default deny

When authorization data is absent, ambiguous or cannot be evaluated, access is denied.

New modules must not become visible to every authenticated user by accident.

## Enforcement

At least two levels should normally exist:

1. UI/navigation — avoid offering inaccessible actions.
2. Trusted enforcement layer — API/server/database policy validates access independently.

The trusted layer is authoritative.

## Administrative access

Administrative capabilities must be explicit permissions. Administrator must not become an undocumented bypass scattered through code.

If a true platform-superuser mechanism exists, it must be intentionally designed, logged and tightly limited.

## Data export

Export permissions require the same or stricter data-scope checks as normal reading. Export endpoints must not bypass unit/sector restrictions.

## Auditability

Changes to roles, permissions and user scope should be recorded in the system audit log.

## Open decisions

Before implementation we still need to define:
- identity/auth provider;
- whether multiple roles per user are needed in v1;
- exact unit/sector scope representation;
- permission caching strategy;
- database-level enforcement capabilities of the selected stack.
