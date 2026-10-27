# Gateway refund integrity — 27 October 2026

Backlog: H27-14 (new P0 / High payment-boundary finding), H27-04 (partial), H27-08. Baseline develop: `073acf683726f4680618e7b16ce191d53b80630e`. Target: protected develop integration only.

## Finding and bounded change

Review of the remaining global reconciliation worker found a more immediate financial-boundary defect: its stored BIGINT refund amount was converted to a JavaScript number without range validation, while the HTTP gateway adapter accepted any positive refund value. The adapter also accepted integer observations outside the safe range. Service DTO validation already protects newly requested operations, but historical/imported database rows and direct adapter calls must not bypass precision checks. No actual incorrect provider refund is asserted from this source review.

The runner rejects null, non-positive or above-safe-range stored refunds before conversion and before invoking the provider adapter. Existing sanitized UNKNOWN/retry and FAILED/exhaustion evidence records the failure; the next claimed operation still proceeds. The adapter independently rejects missing, fractional, non-finite, non-numeric, non-positive or above-safe-range refund amounts and blank/missing idempotency keys before fetch. Provider observations require a nonblank string status and a safe, non-negative integer amount.

Valid 1 through Number.MAX_SAFE_INTEGER paise refunds remain accepted without rounding. Zero remains valid provider observation evidence. Existing valid idempotency keys, provider operation ids, request bodies, timeout, live/sandbox credential separation, tenant callback arguments, locks, claims, backoff and state transitions remain unchanged. Refund uncertainty remains retryable; client-side payment success is not treated as financial truth.

## Scope and deferred global boundary

This payment-integrity fix takes priority over architectural cleanup. The runner's global claim SQL and callback's signed global order resolution are retained and remain explicit production RLS activation blockers. No bypass role, security-definer function, permission grant, policy activation or migration is introduced. Global discovery still needs a narrowly authorized capability and exact-candidate non-owner acceptance; source context counts do not prove enforcement.

H27-04 remains open for actual provider amount/currency/order identity, provider-side retry-key namespace across societies, reconciliation, duplicate-safe live acceptance and external evidence. Do not change keys for already-submitted operations without a compatibility plan: a new key could cause a second provider action. H27-03, hosted grants, other domains and independent acceptance are not closed by this batch.

## Validation and impact

Adapter tests cover invalid refund values/keys before fetch, unsafe observations, zero/max-safe observations, exact valid refund boundaries and identical retry payload/key. New worker tests cover unsafe stored amounts, valid boundaries, exhaustion, continuing after failure, sanitized evidence, claimed-society routing, unsupported providers, immediate/scheduled execution, no overlap, recovery after claim failure and timer cleanup. Existing service precision, authorization, idempotency, finance and RLS tests remain required.

Local risk: 314 passed / 5 dedicated Redis skips; all existing and new floors passed. Adapter: 100% selected lines/functions, 89.06% branches. Worker: 96.87% lines, 92.85% functions, 88.57% branches. API lint/typecheck/build and repository invariant/SQL/security/complexity/inventory checks pass. Full regression and protected migrated PostgreSQL/Redis evidence are recorded before integration; no actual provider or hosted acceptance is claimed.

Regression risk is low to medium: valid operations retain their request identity and payload; only invalid financial boundary values are refused. No external adapter is invoked for unsafe stored refunds. No measurable latency change is claimed; the additional checks are in-memory and introduce no database calls. No dependency or infrastructure cost is added.

## Deletion ledger

| Item | Classification / reason | Evidence | Risk | Validation |
| --- | --- | --- | --- | --- |
| Unsafe BIGINT-to-number conversion | REFACTOR to validate before conversion | Database BIGINT range exceeds JS safe integer range; provider call follows guard | Medium: financial boundary | Invalid rows never reach adapter; exact valid-boundary tests |
| Null-to-undefined refund ternary | CONSOLIDATE into validated conversion | Preceding guard rejects null; status-query path remains separate | Low | Null refund and null status-query tests |
| Files, dependencies, migrations and global claims | RETAIN | No deletion, upgrade or privileged replacement proposed | No removal risk | Reviewed diff has no deleted paths |

Overall health remains provisional at 7.6; this is not completion of the full optimization definition of done.

Broader local checkpoint: full API 2,520 passed / 160 database or dedicated Redis cases skipped. Required CI must execute all 18 existing isolated RLS cases, migrated payment/finance acceptance and risk coverage with dedicated Redis.
