# Architecture Overview

## Purpose

Gaúcha Gestão will consolidate nine existing/internal systems into one corporate platform while preserving clear domain boundaries and allowing gradual migration.

The goal is not to merge source code into one large folder. The goal is to share the corporate foundation while keeping business domains independently understandable and maintainable.

## Architecture style

Decision: modular monolith.

Logical structure:

~~~
Platform
|
+-- App Shell
|   +-- navigation
|   +-- session
|   +-- global context
|
+-- Core
|   +-- identity
|   +-- authorization
|   +-- users/profiles
|   +-- units
|   +-- sectors
|   +-- attachments
|   +-- system audit log
|
+-- Shared
|   +-- UI primitives
|   +-- generic utilities
|   +-- technical contracts
|
+-- Modules
    +-- Audit
    +-- ISO
    +-- Sales
    +-- Satisfaction
    +-- Meetings
    +-- Fleet
    +-- Planned vs Actual
    +-- ABC
    +-- Contracts
~~~

## Dependency rule

Allowed:

~~~
Business Module -> Core
Business Module -> Shared
App Shell -> Core
App Shell -> module public entry points
~~~

Forbidden:

~~~
Core -> Business Module
Module A -> internal files of Module B
Shared -> Business Module
~~~

Cross-module integrations must use explicit contracts. A module must not become coupled to another module's tables, internal components or implementation details without an architectural decision.

## Shared corporate concepts

Candidates for Core ownership:

- user/profile;
- role;
- permission;
- organizational unit;
- sector;
- user scope by unit/sector;
- attachment metadata and file access policy;
- system audit event;
- common application settings.

A concept is not moved to Core merely because two modules happen to use similar data. Core is reserved for stable corporate concepts.

## Module catalog

1. Audit / Quality Audit — active development; first module.
2. ISO Records — standalone complete.
3. Sales / Card Machines — standalone complete.
4. Satisfaction Survey — standalone complete.
5. Meeting Room Scheduling — standalone complete but requires redesign.
6. Fleet — active development.
7. Planned vs Actual — standalone complete, review desirable.
8. ABC Curve — active development.
9. Contracts ERP — standalone complete, backup/recovery review required.

## Migration strategy

No big-bang rewrite.

For each system:

~~~
inventory current behavior
-> define module boundary
-> define migration brief
-> reuse validated domain logic
-> integrate with Core
-> migrate data in controlled fashion
-> validate against standalone
-> cut over
-> retain standalone recovery point
~~~

A system being "complete" does not mean its current architecture must be copied. Valid business rules and calculations are assets; incidental technical structure can be replaced.

## Platform-wide capabilities before broad migration

Before several modules are operational together, the platform needs stable foundations for:

- identity and session handling;
- granular authorization;
- organizational scope;
- audit logging;
- common navigation/app shell;
- database migration discipline;
- backup and restore;
- secrets/configuration management;
- deployment environments;
- error handling and observability.

## Current implementation policy

The Audit system remains the priority. This repository must not delay completion of the standalone Audit system with speculative platform work.

The first platform implementation brief will define the minimum foundation needed to host Audit as module #1 without overbuilding capabilities required only by later modules.

## Selected platform stack

The production baseline is now accepted in `docs/decisions/ADR-004-platform-stack.md`.

Selected direction:
- React + TypeScript + Vite;
- Cloudflare Workers Static Assets for the frontend;
- Supabase Self-Hosted;
- PostgreSQL/Auth/PostgREST/Realtime/Storage;
- Cloudflare R2 as preferred production object storage;
- Ubuntu Server LTS VM on the HP ProLiant ML350;
- Docker Compose;
- Cloudflare DNS/WAF/Tunnel;
- GitHub Actions;
- automated backups, WAL/PITR, restore testing and Ansible-based recovery.

These choices are no longer open design questions unless ADR-004 is explicitly superseded.

## Decisions still intentionally open

The following remain to be resolved at implementation/detail level:

- exact RBAC/organizational-scope schema;
- initial permission catalog;
- exact Core physical schema;
- exact backup/PITR tool and retention;
- RPO/RTO;
- monitoring/observability tooling;
- file size/type/retention policies;
- exact DEV/STAGING/PROD layout;
- VM sizing and RAID choice after physical ML350 inventory.

Do not reopen the accepted platform stack while solving one of these implementation details.
