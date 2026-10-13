# Implementation Brief — Core Reference Resolvers v1

Status: READY FOR IMPLEMENTATION
Base: `integration/core-foundation-v2-wave2`
Target integration branch: `integration/core-foundation-v2-wave2`

## Objective

Provide safe, stable Core read contracts for resolving canonical users, units and sectors by known identifiers without granting broad administrative directory access to business modules.

This is a backend/database contract task. Do not build UI.

## Required reading

- `AGENTS.md`
- `docs/architecture/CORE_FOUNDATION_V2.md`
- `docs/architecture/AUTHORIZATION.md`
- `docs/architecture/DATA_MODEL.md`
- `docs/architecture/SECURITY.md`
- current Core migrations/tests.

## Product decisions already fixed for this brief

- canonical user identity is Auth/Core profile UUID;
- a new business responsibility may reference a registered Core user;
- user/unit/sector deactivation preserves historical references;
- responsibility does not itself grant access;
- UUID is the stable reference; names/codes are display/business data;
- this brief does NOT authorize a global business-user directory or broad enumeration of all active users.

## In scope

Design and implement narrowly-scoped read RPCs/projections that allow a caller to resolve already-known Core references needed by authorized records.

At minimum cover:
- user/profile reference by known UUID(s): id, display_name, active;
- unit reference by known UUID(s): id, code, name, active;
- sector reference by known UUID(s), including unit/sector validity where relevant: id, code, name, active;
- bounded batch input with deterministic ordering/limits;
- explicit behavior for missing, invisible and inactive references;
- no e-mail, last sign-in, Auth metadata, roles or permission composition in these resolvers.

Prefer one small projection per concept or one clearly typed RPC family. Do not expose raw tables more broadly just to make selectors easy.

## Authorization

- caller must be an active authenticated user;
- resolution must not become an enumeration bypass;
- known-ID resolution may return only references the caller is already entitled to see under the approved contract;
- if the current RLS cannot safely support a required reference, implement a narrow SECURITY DEFINER function with fixed/empty search path, fully qualified objects and least EXECUTE grants;
- do not use service role;
- do not add future-module permissions.

If a generic business-user selector cannot be authorized safely from current product decisions, DO NOT invent one. Report that as intentionally out of scope.

## Database rules

- additive migration only;
- never edit existing migrations;
- preserve current schemas and RLS;
- bounded arrays / row counts;
- stable deterministic results;
- no business-module dependency from Core.

## Tests

Add database/RLS/integration coverage for:
- anonymous denied;
- inactive caller denied;
- authorized known reference succeeds;
- guessed/unknown ID does not reveal more than contract allows;
- inactive referenced entity remains resolvable where historical reading permits;
- batch limit enforced;
- no e-mail/Auth metadata leakage;
- no cross-scope escalation.

Run full validation required by repository.

## Explicitly out of scope

- account creation/reset/passwords;
- unrestricted employee directory;
- assigning responsibility in Audit/Action Plans;
- UI selectors;
- access-review reports;
- logs read model;
- new module permissions;
- Quality changes.

## Completion

Focused commits only. Do not merge. Open a PR targeting `integration/core-foundation-v2-wave2` only after validation.
