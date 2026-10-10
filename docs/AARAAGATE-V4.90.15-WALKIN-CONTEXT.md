# V4.90.15 — In-flight walk-in gate state isolation

**Base develop:** `cf5f5dc0cd71f41d5c6e9726429432929b4d1011`. **Release target:** non-production V4.90 Gate Excellence, `develop` only.

## Remaining root cause after V4.90.11 and V4.90.14
The GuardController walk-in check-in/check-out mutation still wrote the response into the shared `walkInAccess` field after awaits with no active gate, request or session check. When retrying an uncertain outcome it could similarly publish a delayed `requestStatus` response for the previous gate. A guard gate switch, session switch or request clearing before network completion therefore risked showing stale access state.

## Bounded fix
Snapshot gate, session, epoch, and originating request ID when each walk-in action starts. Before mutating UI from either status reconciliation or the original write, recheck that exact context. An authoritative successful write can still clear its known idempotency identity without publishing stale UI. An uncertain write preserves its original retry key only while the original authenticated session is still active; it does not recreate that identity after sign-out. Server gate constraints, review policy, consent and tenant boundaries are unchanged.

Regression tests cover late check-in, delayed check-out after a request change, and old errors after a gate switch in the established Guard risk-coverage suite.

## Evidence boundary and no-repeat execution plan
Use exact-head preflight, Guard risk test and coverage floor, Flutter analysis/full tests and required merge gates before `develop` merge. Avoid repeated identical CI reads, do not reset checks or dilute coverage thresholds, and inspect only the first failing job when a check fails. No staging/main change. Still open: physical-device offline UAT, role-based overstay/supervisor workflows, finance concurrency acceptance, Services 3.1 completion and broader UX/AI validation.
