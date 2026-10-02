# ADR-006 — Reproducible infrastructure v1, hardware decision deferred

Status: Proposed
Date: 2026-10-01

## Context and scope

The current application CI uses a disposable Supabase CLI 2.117.0 stack. This PR
adds a reproducible self-hosted Compose validation path for the same application
contract. It does not deploy, accept production infrastructure, or validate P1–P9.
The filename refers to the future reused-hardware evaluation, not evidence that
any physical server is suitable.

ADR-004 remains the historical accepted platform direction. For this PR, the
explicit brief limits the implemented profile to current functional dependencies;
this proposed ADR does not ratify or replace ADR-004's production choices.

## Decisions proposed by this PR

- The default and only implemented profile contains PostgreSQL major 17, Kong,
  GoTrue/Auth, PostgREST and Storage API. The application currently requires these
  five services. Realtime, Functions, imgproxy, Supavisor, analytics/Logflare,
  Vector, Studio, Meta and Mailpit are omitted.
- CI and disposable staging use Storage's local/file backend in an isolated named
  volume. Both application evidence buckets remain private, with their existing
  10 MiB limits and unchanged migration policies. This is not a production
  object-storage decision.
- The Compose source is official `self-hosted/v0.8.1`, commit
  `8c7a4d9dbbaf8b552893822e89d7bf06f33f9220`, using its official Kong override.
  Every runtime image has an explicit version tag. See `infra/supabase/UPSTREAM.md`
  for versions, CLI comparison and the exact minimal adaptations.
- Existing application migrations/config are unchanged. The runner applies the
  existing migration files to an explicitly identified fresh isolated DB. No reset,
  implicit target or production mode is provided.
- Env examples are placeholders. Credentials are generated outside Git checkouts;
  CI credentials, API keys, users, volumes and all test data are ephemeral.
- PostgreSQL has no published host port; only the gateway binds a loopback HTTP
  port. URLs and redirects are configured per environment. No real ingress or
  production endpoint is configured.

## Explicitly undecided / deferred

- Production architecture and configuration remain undefined by this PR.
- Physical hardware, including the ML350, has not been inventoried or validated.
- VM versus bare metal has not been decided here.
- WAL-G versus pgBackRest has not been decided.
- Backup/restore, WAL/PITR, Google Drive, rclone and off-site recovery are for later
  PRs. This PR implements none of them.
- Production ingress, deploy, Ansible, monitoring/alerting, reconciliation timers,
  edge nosniff/cache rules and physical homologation remain outside this PR.

## Consequences

A clean CI runner can start the minimum stack, apply current migrations, actively
check health and prove the infrastructure contract. A stopped mandatory Storage
service must make the healthcheck fail; the runner then restores it and checks
health again before destroying all volumes.

The runner's Docker stats are informational and provide no evidence of ML350
capacity. File storage is disposable, not backed up. Partial migration failures
require a new disposable stack. Version differences from the CLI remain visible
and are tested, not assumed equivalent. Production readiness remains **NO**.
