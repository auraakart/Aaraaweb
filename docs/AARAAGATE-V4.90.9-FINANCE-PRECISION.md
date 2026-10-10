# Aaraagate V4.90.9 — Monetary precision and payment retry identity

**Basis:** `develop` 950ecf7db54bedef1fa36d5b50e1ca8edf97f1f0 after V4.90.8.

## Issue
Payment-order service methods allowed whitespace-only idempotency keys when invoked outside HTTP DTO validation; accounting allocation, allocation reversal and refund services checked only `amountPaise > 0`. That permits unsafe or fractional JavaScript values to enter a whole-paise accounting operation before the database is consulted. These are domain-boundary gaps, not claims of observed payment loss.

## Changes
- Reject blank maintenance and amenity-deposit retry identities at the service boundary before any invoice lookup or transaction.
- Require positive `Number.isSafeInteger(amountPaise)` for receivable allocations, allocation reversals and refunds before SQL or transaction creation.
- Preserve all existing payment authorization, society scope, PostgreSQL controls, idempotent recovery, audit/ledger behavior and user-visible interfaces.
- Add isolated regression cases for fractional, zero, negative, NaN, infinities and unsafe integers; assert no database operations occur. Existing PostgreSQL owner/tenant concurrency tests remain authoritative.

## Release evidence and open work
New regression: `services/api/src/accounting/finance-request-integrity.spec.ts`. Run targeted related tests, API typecheck/lint and exact PR-head required CI before merging to `develop`. No change to `main` or `staging`, no external gateway validation or revised 8.5+ score. Further PostgreSQL race/partial-settlement and Tally-export acceptance still need representative validation.
