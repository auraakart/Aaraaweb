# Hosted Staging Acceptance

Updated: 2026-09-15

Configure the non-secret repository variable `AARAAGATE_STAGING_API_BASE_URL` with the public HTTPS API origin before promoting this workflow to `staging`. Every subsequent staging push runs `Hosted staging acceptance` against the pushed SHA and fails closed when the variable or hosted deployment is unavailable.

The DigitalOcean staging template enables deployment only from the protected `staging` branch. Its pre-deploy job applies migrations before services are released, the API runs production preflight before startup, and App Platform routes traffic only after dependency readiness succeeds. The hosted acceptance workflow polls for the exact candidate for up to ten minutes so it can safely run alongside that deployment; it never accepts the previously deployed SHA.

The workflow may also be manually dispatched after it is available on the default branch. Select the protected `staging` environment and provide:

- the full commit SHA currently at `staging`;
- the public HTTPS origin of the hosted API, without credentials or a path.

The workflow fails closed unless the declared SHA is still the current staging head. It verifies `/api/v1/health/live` and `/api/v1/health/ready` over TLS 1.2 or newer and requires:

- production runtime metadata;
- exact deployed commit identity;
- a non-development application version;
- healthy PostgreSQL connectivity;
- Redis-backed authentication state.

The retained artifact contains only the public API origin, candidate SHA, run metadata and the non-sensitive health responses.

## Evidence boundary

A green hosted smoke proves that the declared staging build was reachable and dependency-ready at the recorded time. It does **not** prove:

- managed database backup frequency, retention, encryption or PITR;
- isolated provider restore success;
- monitoring or human alert-delivery success;
- rollback execution;
- MSG91, FCM or payment-gateway end-to-end behavior;
- Resident or Guard real-device UAT.

Record those controls separately using `docs/BACKUP-RESTORE-EVIDENCE.md`, `docs/UAT-PILOT-CHECKLIST.md` and the production runbook. Never put credentials, connection strings, tokens, resident data or raw production records in workflow inputs or artifacts.
