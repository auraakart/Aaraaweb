# Aaraagate Hosting Decision

Updated: 2026-09-05

## Decision

Use **DigitalOcean Bangalore (BLR)** as the initial hosted staging and production platform for Aaraagate.

The application remains provider-portable. No Aaraagate business logic should depend on DigitalOcean-specific SDKs or APIs. Runtime integration stays behind standard environment variables and PostgreSQL/Redis-compatible protocols.

## Why this provider

Aaraagate is an India-first, operationally latency-sensitive product: gate approvals, visitor verification, resident actions and guard workflows should not depend on a cross-border round trip when an India region is available.

DigitalOcean currently provides:
- App Platform in Bangalore;
- managed PostgreSQL in Bangalore;
- Redis-compatible managed Valkey;
- VPC/private-network integration for App Platform and managed resources;
- Git-based App Platform deployments, health checks, deployment alerts and managed database notifications.

Railway and Render remain viable portability targets, but their current lack of an India deployment region makes them secondary choices for the initial India production baseline.

## Target topology

### Hosted staging
- DigitalOcean App Platform, Bangalore region.
- `aaraagate-api` Node/NestJS service.
- `aaraagate-admin` Next.js service.
- Managed PostgreSQL in the same Bangalore region.
- Managed Valkey in the same Bangalore region, used through `REDIS_URL`.
- Private/VPC connectivity between application and data services where supported.
- Provider liveness checks against `/api/v1/health/live` plus external dependency-aware readiness monitoring of `/api/v1/health/ready`.

### Production
Use the same topology and region, but do not promote until hosted staging UAT passes.

Production data services should use high-availability configurations before broad commercial rollout. Lower-cost single-node managed data services are acceptable for hosted staging/pilot validation only when the pilot owner explicitly accepts the availability limitation.

## Application contract

The hosting layer must provide these existing variables; no provider-specific application API is required:

API runtime:
- `NODE_ENV=production`
- `PORT`
- `DATABASE_URL`
- `REDIS_URL`
- `CORS_ALLOWED_ORIGINS`
- `APP_VERSION`
- `GIT_SHA`
- production OTP/provider credentials
- payment/push credentials when those integrations are activated

Admin build/runtime:
- `NEXT_PUBLIC_AARAGATE_API_BASE_URL`

Secrets must be stored in the DigitalOcean control plane or equivalent secret store, never committed to Git.

## Deployment policy

Hosted staging tracks the repository `staging` branch. Production tracks the promoted `main` release only after the repository release-readiness gate, UAT sign-off and independent approval have passed.

Do not enable unreviewed direct production auto-deploys from development branches.

Database migrations remain an explicit release action using `pnpm --filter @aaraagate/api prisma:migrate:deploy`. The application should start only against a schema compatible with the deployed release.

## Monitoring baseline

Minimum alerts:
- deployment failure;
- domain/TLS failure;
- API liveness failure;
- API readiness failure (including database connectivity);
- elevated 5xx rate or sustained latency where supported;
- container restart/resource pressure;
- PostgreSQL storage/availability/failover notifications;
- Valkey availability/resource pressure;
- external `/api/v1/health/ready` availability.

Use `/api/v1/health/live` for platform liveness so a transient dependency outage does not trigger avoidable application restart loops. Use `/api/v1/health/ready` for dependency-aware routing, staging validation and external operational monitoring. The compatibility endpoint `/api/v1/health` remains available for release metadata and existing integrations.

The API health response must continue to identify environment, version and deployed commit without exposing secrets or personal data.

## Backup and recovery

Provider-managed PostgreSQL backups are mandatory. Before pilot acceptance, perform and record a real restore into an isolated non-production database in addition to the repository backup/restore CI drill.

Rollback uses the release-evidence artifact to identify the previous known-good `main` SHA. Application rollback must not automatically reverse destructive database migrations.

## Cost posture

Start hosted staging with the smallest managed resources that pass load/UAT checks, then scale from measured utilization. Avoid premature Kubernetes, self-managed databases, or multi-cloud duplication.

DigitalOcean App Platform currently starts at low single-digit USD per service, while managed PostgreSQL and managed Valkey single-node plans start around USD 15/month each. High-availability data-service configurations cost more and should be budgeted for production rather than skipped to save cost.

## Exit criteria for hosted staging

Before production promotion:
1. hosted staging deploys successfully from `staging`;
2. migrations complete cleanly;
3. `/api/v1/health` reports the expected staging release SHA/version;
4. `/api/v1/health/live` succeeds and `/api/v1/health/ready` confirms database readiness;
5. PostgreSQL and Valkey connectivity are healthy;
6. provider backups are enabled and one isolated restore is evidenced;
7. external availability/readiness monitoring and alert routing are active;
8. the full UAT/pilot checklist is executed with real roles/devices;
9. no open critical/high security defect remains;
10. rollback owner and previous-known-good release are recorded.
