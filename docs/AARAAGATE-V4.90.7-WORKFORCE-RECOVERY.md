# Aaraagate V4.90.7 — Guard workforce offline-recovery safety

**Base:** `develop` f2fb80ee62b73600a650d8d407a72a46d4524b96. **Scope:** non-production V4.90 reliability continuation; no staging/main promotion.

## Root-cause diagnosis
The Gate/Guard queue had stale-action review, bounded transport backoff and permanent-rejection quarantine, but the separate household-workforce attendance queue replayed every stored action on every staff-list refresh. Rejected attendance actions remained permanently retryable; a long-offline check-in could be resent after the next day's shift. The UI described queued writes as automatically synchronized despite only retrying during a refresh. Together these risk repeated invalid operations and misleading operator feedback.

## Change
- Keep the same society/guard scoped encrypted queue, server APIs, action IDs and idempotency keys.
- Persist retry count and next safe retry time; use bounded exponential retry delays for transport errors and require supervisor review after six failures.
- Mark entries older than 24 hours or rejected by the server as requiring review without deleting them or replaying them automatically. A 409 is classified as `CONFLICT`.
- Display review-required status and suppress the retry button if there is nothing safely retryable. Clarify that a transport failure is **pending**, not confirmed attendance.
- Preserve existing queue records through backward-compatible decoding; new metadata is additive.
- Cover retry backoff, durable review status, old-entry rejection and actual Guard screen refresh behavior in Flutter regressions.

## Acceptance boundary
Targeted Flutter tests: `apps/guard/test/workforce_offline_queue_test.dart` and `apps/guard/test/guard_workforce_sync_safety_test.dart`; run Guard analysis and required exact-head CI before merge. No tests were run in the authoring runtime; GitHub CI is authoritative. Real-device/shift-supervisor reconciliation requires separate acceptance. Do not promote any branch or increase a score without evidence.

## Development-efficiency control
Avoid repeated whole-repository searches; use the current `develop` SHA, narrow file reads, one consolidated feature commit, exact-head CI, and no staging/main changes. If a candidate fails, inspect the first failing job instead of resetting or repolling the full pipeline.
