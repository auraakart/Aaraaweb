# Backup and Restore Evidence

Updated: 2026-09-08

This document defines the evidence required before Aaraagate pilot or production acceptance. It is deliberately provider-neutral. The repository CI restore drill proves the database can be logically dumped and restored on PostgreSQL; it does not prove that a future hosting provider has enabled managed backups, retention or point-in-time recovery.

## Repository restore drill

The `Backup restore smoke` workflow must:
- apply the complete Prisma migration history to a clean PostgreSQL source database;
- create a known verification marker;
- create a custom-format `pg_dump` backup without ownership or privilege coupling;
- restore into a separate clean database;
- verify the marker, Prisma migration history and non-empty restored schema;
- emit a small evidence artifact containing the workflow run ID, commit SHA, ref, UTC timestamp, migration count and restored public-table count.

The evidence artifact must not contain database credentials, connection strings, application secrets or user/society data.

## Hosted provider evidence required before pilot

Complete this section only after a staging/production-capable PostgreSQL provider has been selected and provisioned.

| Evidence | Required value |
| --- | --- |
| Environment | staging / production |
| Provider/project | provider and project/resource identifier |
| Database resource | non-secret database/resource identifier |
| Automated backups enabled | yes/no |
| Backup frequency | documented provider schedule |
| Retention | documented retention period |
| Encryption at rest/in transit | confirmed |
| PITR available/enabled | yes/no/not offered |
| Last successful provider backup | timestamp + provider backup identifier |
| Isolated restore target | non-production resource identifier |
| Restore source | backup/PITR identifier and source timestamp |
| Restore started | UTC timestamp |
| Restore completed | UTC timestamp |
| Restore operator | accountable operator/release owner |
| Application startup against restore | pass/fail/not-safe-to-run |
| `/api/v1/health/ready` against restore | pass/fail/not-applicable |
| Critical data sanity checks | pass/fail with evidence reference |
| Result | pass/fail |
| Follow-up issues | issue/incident references or none |

## Acceptance rules

A provider restore exercise passes only when the restore is performed into an isolated non-production target and the restored database is demonstrably usable. Never overwrite production to test restore capability.

Repository CI evidence and hosted-provider evidence serve different purposes and both are required before production-live status:
- CI evidence validates migration-compatible logical backup/restore behavior for the codebase.
- Hosted evidence validates the real provider backup configuration, retention and recoverability of the deployed environment.

Do not place credentials, secret values, customer PII or raw production data extracts in this document, GitHub issues, workflow artifacts or release notes.
