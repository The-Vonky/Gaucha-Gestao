# Design Brief — Core Access Governance v1

Status: DESIGN ONLY
Base: `d2e30774eb7ab354f13edc7968a5b47f1d2a0891`
Target integration branch: `integration/core-foundation-v2`

## Objective

Design Administration so a non-technical administrator can answer:
- who has access?
- to what?
- through which profile/scope?
- who granted or revoked it and when?
- what users will be affected if a profile changes?
- what access exists for a given unit?

No implementation in this track.

## Problems to cover

- Logs require actor UUID and expose technical UUID/JSON details.
- Access review is currently user-by-user rather than unit/profile centric.
- Assignment history does not present grant/revoke actor and timestamps clearly.
- Role permission edits do not present impact before save.
- Unit Administration does not provide a dossier of sectors + users/access + cover.
- Unlink failures need domain-level diagnosis rather than generic FK text.
- Export/review needs should be defined for user/access governance.

## Design scope

Specify read models/RPCs/views needed for:
- human-readable actor/entity resolution in logs while preserving immutable IDs;
- user access summary;
- unit access summary;
- profile impact / users holding a profile;
- assignment history with grant/revoke metadata;
- unit dossier;
- access-review/export dataset;
- direct navigation such as “Ver logs deste usuário”.

Define which data may be exposed to:
- admin.user.read;
- admin.user.manage;
- admin.role.read/manage;
- admin.unit.read/manage;
- admin.audit_log.read.

## Error semantics

Propose domain-specific server errors/RPC responses where the client currently cannot distinguish authorization, stale version and referential blockers safely.

Do not weaken RLS to improve UX.

## Deliverable

Create:
`docs/architecture/ACCESS_GOVERNANCE_V1.md`

Include:
- operator questions -> read contract mapping;
- proposed RPC/view contracts;
- authorization matrix;
- audit/privacy considerations;
- export scope;
- explicit v1 vs post-v1 split;
- unresolved PO decisions.

No implementation in this branch.
