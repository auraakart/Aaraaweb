# V4.91.2 — Existing finance and property-authorization regression evidence

**Basis:** V4.91.1 develop `7b6afe01efc30564e823074f34c1830bb2638838`.
**Scope:** Three migrated-PostgreSQL regression fixtures, no payment implementation changes and no widened resident permissions.

## Risk boundaries under test

1. An expired current-tenant relationship cannot reuse a historical idempotency key to create/recover a maintenance invoice payment, while verified owner authority remains independently available on another unit.
2. Current tenants must not gain finance history or captured-payment receipts for a verified owner's other unit. The owner can still see the unit's own receipt, consistent with existing owner property-visibility policy.
3. A single verified owner in two societies cannot replay an existing other-society order through a different society context; the original order and event count remain exactly one.

**Existing regressions retained:** simultaneous owner/tenant order attempts, same-key cross-invoice unique-key race, receipt/idempotency constraints, durable owner+tenant invoice notifications, property summary scoping and source controls for callbacks. No independent extra-work invoice or settlement.

**Acceptance:** `payment-integrity.postgres.spec.ts` must run with DATABASE_URL and migrated PostgreSQL as part of exact-head required API gate. No environment-free Vitest skip can be counted as a pass. Developer/frontend/backend checks and security gates as required by CI. No banking provider, real external settlement, DAST or manual field acceptance is claimed.

**Stop:** This slice ends after these three PostgreSQL privacy/payment regressions and documented residual matrix; broader finance policy and external integrations require separate acceptance.
