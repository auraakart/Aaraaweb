# Aaraagate V4.90.8 — Walk-in gate mutation outcome reconciliation

**Base:** `develop` 0328a6d03eab0569d0449d524c63b373bf6c30f8. This is a non-production gate reliability slice.

## Root cause and mitigation
Unlike credential-based offline gate actions, a walk-in check-in/check-out regenerated its idempotency key each time the Guard pressed the same action after a transport timeout. The server may already have applied the first action. The Guard flow now remembers the uncertain action identity per authenticated session, society, guard, gate, request and action. Before a retry it requests authoritative status, treats confirmed transition as success, blocks replay when status cannot be read or has changed unexpectedly, and reuses the same key only while the precondition still holds. Server authorization, origin-gate restriction, idempotency receipt and status transitions remain authoritative.

## Tests and limitations
`apps/guard/test/guard_walkin_uncertain_mutation_test.dart` covers lost response, authoritative confirmation, failed reconciliation and gate/request scope isolation. All results still require exact-head Flutter/CI evidence. Retry identity is **session-memory scoped**, not durable across process restarts. A new process must rely on the current authoritative request-status flow and server protections; full offline request-identity persistence and physical device acceptance are not claimed. No staging/main change or competitive re-score.
