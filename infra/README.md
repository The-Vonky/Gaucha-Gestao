# Reproducible minimum Supabase (CI / disposable staging)

Five services only: PostgreSQL 17 (`db`), Kong (`kong`), GoTrue (`auth`), PostgREST
(`rest`), Storage API (`storage`). No deploy, existing machine DB, physical server
or production access is involved. See [upstream provenance](supabase/UPSTREAM.md)
and [Proposed ADR-006](../docs/decisions/ADR-006-infra-v1-reused-hardware.md).

## Prerequisites and lifecycle

Use Linux, Docker Engine, Docker Compose v2 with `up --wait` / `config --format json`,
Bash, Node >=22.12, Git, coreutils and ShellCheck. The CI uses an ephemeral Ubuntu
runner. No npm install is needed for these ops scripts or the smoke.

Generate a **new** env file in an existing directory outside every Git checkout.
The generator refuses internal/symlinked-internal destinations and existing files,
uses mode 600 and never prints credentials. API JWT keys expire after one hour;
regenerate a fresh stack for a new test session. This is not a persistent-secret
lifecycle or production provisioning tool.

From the repository root:

```bash
# Choose an unused name and a new external directory for each disposable run.
infra_tmp=$(mktemp -d)
infra_env="$infra_tmp/staging.env"
infra_project="gaucha-infra-staging-$(date +%s)"
bash scripts/ops/gen-secrets.sh --environment staging --output "$infra_env"
# Edit SITE_URL, API_EXTERNAL_URL, ADDITIONAL_REDIRECT_URLS and GATEWAY_PORT
# in this external file if needed. Keep permissions 600. Do not echo secrets.

docker compose --env-file "$infra_env" -p "$infra_project" -f infra/supabase/docker-compose.yml config --quiet
docker compose --env-file "$infra_env" -p "$infra_project" -f infra/supabase/docker-compose.yml up -d --wait --wait-timeout 300
bash scripts/ops/apply-migrations.sh --environment staging --env-file "$infra_env" --project "$infra_project" --database postgres
bash scripts/ops/healthcheck.sh --environment staging --env-file "$infra_env" --project "$infra_project" --database postgres
node scripts/ops/smoke.mjs --environment staging --env-file "$infra_env" --project "$infra_project" --database postgres

# Destructive disposal ONLY of this explicitly selected disposable project.
docker compose --env-file "$infra_env" -p "$infra_project" -f infra/supabase/docker-compose.yml down -v --remove-orphans
rm -f "$infra_env"
rmdir "$infra_tmp"
```

Use a shell `trap`/`finally` to perform the final cleanup on failure too; the workflow
already does so with `if: always()`. Never run the example against a reused project's
volumes. A new generated instance marker must match the DB bootstrap marker.
Production mode is refused by every ops entrypoint; `production.env.example` is an
explicitly non-runnable record of unresolved configuration, not a deploy template.

Only `127.0.0.1:GATEWAY_PORT` is exposed (default 54321). PostgreSQL has **no** host
port; scripts use `compose exec` inside the named project. Ports/containers/volumes
from existing development checkouts are not touched. If the gateway port is occupied,
choose another unused port and update API_EXTERNAL_URL accordingly.

## Migration safety

Every command requires explicit environment, external env file, project name and
DB name. `common.sh` parses data without shell evaluation and checks a fresh-instance
marker inside the Compose DB. Only `ci` and disposable `staging` are supported.
The target is the isolated Compose `db`, never a host connection string.

`apply-migrations.sh` requires no existing `core` schema or infrastructure migration
ledger, and executes `supabase/migrations/*.sql` in filename order **byte-for-byte**.
The files retain their own transactions. Each success records its SHA-256. Platform
Auth/Storage migrations finish during service startup before application migrations.
There is no reset/drop/replay mode. A partially applied run is a failed disposable
stack: dispose that explicit project, generate new credentials and use a fresh
project. Application schemas, storage policies and `supabase/config.toml` are unchanged.

## Validation contract

The new `infra-validate.yml` checks syntax and ShellCheck, missing-target/path guards,
Compose config, exact five services, image version pins, no DB or internal API ports,
loopback gateway, schemas/row limit/signup/file settings. It generates credentials
outside checkout, masks them and starts only these services with bounded readiness.

Healthcheck verifies container health, a working PostgreSQL 17 primary, active Auth,
REST and Storage responses through Kong, free bytes/inodes and writable data paths
(100 MiB / 100 inodes minimum; readiness guard, not capacity planning). Storage gets
an actual tiny write/delete probe. Any mandatory failure returns non-zero.

Smoke verifies all current migration hashes and representative objects, public
signup rejection, synthetic admin-created user login, denied anon access to an
existing Core row, exactly two private buckets, 10 MiB bucket/module boundaries,
exact exposed schemas (including rejection of a private profile) and actual
PostgREST truncation to 1000 of 1001 synthetic rows. It removes synthetic fixtures;
CI destroys all volumes regardless of outcome. Domain scenarios remain in existing
integration tests, which still run against the original CLI stack.

The negative test stops Storage, requires healthcheck failure, restores Storage and
requires health again. `docker stats` is informational only. Nothing here demonstrates
physical-host health or capacity, durable staging readiness, or production readiness.

## Omitted / residual work

Realtime, edge-runtime/Functions, imgproxy, Supavisor, analytics/Logflare, Vector,
Studio, postgres-meta and Mailpit have no service definitions or routes. Mail delivery,
production Storage backend, asymmetric/opaque API-key lifecycle, backups, restore,
WAL/PITR, off-site storage, ingress/deploy and monitoring are not implemented.
Images use release version tags; digest pinning and a production update policy are
future decisions. See UPSTREAM.md for differences from CLI 2.117.0.
