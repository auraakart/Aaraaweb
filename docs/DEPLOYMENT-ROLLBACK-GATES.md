# Deployment and Rollback Gates

Updated: 2026-09-08

This document defines the provider-neutral release controls for Aaraagate. It does not select a hosting, database, artifact, monitoring, or CI vendor.

## Promotion path

Production promotion remains:

`develop -> staging -> main -> production`

A production candidate must reach `main` only from `staging`. The release candidate SHA and the current `main` SHA must be recorded before merge so the application rollback target is explicit.

## Immutable release identity

Every production deployment must be tied to one immutable `main` commit SHA. Deployment configuration must set:

- `APP_VERSION` to the release/version identifier;
- `GIT_SHA` to that exact deployed commit SHA.

Where the hosting platform produces immutable images, bundles or release artifacts, retain the artifact identifier/digest alongside the commit SHA. Do not treat a mutable branch name such as `main` or `latest` as sufficient release identity.

## Database migration gate

Applied Prisma migration history is append-only.

For a release candidate relative to current `main`:

- existing files under `services/api/prisma/migrations/` must not be modified, deleted, renamed or rewritten;
- new migration files may be added in new migration directories;
- schema changes must remain forward-applicable through `prisma migrate deploy`;
- destructive or contract-style changes require explicit migration review and a rollout plan that preserves compatibility with the currently deployed application while rollout is in progress;
- prefer expand -> migrate/backfill -> contract rather than combining incompatible schema removal and application rollout in one step.

`scripts/release-migration-gate.sh` enforces migration-history immutability and emits release evidence. It does not attempt to prove semantic safety of arbitrary SQL; destructive/data-loss risk still requires human release review.

## Deployment gate

Before production traffic is enabled, verify all of the following against the exact candidate SHA:

1. candidate came from `staging` and required release checks are green;
2. release evidence records candidate SHA and rollback SHA;
3. migration-history immutability gate passes;
4. staging smoke/UAT/security acceptance is complete;
5. backup/restore evidence is current for the hosted environment;
6. `scripts/production-preflight.sh` passes in the actual production environment;
7. operational owner and rollback owner are identified;
8. release notes include material user-visible, migration and operational changes.

## Application rollback

Preferred application rollback is redeployment of the previous known-good immutable release identified by the recorded rollback SHA/artifact. Do not repair a production incident by editing code or database state manually unless an incident-specific recovery procedure requires it.

After application rollback:

- verify `/api/v1/health/live` and `/api/v1/health/ready`;
- verify critical Resident, Admin and Guard workflows;
- confirm API error rate and dependency health return to baseline;
- record the failed candidate SHA, rollback SHA, incident reason and follow-up action.

## Database rollback

Database rollback is not equivalent to application rollback. Prisma migrations are treated as forward history and are not automatically reversed.

If a migration causes an incident:

1. stop or constrain writes if continuing traffic could worsen data loss or incompatibility;
2. determine whether the previous application is compatible with the migrated schema;
3. prefer a forward corrective migration when safe;
4. restore from a verified backup/PITR point only when data recovery is actually required and the impact is understood;
5. never overwrite production merely to demonstrate that restore works.

## Evidence retained by CI

The release-readiness workflow records:

- exact candidate SHA;
- current `main` rollback SHA;
- source/target refs;
- migration count;
- migration-gate result and changed migration paths;
- workflow run identifier and timestamp.

This repository evidence proves the release controls executed. It does not prove that a live provider deployed the same artifact or that hosted backups/monitoring are configured; those remain hosted-environment acceptance evidence.
