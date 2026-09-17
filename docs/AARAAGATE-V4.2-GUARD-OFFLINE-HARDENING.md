# Aaraagate V4.2 Guard Operations 3.0 — Offline Determinism Slice

Date: 2026-09-18
Milestone: V4.2 Guard Operations 3.0
Base: `develop` after V4.1 completion

## Purpose

The existing Guard app already had secure session-scoped offline check-in/check-out queuing, idempotency keys, reconnect replay and supervisor-review messaging. This V4.2 slice hardens that foundation instead of replacing it.

## Implemented

### Deterministic offline action state
Queued gate actions now persist:
- attempt count;
- last attempt time;
- next retry time;
- failure classification;
- supervisor-review requirement.

Transport failures use bounded retry backoff while retaining the original idempotency key. Server conflicts are classified as `CONFLICT`, other non-transport rejections as `REJECTED`, and actions older than the safe replay window as `STALE`. These states are retained for supervisor review instead of being blindly replayed.

### Offline restart directory
A society-and-guard-scoped secure cache stores the most recently successful active-gate and unit directory. On transport failure during Guard startup/load, a fresh cached snapshot can restore gate selection and unit lookup for up to 24 hours. Cross-society/guard cache reuse is rejected, and stale snapshots are not presented as current data.

### Guard visibility
Guard Tools now distinguishes:
- pending offline actions;
- actions requiring supervisor review;
- active cached-directory mode.

Retry is offered only when there are retryable actions rather than review-only conflicts.

### Localization
The operational vocabulary is complete across all currently advertised Guard languages: English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi and Bengali. Automated completeness coverage prevents untranslated V4.2 operational keys from silently falling back to raw key names.

## Automated evidence

Coverage includes:
- transport queueing;
- stable idempotency key during replay;
- persisted bounded retry metadata;
- explicit conflict classification;
- stale-action quarantine;
- cross-session queue isolation;
- backward-compatible scoped queue deserialization;
- online directory cache refresh;
- fresh-cache offline startup fallback;
- stale-cache rejection;
- cross-session directory isolation;
- localization completeness for operational keys.

## Remaining V4.2 work

This slice closes the offline determinism foundation. Remaining V4.2 work should be bounded to evidence-backed gaps in:
- <=5-second pre-approved routine flow and <=3 primary taps where practical;
- repeat visitor/provider and delivery fast paths;
- low-connectivity UI/performance evidence on representative low-end profiles;
- explicit supervisor resolution workflow for quarantined offline actions;
- material gate pass/move-in/out and incident attachment continuity if not already sufficient in Guard Operations;
- final V4.2 gate/security score reassessment >=9.0.

`staging` and `main` remain outside normal V4 milestone promotion.
