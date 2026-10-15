# Aaraagate V4 Release Consolidation Evidence

Date: 2026-09-18  
Candidate integration branch: `develop`  
Verified pre-V4.9 baseline: `04bea6a0e45cdc3665222b909394a00108be7f32`

## Development status

V4.1 through V4.8 are integrated into `develop`. V4.9 freezes feature development and consolidates integrated regression/release evidence. No new product scope belongs in V4.9 unless required to correct a release-blocking defect.

The V4 release evidence contract is intentionally split:

1. **Repository evidence** — automated tests, builds, migration/restore checks, role/security contracts and release controls.
2. **Hosted release evidence** — exact deployed artifact, managed backup/PITR, public TLS, alert delivery, real providers/hardware and physical-device UAT.

Repository evidence cannot substitute for hosted evidence.

## Integrated regression evidence required on the V4.9 exact PR head

The final V4.9 PR must be green for:
- CI: repository structure, clean PostgreSQL migration, Prisma validation, API lint/typecheck/tests/build/readiness, Admin tests/typecheck/build, Resident/Guard analyze/tests and high/critical dependency audit;
- Security & Privacy Review;
- Role UAT Contract;
- Policy Pilot Contract;
- Pilot Acceptance Contract;
- Staging Pilot Execution Contract;
- Backup restore smoke when migration-sensitive paths trigger it;
- V3 Runtime Reliability where applicable;
- V4 Release Consolidation contract.

These existing workflows collectively cover the full regression responsibilities defined by the V4 program without introducing a second duplicate test framework.

## Release-blocker disposition

At V4.9 closeout, no repository P0/P1 blocker may remain open in the milestone PR. A failing required exact-head workflow is itself a release blocker and prevents merge.

Production-only dependencies are **not** repository blockers when the required abstraction/simulator and explicit acceptance checklist exist. They remain mandatory before production approval.

## Migration and rollback evidence

V4 relies on:
- clean `prisma migrate deploy` in CI;
- backup/restore smoke for schema-level PostgreSQL recoverability;
- immutable migration-history enforcement in `scripts/release-migration-gate.sh`;
- `develop -> staging -> main` promotion governance;
- application rollback to a known-good immutable SHA/artifact;
- forward-corrective database migration as the default database incident strategy.

## Promotion status

V4.9 repository completion does **not** itself promote `staging` or `main`.

Promotion requires explicit release approval plus hosted staging evidence for the exact candidate. Until that approval/evidence exists:
- `develop` remains the completed V4 development baseline;
- `staging` and `main` remain unchanged;
- production readiness must not be overstated.

## Remaining hosted/external proofs

- hosted staging deployment tied to the exact candidate SHA;
- managed PostgreSQL backup/retention/encryption/PITR settings and isolated restore;
- monitoring destination, alert routing and alert-delivery test;
- production payment/OTP/push provider verification;
- representative Resident and Guard device UAT;
- real ANPR/RFID/boom-barrier vendor/site verification;
- accountable business/release-owner acceptance.

See `docs/STAGING-RELEASE-EVIDENCE.md`, `docs/HOSTED-STAGING-ACCEPTANCE.md`, `docs/DEPLOYMENT-ROLLBACK-GATES.md` and `docs/UAT-PILOT-CHECKLIST.md`.
