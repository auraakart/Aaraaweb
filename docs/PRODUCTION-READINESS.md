# Aaraagate Production Readiness Runbook

Updated: 2026-09-05

This runbook defines the provider-neutral operational baseline for production rollout. Hosting-specific commands may be added later, but the control objectives below must remain intact.

## 1. Observability baseline

The API health endpoint is `/api/v1/health` and must remain unauthenticated, fast and free of sensitive data. It reports:
- service health status
- service name
- runtime environment
- application version
- deployed commit identifier
- process uptime

Production deployment must set `NODE_ENV=production`, `APP_VERSION` to the release/version identifier and `GIT_SHA` to the deployed commit SHA.

Minimum operational monitoring for pilot and production:
- external availability check against `/api/v1/health`
- API 5xx rate and request latency
- process/container restarts
- PostgreSQL availability, connection saturation and storage growth
- failed background/notification/payment operations where applicable
- deployment and rollback events correlated to commit SHA

Alerts should route to the operational owner with clear severity and the deployed commit/version attached. Do not place authentication tokens, visitor credentials, payment secrets or unnecessary personal data in logs or alerts.

## 2. Backup and restore

Production PostgreSQL must use automated encrypted backups with provider retention appropriate to the commercial plan and legal requirements. The exact provider configuration is deployment-specific, but recovery must not depend on an untested backup.

Repository CI includes a provider-neutral logical backup/restore drill that:
1. applies all Prisma migrations to a clean PostgreSQL database;
2. writes a verification marker;
3. creates a `pg_dump` custom-format backup;
4. restores into a second clean database;
5. verifies restored data and Prisma migration history.

Before pilot launch:
- confirm provider backups are enabled;
- record retention and backup frequency;
- perform at least one restore into an isolated non-production database;
- record restore date, backup identifier, operator and result;
- verify application startup against the restored database where safe.

Never validate restore by overwriting the production database.

## 3. Deployment gate

Normal production path:
`develop` -> green CI -> `staging` -> staging smoke/UAT/security approval -> `main` -> production.

Before production deployment confirm:
- release commit is on `main`;
- CI and staging smoke are green for the promoted state;
- database migration plan has been reviewed;
- backup status is healthy;
- required environment variables/secrets are present;
- rollback owner is identified;
- release notes identify material user-visible and operational changes.

Immediately before deploying a live environment, run:

```bash
bash scripts/production-preflight.sh
```

The preflight fails closed unless the production environment provides valid release metadata, PostgreSQL and Redis URLs, non-local CORS origins, MSG91 OTP configuration, Firebase service-account JSON, the payment webhook secret and the HTTPS Admin API base URL. It prints only configuration names/status and must never print secret values.

A green GitHub release-readiness workflow proves the preflight control itself is present and executable with structurally valid test values. It does **not** prove that live hosting secrets are configured; the preflight must be run again in the actual production deployment environment before traffic is enabled.

Deploy immutable artifacts tied to the `main` commit SHA where the hosting platform supports it.

## 4. Rollback

Application rollback should prefer redeploying the previous known-good immutable artifact/commit rather than editing production manually.

Database migrations require extra care:
- prefer backward-compatible expand/migrate/contract changes;
- do not automatically reverse destructive migrations;
- if a migration caused the incident, stop further writes when necessary and follow the migration-specific recovery plan;
- restore from backup only when data recovery is required and after impact is understood.

Rollback verification:
1. redeploy previous known-good application release;
2. verify `/api/v1/health`;
3. verify database connectivity and critical resident/admin/guard flows;
4. confirm error rate returns to baseline;
5. record incident cause, rollback commit and follow-up action.

## 5. UAT and pilot acceptance

Pilot should use a limited society cohort before broad rollout. Required UAT scenarios include:
- owner vs tenant/occupant access boundaries;
- visitor invite, approval, gate verification, check-in and checkout;
- domestic-help/workforce entry handling;
- maintenance dues visibility, owner/tenant payment eligibility and notifications;
- notices/broadcast audience selection;
- helpdesk complaint lifecycle;
- Resident marketplace booking lifecycle;
- vehicle registration and basic parking-slot data visibility/update;
- Admin operational reports/audit access by permitted roles;
- Guard offline queue retry/idempotency recovery;
- denied cross-society and stale-occupancy access attempts.

Acceptance evidence should capture scenario, role, society/unit context, expected result, actual result, tester and date. Production promotion must not rely on verbal acceptance alone.

## 6. Pilot exit criteria

Move from pilot to wider production only when:
- no open critical/high security defect exists;
- backup/restore drill is evidenced;
- health/availability monitoring and alert routing are active;
- production integration preflight passes in the live hosting environment;
- critical UAT scenarios pass;
- rollback procedure has been reviewed by the release owner;
- known medium/low issues have explicit disposition;
- support/escalation ownership is defined.
