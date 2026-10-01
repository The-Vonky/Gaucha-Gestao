# Backup and Recovery

## Principle

A backup is not considered reliable until restoration has been tested.

Backup design covers more than the database. The platform may depend on:
- relational database;
- uploaded files/object storage;
- application configuration;
- secrets/configuration references;
- deployment artifacts;
- migration history.

## Required properties

The production design must define:
- what is backed up;
- frequency;
- retention;
- destination;
- encryption/access control;
- monitoring of backup failures;
- restoration procedure;
- responsible person;
- recovery point objective (RPO);
- recovery time objective (RTO).

Technical RPO, RTO inside operating hours, RTO outside operating hours and retention periods remain pending definition/measurement.

## Operational decisions and provisions — 2026-10-01

| Responsibility / provision | Current decision |
| --- | --- |
| Operational owner | Current person responsible for the project |
| Backup/restore owner | Same person responsible for the project |
| Alert recipients | Current person responsible for the project + supervisor |
| Provisional operating window | Monday–Friday, 07:00–18:00 (America/Sao_Paulo), with occasional exceptions |
| Infrastructure expected to remain powered on | 24x7; not a verified availability or support guarantee |

Business requirement: data that the system has confirmed as saved must not be lost. This is a business requirement, not a proven technical recovery guarantee. **Do not record RPO=0:** no architecture has yet been demonstrated capable of guaranteeing zero RPO.

Technical RPO, RTO inside the provisional operating window, RTO outside that window, and retention for backups, system audit logs and removed objects remain pending definition/measurement. These decisions leave O1 **PARTIAL**, not CLOSED. Backup independence, restore drills and operational readiness still require evidence; this document does not authorize production release.

## Minimum recovery scenarios

The restore procedure must be able to address:

1. accidental deletion/corruption of records;
2. bad application deployment;
3. bad schema migration;
4. server/disk loss;
5. loss/corruption of uploaded files;
6. credential or configuration loss;
7. complete rebuild on replacement infrastructure.

## Database

Production database backups should be automated and stored independently enough that loss of the application server does not destroy the only backup.

Before destructive schema/data changes:
- create/verify an appropriate recovery point;
- test migration outside production;
- document rollback or forward-fix strategy.

## Files

If modules store evidence, contracts, images or documents, backup scope must include those files and their metadata.

Database restoration without matching file storage may produce an internally inconsistent platform.

## Application code

Git is the source of truth for application source and migrations, not a substitute for production data backup.

Releases/deployments should be reproducible from versioned code and configuration definitions.

## Restore tests

Perform scheduled restore exercises into an isolated environment.

A restore exercise should verify:
- database starts;
- schema and migrations are coherent;
- representative records are readable;
- file references work;
- authentication/configuration can be re-established;
- application can start against restored data.

Record the date, backup used, result, issues and corrective actions.

## Standalone-system migration

Before cutting a standalone system over to Gaúcha Gestão:
- capture a final verified recovery point of the standalone system;
- document source data version;
- validate record counts/totals where applicable;
- keep a defined rollback window;
- do not destroy the legacy data immediately after cutover.

## ERP Contracts

Because backup behavior in the current standalone Contracts system requires review, its migration cannot be considered low-risk until the current backup and restore process has been audited.
