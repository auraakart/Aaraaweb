# Aaraagate V4.79.1.2 — Superseded CI Cancellation

Date: 2026-09-29

## Root cause

A replacement pull-request head correctly asked GitHub Actions to cancel the previous CI run, but the obsolete run could stay alive because the required-status wrapper jobs and the final `Required merge gates` job used unconditional job-level `always()`.

Cancellation stopped the expensive API/Admin/Flutter workers, then the obsolete workflow still scheduled wrapper and aggregation jobs. The old run could therefore retain the concurrency slot while the new exact-head run waited.

## Fix

- API, Admin, Flutter and dependency-security required status wrappers now use `!cancelled()`.
- `Required merge gates` also uses `!cancelled()`.
- Failed or intentionally skipped upstream checks are still evaluated by the wrappers; only whole-workflow cancellation suppresses obsolete aggregation.
- Step-level `always()` remains for cleanup and evidence upload where it is appropriate.
- A repository semantic contract rejects reintroduction of job-level `always()` on these required aggregators.

## Result

Once this workflow version is active, pushing a replacement PR head allows the superseded run to terminate instead of retaining a queued required-gate job. Branch protection and exact-head validation remain unchanged.
