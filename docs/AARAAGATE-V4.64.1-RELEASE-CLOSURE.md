# Aaraagate V4.64.1 — Release Closure

Date: 2026-09-27

## Closed scope

- Visitor invite creation uses request-bound idempotency.
- Same-key retries are serialized and cannot create duplicate requests.
- A valid same-request replay rotates a fresh credential rather than persisting the previous raw QR secret.
- Mismatched, cancelled, consumed or expired replays fail closed.
- Resident retries preserve the same idempotency identity and validity window after uncertain transport outcomes.
- Existing V4.64.0 community-poll participation remains intact.

## Release identity

- root/API/Admin: `4.64.1`
- Resident/Guard: `4.64.1+46401`

## Evidence

`pnpm check:v4.64.1` is wired into CI alongside the historical V4.64.0 poll-recovery contract.

## Boundary

Repository release truth is closed on `develop` only. Staging/main promotion, hosted acceptance, productionization and field acceptance remain separate.
