# Aaraagate V4.90.10 — Gateway reconciliation numeric safety

**Base:** `develop` 12cce0bcdb0094b2e8a287e5e3fe6d26c5ab06dd (following merged V4.90.9).

## Root cause
Provider observation handling only excluded negative paise values, so fractional, nonfinite or unsafe numbers could reach `BigInt(input.observedAmountPaise)` and database writes. Refund-operation creation likewise validated a positive amount without enforcing exact whole-paise precision. DTO validation was not independently enforced at the service boundary.

## Bounded fix
Reject non-safe/non-whole or negative observed paise before transaction creation or BigInt conversion; require a positive safe whole-paise amount for refund operations and any optional amount supplied with a status query. Preserve all provider cases, society scope, observed-status classification, advisory reconciliation roles, append-only evidence and idempotent operation handling. Add parameterized regression tests asserting no SQL execution on malformed amounts.

## Exit criteria and exclusions
Exact-head API/CI (including PostgreSQL validation and risk coverage) before merging to `develop`. This is **not** a provider sandbox validation, refund execution change, new reconciliation algorithm or productionization milestone. Continue with real multi-payer, settlement and device acceptance separately. Do not change staging/main or imply 8.5+ acceptance.
