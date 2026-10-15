# Aaraagate V4.50.1 — Regression Hotfix

Date: 2026-09-23  
Target: `develop` after V4.50

## Objective

Close the two post-V4.50 regression risks found during the health check without widening product scope or weakening V4.50 concurrency controls.

## Changes

1. **Canonical Admin logout after refresh rotation** — logout now resolves any in-flight society/role refresh, reloads the latest canonical credentials from session storage, and revokes the server session with the current refresh token. Admin console and Auditor workspace use this shared path.
2. **Closed overstay re-escalation** — repeated escalation remains idempotent for OPEN and REVIEWED incidents. If the visitor is still an active four-hour overstay after the canonical incident was CLOSED, the same incident is reopened instead of silently returning the closed record or creating a duplicate.
3. **Legacy canonical reconciliation** — an append-only migration reassigns each recognized overstay source key to the best existing incident, preferring OPEN, then REVIEWED, then CLOSED records.
4. **Focused regression coverage** — Guard lifecycle tests cover REVIEWED idempotency, CLOSED reopen and first creation; the AI Action Centre test verifies a gate-only role keeps gate grounding to one aggregate query.

## Verification

The hotfix must pass the V4.50 and V4.50.1 repository contracts, clean PostgreSQL migration deployment, full API tests/build/readiness, Admin tests/typecheck/build, Flutter validation and dependency security before merging into `develop`.

## Release boundary

This hotfix targets `develop` only. It does not promote V4.50.1 to staging or main.
