# Reconciliation worker claim capabilities — 28 October 2026

Backlog: H27-03 (partial), H27-08. Baseline develop: `e5fc57b5bce837564338277dd8eccdb5e185247e`. Protected develop integration only; no staging/main or production policy activation.

## Root cause and implementation

The worker's per-record reconciliation service calls already use tenant context. Global claim discovery and retry bookkeeping still used unrestricted transaction/table SQL, so production RLS needed a narrow system exception rather than generic bypass rights.

Migration `20261028070000_v510_reconciliation_claim_capabilities` adds two SQL VOLATILE SECURITY DEFINER functions. PUBLIC execution is revoked atomically; table references are schema-qualified, search_path is fixed to pg_catalog, pg_temp and row_security is on. No application role, table policy or RLS activation is created. Initial ownership remains with the migration executor pending reviewed deployment provisioning.

| Capability | Input / returned data | Allowed mutation |
| --- | --- | --- |
| public.aaraagate_claim_payment_gateway_operations() | No inputs; at most 25 due REQUESTED/UNKNOWN operations with the existing execution fields | Increment attemptCount; update lastAttemptAt, nextAttemptAt and updatedAt |
| public.aaraagate_claim_payment_reconciliation_cases(integer) | Stale seconds, minimum 60; at most 25 stale PENDING/MISMATCH/ACTION_REQUIRED case routing rows | Update lastCheckedAt and updatedAt |

Both use a materialized candidate CTE, FOR UPDATE SKIP LOCKED and same-id/society UPDATE joins. Operation ordering retains COALESCE(nextAttemptAt,requestedAt), requestedAt; cases retain COALESCE(lastCheckedAt,createdAt). UUID is added only to make previously unspecified ties deterministic. Returned rows follow candidate order. Batch size remains 25, all providers remain eligible, provider selection/unsupported behavior is unchanged, and provider calls occur after the claim commits.

Operation backoff is mathematically unchanged: 60*2^priorAttemptCount seconds, capped at 3600. The exponent is capped before arithmetic to avoid overflow at high attempt counts. The function returns the incremented count, so the worker no longer increments it a second time. Cases reject null or sub-60-second inputs with no rows. Existing valid worker intervals already meet that bound. Missing/denied capabilities fail closed through the existing sanitized cycle error path, with no unrestricted table fallback.

The worker retains stored society routing, provider idempotency/operation ids, amount safety checks, status transitions, retries/exhaustion, no-overlap guard, scheduling and shutdown. The capabilities do not issue refunds, settle payments, change request economics or grant resident/admin authorization.

## Deployment prerequisites

Provision and review a dedicated NOLOGIN, NOSUPERUSER, NOBYPASSRLS owner distinct from the callback lookup owner. It must not own the operational tables, and the application/worker login must not be a member of it. The following privileges are sufficient for the isolated-policy acceptance fixture; hosted policies and inherited/default grants require independent review.

| Table | Owner SELECT columns | Owner UPDATE columns |
| --- | --- | --- |
| PaymentGatewayOperation | id, societyId, paymentId, operationType, provider, providerOperationId, amountPaise, idempotencyKey, attemptCount, status, nextAttemptAt, requestedAt | attemptCount, lastAttemptAt, nextAttemptAt, updatedAt |
| PaymentReconciliationCase | id, societyId, paymentId, provider, status, lastCheckedAt, createdAt | lastCheckedAt, updatedAt |

No INSERT/DELETE or status/amount/key UPDATE is needed. Under forced RLS, that NOLOGIN owner needs separately reviewed SELECT and UPDATE policies permitting claim bookkeeping; column grants constrain the mutations. Do not give these policies or owner membership to resident-facing roles. Grant schema USAGE, transfer these two functions with CREATE only temporarily during transfer, then revoke CREATE as in the [callback deployment procedure](PAYMENT-CALLBACK-RESOLVER-2026-10-28.md). Grant the actual worker runtime EXECUTE on only these signatures:

```sql
GRANT EXECUTE ON FUNCTION public.aaraagate_claim_payment_gateway_operations(),
  public.aaraagate_claim_payment_reconciliation_cases(integer) TO :"worker_runtime_role";
```

Apply the migration, reviewed ownership/policies/grants and runtime acceptance before deploying the new worker with a separate runtime role. Test actual credentials, no owner membership, PUBLIC ACL, settings, bounded claims and tenant result recording. A controlled transaction can call the capability and roll back the bookkeeping to test permissions without invoking a provider. Do not activate generic bypass/table grants to recover from denied execution. Retain functions/grants through code rollback until compatibility is checked; never automatically disable RLS.

## Validation surfaces

Twenty worker unit cases retain financial/routing/lifecycle coverage and require exact capability-only SQL, configured stale seconds and no unrestricted fallback. Existing SQL-backoff assertions move to real database cases because claim bookkeeping now lives in SQL.

The isolated RLS fixture grows from 22 to 28 cases. A distinct non-owner NOLOGIN/NOBYPASSRLS owner gets only the columns above and fixture-only SELECT/UPDATE policies. Cases prove denial before EXECUTE; ACL/settings and inability to update status/amount or delete; oldest-first 25-row operation/case claims; future/terminal/recent exclusion; exact retry increments and 60/120/3600-second backoff; unchanged execution identity; context-free table invisibility; simultaneous claims that skip held locks; and rollback restoring the original claims. Cleared records are only UUID-isolated copied test tables. Copied tables do not reproduce foreign keys/triggers.

A new disposable public-schema finance case invokes the actual migrated operation function against real payment/operation constraints and immutability triggers, checking request identity/economics. It makes no provider call. Existing migrated payment, finance, owner/tenant and callback acceptance remain required. PostgreSQL reference: [SELECT locking clauses](https://www.postgresql.org/docs/16/sql-select.html).

## Impact and deletion ledger

| Item | Classification / reason | Evidence | Risk | Validation |
| --- | --- | --- | --- | --- |
| Direct global claim SQL and per-row retry loop | CONSOLIDATE into two bounded database capabilities | Same predicates, row locks, metadata/state and 25-row limit; increment now occurs in SQL once | Medium: worker claims and deployment grants | Unit, restricted-owner RLS concurrency/rollback and migrated finance |
| Global system discovery | RETAIN as explicit narrow capability | No arbitrary filters, tenant, status, batch-size or mutation argument | Privileged boundary needing hosted review | ACL/column/settings and exact-query acceptance |
| Files, dependencies and existing workflows | RETAIN | No deletion/upgrade proposed | No removal risk | Reviewed diff |

An operation batch now uses one database round trip instead of a selection plus up to 25 update round trips and explicit transaction control. The database still locks and updates all claimed rows atomically. Case claim remains one statement. No measured latency improvement is asserted until representative worker benchmarks are available.

This closes the worker's direct-table claim conversion only. Production role/policy provisioning, all other operational domains/jobs, parent-derived/global records, private storage and actual provider acceptance remain open under #212. Source conversion and isolated-policy acceptance are not production RLS certification. Overall health stays provisional at 7.6; the complete optimization definition of done remains unmet.

Local checkpoint: all 20 worker tests passed; full API 2,524 passed / 172 database or dedicated Redis skips; risk 318 passed / 5 Redis skips with all floors met. Lint/typecheck/build, 44 invariants, SQL/complexity/security/inventory checks pass. Required CI must execute all 28 RLS cases and the nine-case disposable finance group. The register has 10 indirect SQL sites; the two new sites are the worker capability calls mapped to this migration, not hidden by an allowlist. No local policy-enabled PostgreSQL result is claimed.
