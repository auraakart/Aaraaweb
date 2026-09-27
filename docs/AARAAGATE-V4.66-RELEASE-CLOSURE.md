# Aaraagate V4.66 — Release Closure

Date: 2026-09-28

## Closed scope

- Repairs V4.65 family add/remove recovery to recognize authoritative approval requests.
- Adds request-aware vehicle add/remove recovery.
- Exposes production pending family/vehicle society-approval requests.
- Keeps family setting updates on active-state verification.
- Converges vehicle transport onto ResidentRepository/controller boundaries.
- Preserves fail-closed behavior when refreshed request/end-state evidence does not match.

## Release identity

- root/API/Admin: `4.66.0`
- Resident/Guard: `4.66.0+46600`

## Evidence

`pnpm check:v4.66` is wired into CI with focused request-recovery regression coverage. Historical V4.65 AutoPay behavior remains enforced while allowing later V4.x identities.

## Boundary

Closed on `develop` only. No staging/main promotion, live-provider activation, productionization or field acceptance is claimed.
