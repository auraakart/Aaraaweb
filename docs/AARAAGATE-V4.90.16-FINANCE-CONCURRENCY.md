# V4.90.16 — Finance concurrency and reconciliation acceptance

**Base:** `develop` 487c611305b22a2b65e2dcdf63d97cf6d4417e5a (V4.90.15). **Scope:** non-production migrated PostgreSQL, no real payment gateway or provider.

## Existing source controls reviewed
- `aaraagate_validate_receivable_allocation` locks the captured payment row and receivable row before checking their net limits, considering reversals and refunds.
- `aaraagate_validate_payment_refund` locks its payment and checks available unallocated funds; reversal guards lock the source allocation.
- `SettlementService` and `PaymentExceptionsService` use per-society idempotency identities, validating safe whole-paise amounts. Reconciliation records provider observations and must invalidate `MATCHED` when expected refunded amount changes.

## Acceptance matrix
The new `finance-concurrency.postgres.spec.ts` runs seven actual committed PostgreSQL operations: competing allocations against one payment; two payments against one receivable; two over-limit refunds; two reversals against one allocation plus released-funds refund; mixed refund/allocation race; identical-key concurrent refund retries; and payment-reconciliation `MATCHED` → `PENDING` → `MATCHED` on additional partial refund. Assert persisted paise totals, receipt cardinality, status and expected versus observed net amounts, not merely mocked callback ordering.

## Database safety
Accounting histories are intentionally append-only and prohibit deletion by test teardown. Therefore this suite is **opt-in and locked to** `GITHUB_ACTIONS=true`, `AARAAGATE_FINANCE_CONCURRENCY_CI=1`, localhost port 5432, database `aaraagate_ci`, no override schema. CI provisions this disposable PostgreSQL 16 container and migrates it afresh; it is destroyed after the run. Persistent/local databases skip this suite even if `DATABASE_URL` is present. No trigger disabling, test-data deletion, external payment instructions or altered runtime permissions.

## Validation and exclusions
Required PR-head GitHub API full CI must pass schema validation, clean migrations, lint, typecheck, targeted PostgreSQL acceptance, broad API tests, coverage and merge gates before develop integration. Remain outside scope: bank import provenance, representative Tally CSV signoff, live payment gateway operation, device UAT, staging/main promotion and productionization. A CI pass is **simulated provider observation acceptance**, not third-party reconciled evidence.
