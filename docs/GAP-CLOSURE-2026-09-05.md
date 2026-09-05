# Commercial V1 Gap Closure — 2026-09-05

This document records the remediation program triggered by the full Aaraagate product/code audit.

## Closed / implemented
- P0 society-to-platform privilege escalation: fixed in PR #202 and merged to `develop`.
- Operational role allowlist, deactivation and session revocation.
- Existing global user identity protection from tenant-admin overwrite.
- Super Admin society lifecycle, entitlements and Society Admin provisioning controls.
- Building → Floor → Unit property hierarchy with backward-compatible unit migration.
- Dedicated Admin People & Roles, Property Setup and Parking surfaces.
- Resident parking remains read-only; society configuration authority manages bays.
- Marketplace provider comparison architecture: multiple providers per service.
- Provider reputation aggregation: rating average/count and completed jobs.
- Provider booking time-window conflict prevention.
- Platform provider verification/reject/suspend/reactivate lifecycle.
- Society provider approve/reject/suspend lifecycle.
- Platform-controlled offering activation/deactivation.
- Redis/auth-state included in readiness while liveness remains dependency-independent.
- DigitalOcean liveness corrected to `/api/v1/health/live`.
- CI uses frozen lockfile installs and includes Admin access regression.
- Staging smoke includes Redis and validates DB + auth-state readiness.
- Backup documentation distinguishes CI restore drills from real hosted backup/PITR evidence.
- Requirements traceability, implementation roadmap and UAT checklist refreshed.

## Intentionally external/pending
The repository cannot prove these until a real hosted environment exists:
- production/staging provider resource creation;
- managed backup retention/PITR configuration and isolated provider restore;
- production OTP, push and payment credentials;
- live domains/TLS/CORS;
- external monitoring/log routing and alert ownership;
- final pilot/UAT against the consolidated staging SHA.

## Release rule
Do not describe the product as live merely because this remediation reaches `main`. Production-live status requires hosted deployment evidence and the production preflight/UAT controls documented elsewhere in the repository.
