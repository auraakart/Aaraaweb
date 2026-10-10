# Aaraagate V4.90.11 — Guard gate and session context isolation

**Base:** `develop` 12cce0bcdb0094b2e8a287e5e3fe6d26c5ab06dd. P1 gate acceptance continuation after finance precision slices; work is independent of V4.90.10's provider reconciliation module.

## Root cause
`GuardController` assigned delayed access-verification, walk-in creation, quick-arrival creation and walk-in refresh results to mutable screen state without checking whether the guard changed gates, signed out or switched sessions in the meantime. A response from the old context could therefore display stale access details under the new gate or operator.

## Fix and regressions
Introduce a monotonically increasing gate-context epoch and scope asynchronous read/create results to the initiating gate, guard, society and authenticated session. Increment the epoch on manual gate change and sign-out. Re-read the request identity after a refresh to protect against a cleared or replaced gate request. New Guard tests cover gate switch, switch-away-and-back, operator switch and cleared request. Add them to the established risk-weighted Guard coverage gate so the coverage calculation measures new code.

## Boundaries
The server still authorizes all access operations and stores any previously submitted gate request. This slice prevents stale **UI state publication**; it does not cancel a server request, change gate write authority, guarantee offline/outage recovery or provide real guard-device acceptance. Concurrent mutation outcome context isolation and device-level validation remain follow-up gates. Exact-head required CI must pass before merge. No staging/main changes or new competitive score.
