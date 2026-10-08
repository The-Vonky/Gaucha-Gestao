# Core Foundation v2 — Wave 2 Orchestration

Status: READY FOR PARALLEL IMPLEMENTATION
Baseline: integration/core-foundation-v2-wave2

## Objective

Deliver the stable Core read/administration contracts needed by all business modules while preserving the long-term architecture.

This wave is deliberately split so parallel agents do not edit the same surfaces.

## Included baseline

This branch already contains:
- the reconciled Core Admin quick wins through `5d5c9e91fff8a4e167ffed26d4d0647e7336520f`;
- `CORE_FOUNDATION_V2.md`;
- `ACCOUNT_LIFECYCLE_V1.md`;
- `ACCESS_GOVERNANCE_V1.md`;
- `CORE_CONSUMER_CONTRACT_MAP_V1.md`.

Quality/Audit/Action Plans remain frozen except for compatibility work explicitly approved after Core contracts stabilize.

## Parallel tracks

### A — Core reference resolvers
Branch: `feat/core-reference-resolvers-v1`

Purpose:
- safe, minimal Core read contracts for resolving canonical users/units/sectors by known identifiers;
- no unrestricted corporate user enumeration;
- no account lifecycle or access-review UI.

Primary ownership:
- additive PostgreSQL migration(s);
- database/RLS/integration tests;
- no Administration UI.

### B — Access governance read model
Branch: `feat/core-access-governance-read-v1`

Purpose:
- read-only server/database contracts for user access summary, unit access summary, profile impact and assignment history;
- preserve current authorization boundaries;
- no mutation redesign yet.

Primary ownership:
- additive PostgreSQL migration(s);
- database/RLS/integration tests;
- no frontend pages.

### C — Human-readable system log read model
Branch: `feat/core-audit-log-read-model-v1`

Purpose:
- authorized log projection/filtering suitable for non-technical Administration;
- resolve names only when authorized or from approved event snapshots;
- keep raw immutable IDs/details available as technical detail;
- no broad directory bypass.

Primary ownership:
- additive PostgreSQL migration(s);
- database/RLS/integration tests;
- no frontend redesign yet.

### D — Trusted identity boundary ADR + implementation brief
Branch: `docs/adr-core-identity-boundary-v1`

Purpose:
- close the only high-risk infrastructure decision blocking account lifecycle implementation;
- choose a trusted runtime/topology compatible with ADR-004 and self-hosted Supabase;
- define ingress, secrets, Auth admin operations, audit, failure compensation, healthcheck and deployment boundaries.

Primary ownership:
- ADR/documentation only;
- no runtime/service code in this track.

## Non-overlap rules

- A/B/C may each add their own migration; never edit an already applied migration.
- A/B/C must not edit Admin React pages, shared UI, Audit, Action Plans or account/Auth runtime.
- D must not implement code.
- No track may add future-module permissions.
- No track may weaken existing RLS or expose Auth/service-role data to browser clients.
- Do not create one universal "people" table or a universal business attachment table.

## Integration order

1. A, B, C and D complete independently.
2. Independent review of each delta.
3. Merge/rebase into this integration branch one at a time after review.
4. Run foundation + reproducible infrastructure validation after each database merge.
5. Only then start Wave 2B frontend consumers and account lifecycle implementation.

## Wave 2B, prepared but not started yet

After A/B/C contracts are integrated:
- Administration access-review UI;
- Unit dossier UI;
- readable Logs UI.

After D is accepted:
- trusted identity service/runtime implementation;
- account creation/reset/first-access;
- My Account/self-service password change.

## Durability guardrails

- stable UUID references; names/codes are presentation/business identifiers;
- inactive entities preserve history;
- responsibility does not implicitly grant access;
- authorization remains permission + scope + domain rule;
- Core owns users/units/sectors/RBAC/system audit; modules own business workflow;
- raw technical identifiers stay available for diagnostics but do not dominate operator UX;
- migrations remain append-only;
- no production deployment from this wave;
- no `supabase db reset` on the user's working environment.
