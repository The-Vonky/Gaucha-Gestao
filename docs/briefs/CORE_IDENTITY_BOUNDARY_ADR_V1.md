# Design Brief — Trusted Core Identity Boundary v1

Status: READY FOR ARCHITECTURE DECISION
Base: `integration/core-foundation-v2-wave2`
Target integration branch: `integration/core-foundation-v2-wave2`

## Objective

Close the high-risk architecture decision required before implementing administrative account creation, credential reset, first-access onboarding and self-service password change.

This branch is documentation/ADR only. Do not implement a runtime.

## Required reading

- `AGENTS.md`
- `docs/architecture/ACCOUNT_LIFECYCLE_V1.md`
- `docs/architecture/SECURITY.md`
- `docs/decisions/ADR-004-platform-stack.md`
- `docs/decisions/ADR-005-core-authorization.md`
- current Docker Compose/Kong/Auth topology.

## Decision to make

Choose the trusted runtime/topology for privileged Auth operations while preserving ADR-004 as much as possible.

Evaluate at least:
1. a small Core server service behind the existing gateway/tunnel;
2. adding self-hosted Supabase Edge Functions runtime;
3. any narrower supported option that does not expose service-role credentials to the browser.

Do not choose based on novelty. Optimize for:
- multi-year maintainability;
- least privilege;
- operational simplicity on one Docker Compose host;
- observability/healthcheck;
- deterministic CI;
- backup/restore implications;
- secret rotation;
- failure compensation between Auth and Core;
- future extensibility without creating a general-purpose backend monolith.

## Required ADR output

Create an ADR that specifies:
- selected topology and why;
- rejected alternatives and trade-offs;
- runtime/language/framework policy;
- route/ingress boundary;
- how browser JWT is validated;
- how admin authority is revalidated server-side;
- where service-role/admin Auth credentials exist;
- how Core DB mutations/audit are performed;
- idempotency and partial-failure strategy;
- rate limiting;
- health/readiness;
- logs/metrics;
- local/CI topology;
- production deployment implications;
- rollback/upgrade policy;
- exact files/services that a later implementation brief may modify.

Also create the follow-up implementation brief for the selected option, but do not implement it.

## Hard constraints

- no service-role/admin secret in browser bundle;
- no direct manipulation of `auth.users` tables as an unsupported substitute for Auth Admin API;
- no public signup;
- no production deployment;
- no Quality changes;
- do not silently change ADR-004; if topology changes, record it explicitly in the new ADR.

## Completion

Commit ADR + implementation brief. Do not merge. PR target: `integration/core-foundation-v2-wave2`.
