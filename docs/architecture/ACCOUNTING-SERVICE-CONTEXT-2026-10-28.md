# Accounting service context — 28 October 2026

Backlog H27-03/H27-08 (partial). Baseline develop `a86b76e538970042d8d879d391cb4047b06416a6`. Develop only; no release promotion.

AccountingExportService and AccountingConnectorDeliveryService retained explicit society predicates but bypassed transaction-local tenant context. Export create/list/detail/artifact, journal reads, artifact/completion transaction and failure writes now use withTenantContext. Connector list/actions/evidence/metrics and locked manual retry use the same established helper. Existing advisory and row locks, atomic audit writes, parent society joins, PROCESSING predicates, limits, CSV formula protection, exact paise rendering, provider keys, response shapes and failure semantics remain intact. Metrics retain parallel aggregate queries in separate scoped transactions; evidence retains separate reads and its existing consistency semantics. Rendering remains outside the artifact write transaction.

Strict root-client rejection tests cover missing context, scoped reads, artifact reuse/persistence failure, generation exception sanitization and metrics. Existing request replay/conflict, audit, evidence, retry state and CSV/JSONL/Tally tests are retained. The restricted-role fixture adds migrated copies of audit/action/journal/account/fund tables, and three real PostgreSQL cases exercise both societies' request replay/audit, artifact generation/download, foreign-ID denial, retry audit/key immutability, evidence and aggregates. These copies retain RLS but do not reproduce all production FK/trigger behavior or public-role policies; existing migrated bank/export and finance acceptance remains required. An empty journal is deliberate fixture coverage, not a replacement for actual populated export acceptance.

| Item | Classification / reason | Evidence | Risk | Validation |
| --- | --- | --- | --- | --- |
| Root service database calls | REFACTOR to scoped clients | Same SQL and atomic boundaries, plus transaction-local society | Medium | Strict regression, restricted-role PostgreSQL, migrated finance/export |
| Export serialization, locks, retry/audit history | RETAIN | Approved formats, idempotency and business rules | None from deletion | Existing tests and reviewed diff |
| Global export claim and connector seed/claim | DEFER; still RLS blockers | Cross-society dispatch needs narrowly granted capabilities | High until hosted rollout acceptance | Separate follow-up, no generic bypass |
| Files/dependencies/migrations | RETAIN | No removals/upgrades/schema/grant/policy activation | None from removal | Diff and CI |

New read contexts add transaction/context-setting overhead; no latency improvement is asserted. No API, client, permission, migration or dependency change. Hosted ownership/grants/policies and provider acceptance remain separate acceptance requirements; H27-03 is not complete. Existing controller RBAC remains required and is not replaced by database context. Roll back as one develop change if necessary; retain existing tenant predicates.
