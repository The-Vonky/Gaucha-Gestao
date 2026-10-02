# Supabase upstream provenance

Baseline application: `e7ed7d5167d4b7e592532df0830d6b2744d96eff`.
Existing CI: [36889526091](https://github.com/The-Vonky/Gaucha-Gestao/actions/runs/36889526091), both jobs successful.

## Official, pinned origin

Use [supabase/supabase self-hosted/v0.8.1](https://github.com/supabase/supabase/releases/tag/self-hosted/v0.8.1) (2026-09-09), peeled commit **`8c7a4d9dbbaf8b552893822e89d7bf06f33f9220`**.
The annotated tag object is `690080884040e238926ba22606e8c05a3536829b`.
Sources: `docker/docker-compose.yml`, `docker/docker-compose.kong.yml`,
`docker/volumes/api/kong.yml`, `docker/volumes/api/kong-entrypoint.sh`,
`docker/volumes/db/roles.sql`, `docker/volumes/db/jwt.sql`, `docker/CHANGELOG.md`.
All source links below use this commit; no tracking branch or `latest` is used at runtime.

This released Compose baseline supplies PostgreSQL 17 and an official Kong override.
Since v0.8.0 the upstream default gateway is Envoy; this PR deliberately selects
its supported Kong override to satisfy the application brief. The CLI is a separate
release stream: **CLI 2.117.0 is not a Compose release number**.

## Exact comparison with disposable CLI CI

CLI [v2.117.0](https://github.com/supabase/cli/tree/21db855916f2c2b12f61cde923a27094b8528b23), peeled commit `21db855916f2c2b12f61cde923a27094b8528b23`, annotated tag `cdcb8e4a8bc8d10658f194186d39739f43c04d1b`.
Versions are from `apps/cli-go/pkg/config/templates/Dockerfile` at that commit,
corroborated by image pulls in existing CI job `110461309280`.

| Component | CLI 2.117.0 / existing CI | Official self-hosted v0.8.1 / this PR |
| --- | --- | --- |
| PostgreSQL | `supabase/postgres:17.6.1.167` | `supabase/postgres:17.6.1.136` |
| Kong | `library/kong:2.8.1` | `kong/kong:3.9.3` |
| Auth | `supabase/gotrue:v2.196.0` | `supabase/gotrue:v2.196.0` |
| PostgREST | `postgrest/postgrest:v16.2` | `postgrest/postgrest:v14.17` |
| Storage | `supabase/storage-api:v1.72.1` | `supabase/storage-api:v1.74.0` |

The CLI mirrors images through `public.ecr.aws/supabase`; names in the table
identify the source images, not an assertion that registry digests are identical.
Keep the released self-hosted combination rather than inventing a hybrid from CLI
versions. Auth matches; PostgreSQL remains major 17. REST and Storage version
differences must pass this PR's actual migration, contract and API smoke validation.
Existing integration CI continues to validate the unchanged CLI stack independently.
Version tags are pinned; registry tag immutability is not guaranteed by this PR.

## Minimal adaptation and traceability

- Exactly `db`, `kong`, `auth`, `rest`, `storage`; remove optional services and their
  dependencies/routes, including Studio/Meta, Realtime, Functions and analytics.
- Fold the official Kong override into the base file; omit HTTPS listener and bind
  its HTTP listener to loopback for disposable validation. No DB port mapping.
- Preserve Auth, REST and file Storage topology. Disable image transformation;
  omit imgproxy dependency. Set the application's schemas, 1000-row maximum,
  disabled public signup and 10 MiB global file limit. Bucket limits come unchanged
  from the application's migrations.
- Retain required upstream role-password and JWT DB initialization; restrict role
  passwords to Auth/REST/Storage because the omitted webhook SQL creates the
  unused Functions role. Disable SQL statement/error-query logging before secrets. Omit optional
  Realtime/webhooks/analytics/pooler SQL. Persist DB, DB config and files in isolated
  Compose named volumes instead of host paths. Add a fresh-stack target marker.
- Keep the upstream Kong entrypoint; retain only required API routes and consumers.
  Opaque API-key support is left unset; ephemeral legacy JWT keys work with the
  application's existing Supabase client contract.
- Add `scripts/ops/common.sh` for shared explicit target validation, and
  `volumes/db/99-target.sql` for marking newly initialized disposable/staging DBs.
  These are the only structural additions needed beyond the suggested files.

Pinned source root:
<https://github.com/supabase/supabase/tree/8c7a4d9dbbaf8b552893822e89d7bf06f33f9220/docker>.
No claim of production readiness, hardware capacity or equivalence between the
CLI's database bootstrap and the self-hosted image bootstrap is made.

Unmodified vendored file (SHA-256):

| Local file | SHA-256 |
| --- | --- |
| `volumes/api/kong-entrypoint.sh` | `399394576635f7477dfee32e870f509567fc496f0dc86a5a6611f58d1099031f` |

The upstream DB files before adaptation have SHA-256
`3ad717b225daa38aa982da26750f35641eb404e1eb5e69a763c22236ab96c1b2`
(`roles.sql`) and `1cc94a4f16f6e2932b383cd68e211a96bcae298437ca4120d8a5106396c58465`
(`jwt.sql`). They are **adapted**, not byte-identical vendoring: remove passwords
for Pooler/Functions roles and disable session statement/error-query logging.
Postgres also retains upstream `log_min_messages=fatal` and explicitly disables
statement/error-query logging at startup. This prevents signing material and
role-password initialization from being recorded in container logs.

Bootstrap readiness has two phases: DB/Auth/Storage/Kong become healthy before
application migrations; REST's final readiness follows the unchanged migrations
that create `core`, `audit`, `action_plans`. Storage/Kong therefore depend on
REST being started rather than already having an application schema cache.
The initial readiness gate and final full-stack `up --wait` both have bounded
timeouts. PGRST_DB_SCHEMAS is never temporarily reduced.

Storage's loopback readiness probe uses explicit `127.0.0.1` rather than
`localhost`; the Storage process binds IPv4, while wget may resolve localhost
to IPv6 first. Upstream uses the `storage` Docker hostname (also IPv4). Failure
diagnostics include only redacted logs and health state, never container env.

Kong route blocks retain upstream YAML quoting verbatim. Its entrypoint inserts
Lua expressions containing single quotes; converting those header scalars to
single-quoted YAML makes the expanded configuration invalid. The reduced routes
are semantically unchanged and the expanded legacy-key template is parse-checked.

## Application migration role

The DB image source tag `supabase/postgres:17.6.1.136` resolves to
[`d156ba65c14694c12cc5e782bc15b9b8ed2d1376`](https://github.com/supabase/postgres/tree/d156ba65c14694c12cc5e782bc15b9b8ed2d1376).
Its `migrations/db/migrate.sh` sets PGPASSWORD from POSTGRES_PASSWORD and creates
the `postgres` login with that password during fresh Docker initialization.
`ansible/files/postgresql_config/pg_hba.conf.j2` uses SCRAM for the Docker network,
while localhost uses trust. Application migrations therefore authenticate directly
as `postgres` via the `db` Docker hostname; marker/ledger operations retain the
infrastructure helper. CI proves correct-password login, incorrect-password
rejection and actual schema/SECURITY DEFINER ownership. No ALTER OWNER is used.
