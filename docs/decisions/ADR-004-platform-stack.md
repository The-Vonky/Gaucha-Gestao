# ADR-004 — Platform Technology Stack

Status: Accepted  
Date: 2026-09-24

## Decision

Gaúcha Gestão will use the following platform stack:

### Frontend
- React
- TypeScript
- Vite
- Cloudflare Workers Static Assets for production delivery

### Backend / data platform
- Supabase Self-Hosted
- PostgreSQL
- Supabase Auth
- PostgREST
- Realtime
- Storage API
- Supavisor where connection pooling is appropriate
- official Supabase gateway/topology preserved unless an accepted ADR explicitly changes it

### File storage
- Supabase Storage API
- Cloudflare R2 as the preferred S3-compatible object-storage backend for production

### Infrastructure
- HP ProLiant ML350 as the initial physical host
- Linux VM
- Ubuntu Server LTS
- Docker Engine
- Docker Compose

### Edge / ingress
- Cloudflare DNS
- Cloudflare WAF
- Cloudflare Tunnel
- no requirement for inbound public ports on the on-premise application host

### CI/CD
- GitHub
- GitHub Actions
- validation before deploy
- controlled production deployment
- no implicit production deploy from ordinary feature work

### Operations
- automated PostgreSQL backups
- logical backups
- physical/base backup + WAL archiving for PITR
- off-site backup copy
- periodic restore tests
- infrastructure recovery automation with Ansible
- monitoring/observability for host, containers, PostgreSQL, Supabase services, Tunnel and backup jobs
- frontend error telemetry with a privacy-reviewed tool such as Sentry

## Production topology

```text
                         INTERNET
                            |
                            v
                     CLOUDFLARE
                   DNS / WAF / CDN
                    /           \
                   v             v
        React/Vite Assets   Cloudflare Tunnel
        Workers Static            |
                                  v
                           Supabase Gateway
                                  |
             +--------------------+--------------------+
             |                    |                    |
             v                    v                    v
            Auth              PostgREST             Realtime
             |                    |                    |
             +--------------------+--------------------+
                                  |
                                  v
                              PostgreSQL
                                  ^
                                  |
                              Supavisor
                                  ^
                                  |
                     pooled DB clients when needed

                         Storage API
                              |
                              v
                       Cloudflare R2
```

The exact internal connections between Supabase services must follow the supported self-hosted topology. Supavisor is not assumed to be the mandatory path for every internal Supabase service.

## Security decisions

- PostgreSQL is not exposed publicly.
- Production credentials/secrets are not committed to Git.
- Browser code never receives PostgreSQL credentials or privileged Supabase secrets.
- Supabase Studio/technical administration must not be publicly exposed without additional access controls.
- Application authorization remains permission + organizational scope based.
- Cloudflare Tunnel is transport/ingress protection, not application authorization.
- Sensitive file access remains authorized through the application/storage security model.

## Deployment decisions

- Docker Compose is the accepted v1 orchestrator.
- Kubernetes and multi-node orchestration are out of scope without a concrete requirement.
- Small controlled deployment downtime is acceptable initially.
- Blue/green deployment is not a v1 requirement.
- Watchtower-style automatic production updates are not allowed.
- Supabase versions must be pinned and upgrades must be deliberate, tested and backed up.

## Backup decisions

Production database protection will use two complementary mechanisms:

1. Logical backup, such as PostgreSQL dumps, for portability/selective recovery.
2. Physical/base backup + WAL archiving for Point-in-Time Recovery.

WAL/base backups must have an off-site destination. Keeping the only recoverable copy on the ML350 is not acceptable.

Object storage is not considered a backup merely because it is off-host. File-retention/recovery strategy must be documented independently.

## Disaster recovery

The platform must be reproducible on replacement infrastructure.

Ansible is the preferred tool for host/application provisioning and recovery automation.

A disaster-recovery runbook must eventually support:

```text
replacement Ubuntu host
-> required packages/runtime
-> Docker
-> pinned Supabase stack
-> configuration/secrets injection
-> PostgreSQL restore/PITR
-> R2 attachment access
-> Tunnel restoration
-> application health checks
```

## Hardware decision boundary

The ML350 is accepted as the initial single physical host, knowingly creating a hardware SPOF.

The following are still pending physical inventory:
- CPU model/count;
- total RAM;
- disk count/type/capacity/health;
- RAID controller;
- protected write-back cache / BBWC / FBWC status;
- current RAID level;
- NICs;
- measured power usage.

RAID 10 is preferred for a write-heavy PostgreSQL workload when hardware/capacity justify it. RAID 1 remains acceptable for a small two-disk configuration. RAID is never a substitute for backup.

## Availability

Initial production accepts single-host availability.

Recommended physical resilience:
- UPS sized for server + essential networking;
- redundant power where available;
- dual-WAN/failover when economically justified;
- documented replacement-host procedure.

High availability with a second host is deferred until there is a business requirement.

## Consequences

Positive:
- low recurring infrastructure cost;
- strong control of company data and runtime;
- shared platform for all modules;
- proven web stack;
- simple single-host operations;
- strong disaster-recovery path;
- object storage decoupled from server disk;
- Cloudflare edge protects and serves static content.

Trade-offs:
- Supabase self-hosting requires operational ownership;
- the ML350 remains a SPOF;
- updates require discipline;
- backup, PITR, monitoring and restore testing are our responsibility;
- availability is limited by local power/network/hardware.

## Revisit when

Reconsider this stack only when evidence shows one of the following:
- single-host availability no longer meets business requirements;
- workload exceeds reasonable vertical scaling;
- compliance/security needs require another deployment model;
- self-hosted Supabase operational burden becomes materially higher than managed alternatives;
- a module has a justified runtime requirement incompatible with this architecture.
