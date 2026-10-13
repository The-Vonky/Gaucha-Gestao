# Implementation Brief — Core Audit Log Read Model v1

Status: READY FOR IMPLEMENTATION
Base: `integration/core-foundation-v2-wave2`
Target integration branch: `integration/core-foundation-v2-wave2`

## Objective

Implement an authorization-safe read model for `core.system_audit_log` so the future Administration UI can filter and display system events in human terms without weakening the immutable audit trail.

No frontend redesign in this branch.

## Required reading

- `AGENTS.md`
- `docs/architecture/ACCESS_GOVERNANCE_V1.md`
- `docs/architecture/CORE_FOUNDATION_V2.md`
- `docs/architecture/AUTHORIZATION.md`
- `docs/architecture/SECURITY.md`
- current log schema, RLS and LogsPage/API.

## In scope

Provide a typed, paginated server/database projection for authorized log readers with:
- immutable log id / occurred_at;
- actor_user_id plus authorized actor display name when resolvable;
- module/action/entity_type/entity_id;
- authorized unit/sector display labels when resolvable;
- before/after/metadata kept available for technical detail under the same log authorization;
- filters suitable for actor, module, action, entity type, entity id, date/time interval;
- actor search by human name only if it can be done without turning the endpoint into a user-directory bypass;
- stable pagination and count.

If historical display name snapshots are not already present, do not rewrite old events or invent them. Current authorized name may be used only according to the architecture document.

## Security/privacy

- `admin.audit_log.read` remains the base gate, including scope;
- resolving names must not grant broader directory visibility;
- e-mail and last sign-in are out of scope;
- absent/invisible related entity must not leak existence through error shape;
- raw JSON/IDs are technical detail, not a separate privilege escalation;
- no direct write privileges to the audit table.

## Database rules

- additive migration only;
- preserve immutable source log;
- do not create duplicate audit events just for presentation;
- SECURITY DEFINER only if necessary, with fixed search_path and explicit grants;
- avoid expensive unbounded text search over the whole log.

## Tests

Cover:
- global and scoped log reader;
- anonymous/inactive denied;
- event outside scope hidden;
- actor name resolution when authorized;
- unresolved/inactive actor;
- unit/sector labels;
- actor/name filter without directory enumeration;
- entity id/type filter;
- timestamp boundaries;
- pagination/count;
- before/after content not altered.

Run full repository validation.

## Explicitly out of scope

- LogsPage UI changes;
- export;
- retention/purge;
- login/auth events;
- account lifecycle;
- business Audit module;
- mutation/error redesign.

## Completion

Focused commits only. Do not merge. PR target: `integration/core-foundation-v2-wave2`.
