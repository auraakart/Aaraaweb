# V4.90.14 — Credential gate mutation context isolation

**Baseline:** `develop` at `997f7d535fad728886ed4611539e3741ee85cc63`. **Target:** non-production gate reliability; no staging/main changes.

## Observed code risk
The V4.90.11 UI context checks covered verification and walk-in creation/refresh, but credential-based `checkIn`/`checkOut` still stored a late response into `verifiedAccess` unconditionally. On transport error, they read the **current** session rather than the session that initiated the write. An in-flight response after a gate or guard switch could therefore display the wrong person's access result or queue a lost-response reconciliation action under the wrong guard and society.

## Bounded change
Snapshot gate, authenticated session and gate context epoch when the mutation starts. Display returned access only if all three remain current. For a transport-uncertain mutation, persist its **original** gate, original guard/society and unchanged server idempotency identity to the existing secure queue, even if the screen context changed; only update queue counters and error banners while the original context is still active. No change to server permission controls, the authoritative gate transition, offline retry logic or permanent queue storage format.

## Verification and remaining limitations
Add out-of-order check-in/out and transport-uncertain cross-session tests to `guard_gate_context_isolation_test.dart`, which is already in the Guard risk-coverage suite. Required CI, Guard analysis/full tests and exact PR-head merge gates must pass before `develop` merge. This does **not** certify two-device field trials, supervisor reconciliation or complete walk-in action context isolation.

## Repeat-delay prevention
One bounded source fix and tests per feature PR; verify current `develop` head before editing; no unrelated repository scans or routine fast CI polling; inspect only first failed CI gate if failure occurs; do not promote `staging` or `main` without approval. Record actual merged SHA and remaining scope, not aspirational completion.
