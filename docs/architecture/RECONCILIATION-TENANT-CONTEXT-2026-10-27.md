# Payment reconciliation tenant context — 27 October 2026

Backlog: H27-03 (partial), H27-08. Baseline develop: `863c4003b5b225d379e90dbd96e08bc6439752ac`. Target: protected develop integration only.

## Root cause and implementation

Reconciliation cases, gateway operations and metrics had society predicates but used root-client reads/writes or transactions without transaction-local tenant context. These paths would fail under the planned non-owner RLS policies, including result recording called by the background runner.

All eight public reconciliation methods and metrics now use the selected society's transaction client. Existing payment/case/operation row locks, advisory idempotency lock, same-request key binding, provider identity binding, settled-state protections, paise precision, queue priorities, response fields and finance permissions remain authoritative. Case resolution updates and its response read now commit together; a response-query failure rolls the update back. Metrics aggregates share a context at the existing default isolation level; no repeatable snapshot guarantee is added.

Case detail reuses the existing scoped detail query, removing a duplicate SELECT implementation. The retained query has identical fields and society/id predicates; the migrated primary key guarantees at most one row. Missing cases still produce the same NotFound response.

## Security boundaries still open

The runner's cross-society `claimOperations` and `claimCases` are unchanged explicit activation blockers. Its per-record result/observation calls now enter the record society's context through this service, but that does not authorize global discovery. The callback's signature-verified global order lookup is also unchanged. No blanket bypass role, security-definer function, runtime grant, production RLS policy or schema migration is introduced.

Before activation, global discovery needs a separately reviewed capability restricted to due work or exact signed-order resolution, followed by tenant-scoped processing. Preserve queue limits, SKIP LOCKED semantics, retry backoff, provider selection, idempotency, fairness and evidence. Review role inheritance, grants, search paths, transaction/connection reuse and negative cases; a public callback must never receive generic data access. Parent-derived records, other domains, storage and hosted non-owner acceptance remain open under #212.

## Validation

Sixteen strict regressions reject root reads/writes/transactions, require the selected scope and exercise case lifecycle, foreign/missing records, financial observations, operation creation, bigint metrics and context failure. Existing authorization, precision, idempotency, provider-binding and queue tests are retained. The selected-risk gate adds these tests and both runtime services without reducing any existing floor.

The guarded isolated non-owner RLS fixture grows from 14 to 18 cases. New cases cover positive/negative case lifecycle, operation retry/result isolation, settled-evidence preservation, per-society metrics and resolution rollback with pooled-context cleanup. Actual migrated table definitions and enum-backed test-schema domains are retained. Copied tables do not reproduce foreign keys/triggers; public-schema migrated finance acceptance remains required and is not replaced by this fixture.

Local checkpoint: 47 focused tests passed; risk 266 passed / 5 dedicated Redis skips, with all floors met. Reconciliation service: 100% selected lines/functions and 78.84% branches; metrics: 100% lines/functions. Lint/typecheck/build, 44 domain invariants, SQL parameter checks, source secret scan, complexity and tenant inventory checks pass. Full regression and dedicated non-owner PostgreSQL acceptance are recorded with protected candidate evidence before integration; no local policy-enabled database result is claimed.

## Impact and deletion ledger

| Item | Classification / reason | Evidence | Risk | Validation |
| --- | --- | --- | --- | --- |
| Root reconciliation I/O | REFACTOR into tenant context | Same SQL, predicates, locks and result mapping | Medium: finance transaction boundaries | Focused, public-schema finance, isolated RLS and required CI |
| Duplicate case detail SELECT | CONSOLIDATE into existing helper | Same fields and society/primary-key lookup; runtime method retained | Low | Missing/foreign detail, lifecycle and response tests |
| Files, dependencies and migrations | RETAIN | No deletion or upgrade proposed | None from removal | Reviewed diff has no deleted paths |

One context-setting query is added per scoped operation. Resolution combines update/response into one transaction; no measured latency improvement is asserted. No API, UI, entitlement, owner/tenant eligibility, notification-routing or payment-ledger change is intended. Rollback must preserve authorization and must not automatically disable database protections. Overall health remains the provisional 7.6 checkpoint; H27-03/H27-08 remain partial.

Broader local checkpoint: full API 2,479 passed / 160 database or dedicated Redis cases skipped. The source inventory records 172 context calls and zero migration policy signals; this is an access register, not enforcement proof. Required CI must execute all 18 isolated RLS cases and existing migrated finance workflows.
