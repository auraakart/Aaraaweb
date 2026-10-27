# Billing reads, issuance and webhook tenant context — 27 October 2026

Backlog: H27-03 (partial), H27-08. Baseline develop: `0d050d91a9ea9f5e3f82e4b592dba13df7d7912b`. Target: protected develop integration only.

## Changes and root cause

The checkout/statement slice established context for those transactions. Other billing paths still filtered society in SQL but executed through the root Prisma client, so future non-owner RLS would reject otherwise authorized reads, preference changes, issuance and payment recovery work.

This slice moves the existing billing reads, receipts, AutoPay preference checks/read/write, invoice issue/recipient resolution/outbox enqueue, verified callback receipt persistence, receipt replay counters, webhook transitions and post-rollback failure evidence onto tenant-scoped transaction clients. Current owner/tenant/payer predicates, SQL response fields, history paging, invoice amounts, webhook signatures, payload-digest binding, global provider-event uniqueness, payment row locks/state machine and durable owner/current-tenant notification intent remain intact. Payment and processed-receipt mutations also retain explicit society predicates.

A preference authorization check and its read/write now share one transaction client. Failure evidence opens a fresh transaction in the same society after the transition transaction rolls back; failure-recording errors do not replace the original error. The existing BillingService hotspot cap is retained without introducing a parallel service/query implementation.

## Explicit global callback exception

A provider callback has no user-selected society. Existing signature verification precedes one root, server-owned order lookup. The order's stored society selects the subsequent receipt/processing context; a request payload cannot choose it. That global resolver is not converted into a general tenant bypass or a security-definer function in this slice. **Production RLS activation remains blocked until a narrowly authorized resolver boundary, reconciliation and job paths are reviewed and accepted.** A scoped setting is not a permission grant.

## Validation surfaces

- Existing SQL/business tests are retained and their transaction fixtures updated.
- Fifteen strict regressions reject root-client reads/writes/transactions for society billing paths, require the selected society, verify the AutoPay authority boundary, fail closed on missing context, require signature verification before global lookup, bind receipt persistence to the stored order society and use a fresh scoped failure transaction.
- The guarded isolated non-owner PostgreSQL fixture grows from nine to fourteen cases. New cases exercise positive/negative resident and Admin reads, payer-private preferences, atomic invoice/outbox success and rollback, cross-society receipt visibility/replay, one-time capture and durable failure evidence after rollback. Private payment history/receipt checks extend the existing statement case.
- Isolated copies retain actual migrated table definitions and original enum types. A fixture-only `PaymentStatus` domain over `public.PaymentStatus` resolves the existing unqualified webhook cast within the test schema without duplicating enum values or modifying application SQL/types. See [PostgreSQL domain semantics](https://www.postgresql.org/docs/16/domains.html). The existing public-schema migrated payment/finance tests remain required; copied tables do not reproduce foreign keys/triggers.
- Selected-risk coverage adds AutoPay, strict billing scope behavior and BillingService with a per-file floor. No existing floor is reduced.

## Impact and deletion ledger

| Item | Classification | Evidence / risk / validation |
| --- | --- | --- |
| Root-client society billing I/O | REFACTOR | Retain predicates/results and run the same SQL on the selected transaction client; medium regression risk in finance paths; focused, migrated PostgreSQL, isolated RLS and client regression gates |
| Existing payment, notification and statement engines | RETAIN | No new ledger, gateway, outbox or permission engine; existing callers and API response shapes remain |
| Files/dependencies/migrations | RETAIN | None removed or upgraded; no policy migration, schema change or production role grant |

One context-setting query is added per scoped transaction; no measured latency improvement is claimed. Summary queries retain their existing separate-read semantics. Global callback resolution, reconciliation/jobs, parent-derived records, external storage and hosted non-owner acceptance remain open. Rollback must preserve application authorization and must not automatically disable database protections.

## Local checkpoint

Focused billing/security regressions: 51 passed. API typecheck and established repository/SQL/complexity gates pass. Risk gate passes with BillingService at 98.85% lines / 77.08% branches; statement and webhook thresholds remain intact. Dedicated Redis and non-owner PostgreSQL execution require their disposable CI services. Full protected evidence is recorded with the review candidate before integration; no local/hosted policy activation is claimed.

Broader local checkpoint: API lint/typecheck/build passed; full API suite 2,463 passed / 156 skipped for database and dedicated Redis prerequisites. Expanded risk suite 219 passed / 5 dedicated Redis skips, with every configured floor met. The 44 stable domain invariants, SQL parameter checks, source security rule, hotspot cap and synchronized tenant inventory pass. The source register now records 163 tenant-context calls; that count is not policy enforcement proof.
