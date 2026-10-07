# Aaraagate health assessment and optimization evidence

Review date: 2026-10-07. Read-only baseline: develop `652fe7824f705ab12b1de51060055478e81db174`, V4.86.1. Working branch: `feature/v4.86.2-payment-integrity-health` (candidate name; release manifests remain V4.86.1 until governed promotion).

## Scope and confidence

This is a repository-backed initial assessment plus implemented integrity fixes, not a certification or a declaration that the complete optimization is done. The initial checkout was clean. Recent history includes Assistant voice hardening, chronological circle messages, APK packaging and release-controller/preflight hardening. The latest preflight PR #1103's tested head `eec431c9` had successful CI; no workflow runs were returned for the develop squash SHA itself. New changes need their own CI evidence.

The attached August V1 product/build guide and repository screenshot were inspected. The live repository supersedes their historical implementation status. Repository inventory: 841 literal API operations across 49 roots, 180 SQL migration files, 246 existing documentation files, and 73 mobile test files. Targeted production TypeScript/TSX/Dart inventory contains approximately 81,000 lines. Counts are inventory, not proof of completeness or code quality.

Read priorities: README, architecture and governance, CI/change scope/preflight, authorization and session lifecycle, ownership/occupancy authority, billing/order/webhook/replay, accounting gateway/reconciliation, notification routing/outbox/lifecycle, AI policy/tool routing, document storage/scanning, mobile controller disposal and existing regression suites. Uninspected paths and unexecuted database/device scenarios remain explicit gaps.

## Initial scorecard

Scores are reviewer judgments, not measured SLAs, external security certification, app-store ratings or competitor benchmarks. Confidence is moderate for inspected backend controls and low for device UX, live performance and production readiness.

| Area | Before /10 | After this batch /10 | Basis and limitation |
|---|---:|---:|---|
| Architecture | 8.0 | 8.0 | Modular monolith and extracted domain boundaries; application tenancy remains essential |
| Code quality | 7.8 | 8.0 | Small payment fixes; no broad refactor |
| Maintainability | 7.3 | 7.4 | Explicit regression evidence; many historical source contracts remain |
| Security | 7.5 | 7.8 | Audit gate fails closed and malformed signatures reject safely; no complete penetration test |
| Performance | 7.0 | 7.1 | Gateway wait bounded; no measured API/database/device latency improvement claimed |
| Testability/testing | 7.4 | 7.7 | New behavioral regressions and broader API suite; database/mobile gaps remain |
| UX consistency | 7.5 | 7.5 | No UI changes or device visual acceptance in this batch |
| Documentation | 7.0 | 7.4 | Capability-index baseline corrected and this evidence/backlog added |
| Competitive position | 7.5 | 7.5 | Broad module coverage; deployment, support and field outcomes unproven |
| Overall health | 7.5 | 7.7 | Incremental repository improvement, not Definition-of-Done closure |

## Prioritized backlog

| ID | Finding | Severity | Recommendation / classification | Risk | Effort | Status |
|---|---|---|---|---|---|---|
| H09 | Audit error/missing metadata defaults to zero vulnerabilities | P0 / High security-gate weakness | REFACTOR: require completed, structurally valid audit evidence | Low | Small | Fixed; CLI regression tests added to CI |
| H01 | Separate invoice locks allow concurrent same-key upsert to return another invoice's payment | P0 / High payment-integrity risk | REFACTOR: validate the returned invoice binding before audit/return; throw inside transaction | Medium | Small | Fixed; conflict-winner regression passes; real DB race validation pending |
| H02 | Paid invoice check precedes recovery of its existing idempotent order | P1 | REFACTOR: retain authorization/row lock, resolve existing order before rejecting new payments | Low | Small | Fixed; authorized retry/new-order/conflicting-key regressions pass |
| H03 | Unicode signature with 64 characters creates unequal byte buffers and throws RangeError | P1 / Medium security | REFACTOR: validate lowercase SHA-256 hex representation before timing-safe comparison | Low | Small | Fixed; malformed-input regressions pass |
| H04 | PostgreSQL tenant context exists but RLS is explicitly not enabled | P2 / defense-in-depth gap, not demonstrated leakage | RETAIN application enforcement; DEFER RLS until policy/migration review and database-backed isolation coverage | High | Large | Open; do not enable policies blindly |
| H10 | Invoice commit and asynchronous notification dispatch are separate durability boundaries | P1 reliability risk | CONSOLIDATE invoice/outbox persistence in the same transaction; dispatch only after commit | Medium | Medium | Fixed; owner/tenant queue and failure regressions pass; real crash acceptance pending |
| H11 | Largest UI/domain files remain 600–1,000 lines | P2 maintainability | RETAIN until specific coupling/change risk is demonstrated; extract bounded components only with behavior evidence | Medium | Medium | Open; existing complexity budgets pass |
| H05 | Current-capability entry header identifies V4.82 while body includes V4.86.1 | P3 | CONSOLIDATE current entry point, RETAIN historical release evidence | Low | Small | Fixed |
| H12 | No unused dependency or deletion candidate has sufficient removal evidence | P3 | RETAIN; prove runtime, dynamic, fallback, migration and CI references before REMOVE | Medium | Medium | No removals approved by evidence |
| H08 | Gateway fetch has no deadline; sequential reconciliation worker can remain running indefinitely | P4 / reliability | REFACTOR: abort each attempt after ten seconds; preserve UNKNOWN/retry recovery and refund idempotency | Low | Small | Fixed; stalled query/refund tests pass |
| H06 | Supported-runtime, database, mobile/device and latency evidence not complete | P4 validation | Run Node 22 CI, migrated PostgreSQL scenarios, Flutter suites and representative load tests | Low | Medium | Open; see evidence below |
| H07 | Competitive functionality exceeds demonstrated field readiness | P5 | RETAIN scope; prioritize gate speed, notification delivery, finance/operator acceptance and support readiness | Medium | Large | Open; no speculative feature expansion |

Logical batches: A—payment/security integrity (H09/H01/H02/H03/H10); B—bounded gateway recovery and documentation (H08/H05); C—database isolation/concurrency and recovery acceptance (H04/H06); D—evidence-backed maintainability/performance (H11/H12); E—field/competitive validation (H07). B fixes are implemented in the same reviewable commit as A to limit commit churn. C–E remain open.

## Changes and root causes

1. `payment-order.service.ts`: an invoice row lock serializes payers of one invoice but cannot serialize a key shared by two different invoices. Verify the invoice ID on the upsert result. A mismatch throws in the transaction before an ORDER_CREATED event, rolling back the conflict update. Authorization remains checked before entry and again on the locked invoice. Existing-order recovery now precedes the ISSUED requirement; new orders still require a payable invoice.
2. `billing.service.ts`: validate the signature representation before comparison. Previously character count was mistaken for byte count. HMAC canonicalization, required server secret and timing-safe comparison remain intact; lowercase hex compatibility is preserved.
3. `configured-http-payment-gateway.adapter.ts`: forward a ten-second abort signal to query and refund fetches. Abort failures propagate to the existing runner, which records uncertain/retry evidence. A timeout never means the refund did not happen at the provider; retry retains the same idempotency key. No new automatic retry loop or successful-payment inference is added.
4. `check-dependency-risk-budget.mjs`: reject spawn errors, termination, registry error payloads, absent/incomplete/non-integer/negative severity counts and failed zero-advisory results. Legitimate nonzero advisory exits still receive the existing moderate/high/critical budget. Nine CLI cases exercise this boundary through a deterministic audit executable. CI runs them in Repository structure, including when a package audit is scoped out.
5. `CURRENT-CAPABILITY-INDEX.md`: update the current entry baseline without replacing historical evidence.
6. Invoice issuance now persists owner/tenant push intents through the existing `PushDeliveryOutboxService` using the invoice transaction client. Both recipients retain the existing dedupe key and gain the already-known unit ID. Realtime dispatch remains post-commit. Queue failure rejects the invoice transaction rather than leaving committed dues without delivery work. The Notifications module exports the existing outbox for Nest injection; normal application startup requires that dependency. `billing-notification-durability.spec.ts` verifies transactional enqueue, recipient scope, deduplication identity and no dispatch on failure.

Additional changed files are `payment-integrity.regression.spec.ts`, the gateway adapter spec, `push-delivery-outbox.service.ts`, `notifications.module.ts`, `check-dependency-risk-budget.test.mjs`, `.github/workflows/ci.yml`, and this report. No API paths/DTOs, schema/migrations, permissions, Flutter screens or finance ledgers are replaced.

## Protected business rules and test evidence

| Workflow | Repository evidence examined | Remaining acceptance gap |
|---|---|---|
| Authentication and RBAC | Session hashes/refresh rotation, active society/user validation, permission guard and guard-execution segregation | Full hosted abuse testing |
| Society isolation | Session-derived society context, scoped SQL, authorization specs, transaction-local context helper | Real PostgreSQL isolation tests not run locally; RLS absent |
| Owner/tenant/occupant | Occupancy authority regressions; gate recipient lookup uses active/time-valid occupancy; dues recipients include verified current ownership and current tenancy | Real move-in/out and concurrency fixtures |
| Owner/tenant payments | Existing eligibility checks preserved; other payer's active invoice order blocked; payer/private receipt tests retained | Real two-payer/payment-key race tests |
| Billing/payments/reconciliation | Server HMAC, persisted receipts, event uniqueness, transactional state transitions, replay, deposit and allocation tests | Live provider amount/currency verification and certification remain external |
| Notifications | Tenant/user stream keys, teardown cleanup, outbox retries/deduplication, fallback/routing and transactional invoice enqueue suites | Real process-crash/PostgreSQL rollback acceptance, push delivery and escalation |
| Visitors/gate/staff/delivery/parking | Existing API access, visitor, workforce, parcels and parking specs in broader suite; source journey contracts | Guard device/offline and cross-role field acceptance |
| Services/complaints/amenities/community/admin | API suite and Admin core/finance/governance/operations/UI contracts | Browser/mobile behavior under real networks and role accounts |
| AI | Permission allowlisted tools, property authorization, injection screening, audit and controlled-action specs | Full adversarial review; keyword screening alone is not a security boundary |
| Files and auditability | Society-prefixed private keys, metadata validation, scanner boundary and authorization/audit specs | Hosted object storage, real scanner and retention evidence |

Local validation evidence:

- New payment regression run before fixing production: **4 failed, 5 passed** (captured retry, conflicting paid retry, conflict-winner binding, Unicode signature).
- First payment-focused post-fix suite: **48 passed**, 10 files.
- Gateway deadline cases before fixing production: **2 timeouts**, confirming missing cancellation.
- Broader post-fix API suite: **1,363 passed, 2 skipped**, 334 passed files and one skipped database integration file. Skips were explicit PostgreSQL tenant-context scenarios because DATABASE_URL was not configured.
- Admin core, finance/governance, operations and UI-contract groups and Admin typecheck pass. These source-contract suites are not rendered browser UAT.
- Secret scan: **1,645 tracked paths** at baseline, pass. No exposed high-confidence secret patterns found; this is not an exhaustive secret-history attestation.
- Stable domain source invariants: **44 checks pass**; complexity budgets, API contract inventory, repository integrity, required merge-gate orchestration, V4.86 readiness and cross-app source journeys pass.
- Direct pinned pnpm audit JSON: info/low/moderate/high/critical **all zero**, 530 reported dependencies. No blind dependency upgrades or removals.
- Audit-gate CLI regressions: **9 pass**, including error, malformed evidence and moderate/high/critical advisories.
- Initial local runtime was Node 24. Node 22.23.3 was then installed outside the repository; the broader API suite, lint/typecheck, audit-gate CLI cases and real dependency audit were repeated successfully on Node 22. Do not reuse an earlier PR's CI as this branch's validation.
- Prisma generation and schema validation succeeded. Schema validation does not prove that all 180 migrations apply on PostgreSQL.
- After transactional dues enqueue, the focused billing/notification suite passes **68 tests across 16 files**. Final broader-suite results and new PR CI status are recorded below.

No latency, query-plan, Flutter rebuild, startup, bundle-size or CI-duration improvement is quantified. The gateway deadline is a bounded-failure improvement, not a claim of faster successful requests.

## Documentation classifications and deletion ledger

| Item/group | Classification | Decision |
|---|---|---|
| Root README and docs/architecture/README.md | CURRENT | Retain architectural entry points |
| CURRENT-CAPABILITY-INDEX.md | CURRENT | Correct baseline; keep one current capability entry |
| REPOSITORY-GOVERNANCE.md, SECURITY.md, API contract policy | CURRENT | Retain controls; repository governance prose is not a fresh live ruleset attestation |
| Versioned AARAAGATE-V* evidence | HISTORICAL | Retain migration, release, design and recovery traceability |
| Initial attached V1 build guide and screenshot | HISTORICAL source | Do not overwrite with inferred current facts |
| Generated OpenAPI inventory and audit/test outputs | GENERATED | Regenerate; do not add transient logs to current-state documentation |
| Similar milestone source checks | Possible overlapping evidence | RETAIN until dependencies and historical value are individually resolved |
| DUPLICATE / OBSOLETE / SAFE TO DELETE | No verified candidates | Filename similarity alone is insufficient |

This classification is for inspected entry points/groups, not a semantic audit of every documentation file.

| Item | Reason | Evidence | Risk | Validation |
|---|---|---|---|---|
| No source/dependency/document deletions | Insufficient evidence of safe removal | Existing runtime, fallback, migration, CI and history dependencies preserved | Lowest deletion risk | Diff confirms no removed files; tests retain existing behavior |

## Competitive assessment

Reviewed official vendor pages on 2026-10-07. Vendor claims describe advertised capabilities, not independently verified security/uptime or numeric ratings. Aaraagate parity here means repository-level functional coverage, not equivalent deployment maturity.

| Dimension | Aaraagate assessment | Priority |
|---|---|---|
| Gate, visitor, domestic staff and society workforce | Parity in implemented core; occupancy authority and linked work evidence offer potential differentiation | Guard speed and real push/offline recovery evidence |
| Resident experience and community | Parity in core notices/polls/events/circles; privacy controls and Easy mode are useful | Device accessibility and simple first-use journey |
| Billing/accounting/reconciliation | Broad accounting parity; live gateway/AutoPay execution remains a Gap; resident checkout is full-invoice only | Transaction integrity and treasurer acceptance before payment expansion |
| Services | Booking, provider readiness, community deals and gate-linked fulfilment offer potential Differentiator | Provider reliability; do not imply live KYC, insured work or real settlement |
| Amenities, complaints and admin | Parity in repository workflow breadth | Rendered end-to-end role/operator validation |
| Parking and hardware | Software parking Parity; certified RFID/ANPR integrations are a Gap | Defer hardware until required by pilot |
| Analytics, automation and AI | Permission-scoped evidence and confirmed domain actions are potential Differentiator | Validate outcomes, auditability and authorized data minimization |
| Privacy/security | Explicit scope and private evidence are strengths; external certification/compliance is not established | Complete tenant abuse tests and hosted security evidence |
| Advertising, biometrics and broad partner commerce | Unnecessary competitor features for present goals | Do not add merely to match catalog size |

Sources:

- MyGate: https://mygate.com/society-erp/society-mangement-system/ and https://mygate.com/society-accounting-software/
- NoBrokerHood India: https://nobrokerhood.com/solutions/visitor-management-system-in-delhi and https://www.nobrokerhood.com/blog/erp-solutions/
- ADDA India: https://ind.adda.io/apartment-management-system
- ApnaComplex/ANACITY India: https://www.apnacomplex.com/common_public/ and https://help.apnacomplex.com/

No defensible numeric competitor engineering/security ratings can be derived from public marketing pages. Aaraagate's strongest next move is to prove secure, fast operations with current capabilities before adding more feature surface.

## Completion boundary

Known narrow fixes are reviewable; complete optimization remains open. Do not promote based solely on this report. Required next evidence: new-head CI; migrated PostgreSQL owner/tenant, isolation, concurrent payment and notification crash behavior; Flutter/device/offline acceptance; measured database/API/mobile baselines. Main remains subject to explicit owner approval and protected branch checks.

### Final local batch checks

On Node 22.23.3: final API suite **1,365 passed, 2 PostgreSQL-dependent tests skipped**; API lint/typecheck pass; audit CLI regressions **9 pass**; real pinned dependency audit passes with all five severity counts zero. Prisma generation/schema validation, all 44 static domain checks, API inventory, complexity/repository/merge-gate checks and Admin contract suites/typecheck pass. Flutter SDK, PostgreSQL migration execution and rendered browser/device UAT remain unavailable locally. No migrations or dependencies changed. No files removed. CI for this new branch must still establish protected merge eligibility.

### Protected CI and integration follow-up

PR #1106 passed every required gate and was squash-merged into develop as `f0a8dea07353de49ff54d167a1e3861ae35742b4`. The published head `339209be` has source tree `49c42ae39350f423e73f821775393c7048a34119`, identical to the locally tested `a5aa0411` tree. CI run `37657947551` applied all **180 migrations** successfully on PostgreSQL 16, passed **1,367 API tests with no skips**, and passed **58 risk-weighted API tests** plus the API startup/smoke gate. Admin and Flutter full validation, repository structure, compatibility preflight, dependency-security wrapper and required merge gates passed. The dependency graph was unchanged, so CI scoped out a repeated full dependency audit; the real local audit and nine failure-handling regression cases remain the direct audit evidence. Main remains unchanged at `1d86fd71c7f28d3c4e4d64625430d9a1beedfaf5`.

The next focused batch adds `payment-integrity.postgres.spec.ts` with eight database-backed cases: cross-society invoice denial even for an owner of the other property; occupant-only gate routing for a non-resident owner/current tenant; captured-order retry without duplicate audit; concurrent owner/tenant invoice attempts; a deterministic concurrent cross-invoice idempotency-key collision; owner/tenant dues outbox commit; invoice/outbox rollback after a post-enqueue error; and expired-tenant gate/payment denial while owner payment eligibility remains intact. The race synchronizes real SELECT results rather than replacing SQL. Fixtures use random societies/users and cleanup is restricted to those fixture IDs. Local lint/typecheck pass; execution requires the migrated PostgreSQL CI service, so these eight cases are pending until the follow-up PR passes. No runtime behavior, schema, API or dependency changes are introduced by this test batch.


### PostgreSQL evidence completed and summary query slice

PR #1107 passed required CI and merged into develop as `316a0e0f54307c10c9dd1eca5d3b9481ab5be7bd`. CI run `37659172210` applied all 180 migrations and passed **1,375 API tests with no skips**, including all eight payment integrity PostgreSQL cases above. The previous paragraph's pending status records the authoring-time state and is superseded by this result.

The next performance slice scopes existing payable-invoice and visible-payment queries by the optional summary property before rows reach Node. Previously a property summary fetched all authorized properties' rows and then filtered in memory. Existing society/current-owner/current-tenant/payer predicates, list endpoints without a property filter, summary calculations and checkout policy remain intact. The in-memory invoice-ID intersection remains as a compatibility and visibility safeguard. No migration, index, API payload, dependency or file deletion is needed; the existing invoice index starts with society and unit.

Two additional PostgreSQL cases validate the summary: a 32-property fixture checks returned-row reduction, exact owner/tenant totals, private tenant payment visibility and the aggregate summary; a scope case checks other-society, unauthorized and absent properties. Actual returned-row counts will be logged by CI; no production latency improvement is claimed. Local checks and this slice's CI must pass before merge. Remaining work includes broader measured performance, device/offline field acceptance and external provider evidence. Tenant RLS and large-component refactoring remain deferred pending a concrete policy/design or demonstrated coupling.


### Billing summary slice completed; analytics correctness and bounded aggregation

PR #1108 passed required CI on corrected head `497eb204` (tree `536c092bb1d228605484e6a70d0184818e225634`) and merged into develop as `ae92b1bc0e0bc97d1b81182cdea98e2c81f8eb52`. CI run `37663698449` applied all 180 migrations and passed **1,377 API tests without skips** plus 58 risk-weighted cases. The real 32-property fixture reduced invoice rows **38 to 1** and visible payment rows **37 to 2** for a property summary. An initial CI run exposed an incorrect new test expectation counting a paid fixture invoice as open; the corrected test counts ISSUED invoices. Production calculations were unchanged.

| ID | Finding | Severity | Recommendation | Risk | Effort | Status |
|---|---|---|---|---|---|---|---|
| H13 | Property summaries fetched every authorized property's rows before filtering | P4 / Low | Scope existing SQL by optional unit; preserve authorization and summary contracts | Low | Small | Completed #1108, measured fixture row reduction |
| H14 | PostgreSQL lowercases unquoted mixed-case analytics aliases; mocks masked missing camel-case contract fields | P1 / Medium | Add canonical metric aliases while retaining lowercase fields for compatibility | Low, additive API fields | Small | Completed #1109, PostgreSQL contract verified |
| H15 | Journey aggregate inputs include lifetime rows that cannot affect the requested window | P4 / Low | Restrict inputs to any relevant in-window milestone; compare original aggregates and EXPLAIN inputs | Low, timestamp semantics protected by DB tests | Small | Completed #1109, aggregate inputs measured |

Analytics scope: journey, helpdesk, service and payment aggregates retain inclusive time boundaries and society predicates. Historical rows created earlier but entered/exited/resolved/closed/completed during the window remain eligible. Operations dashboard lifetime-open counts are deliberately unchanged. Four new database cases cover exact counts and tenant boundaries, original-versus-optimized aggregate equivalence with EXPLAIN ANALYZE input-row measurements, empty-society behavior and canonical/legacy metric compatibility. Two local unit regressions model PostgreSQL's actual lowercase aliases, including zero counts. No migrations, dependencies, files or legacy API fields are removed. No production latency or index-I/O gain is claimed.

Analytics local evidence on Node 22: the two new casing regressions fail against the prior production service and pass after the fix. Full local API suite: **1,367 passed, 16 database-dependent cases skipped**; lint/typecheck, 44 stable-domain checks, API inventory, repository integrity and complexity checks pass. New migrated-PostgreSQL CI remains required before merge.


### Analytics slice completed; push lease integrity

PR #1109 passed required CI on head `88ffd696` (tree `2cd3d27e473c96701f1ae1fb045b9fd55eb14750`) and merged into develop as `c064a371cd766778e70b6d5a61275abc14d93f62`. CI run `37666328320` applied all 180 migrations and passed **1,383 API tests with no skips** plus 58 risk-weighted cases. EXPLAIN ANALYZE confirmed aggregate input rows **102 to 2** for each of the four fixture queries; every original aggregate remained identical. PostgreSQL contract tests passed for camel-case and retained lowercase fields. Earlier CI corrected test-only issues: parameterized plan comparisons comply with the existing SQL safety rule, and closed-complaint fixtures now include required closure evidence. No production constraints were weakened.

| ID | Finding | Severity | Recommendation | Risk | Effort | Status |
|---|---|---|---|---|---|---|---|
| H16 | Stale push workers can overwrite a newer claim because completion omits attempt identity | P1 / Medium | Fence success/failure updates by existing monotonically increasing attemptCount; report skipped when ownership is lost | Low, delivery transport still at least once | Small | Implemented; real PostgreSQL races pending |
| H17 | Final-attempt process crashes remain IN_FLIGHT forever because retry-cap rows cannot be reclaimed | P1 / Medium | Move expired exhausted leases to FAILED with explicit unknown-transport evidence, preserving the retry cap | Low, uncertain transport recorded explicitly | Small | Implemented; PostgreSQL expiry cases pending |

The existing outbox, dedupe keys, society/user payload identity, eight-attempt cap, ten-minute lease threshold, exponential backoff and SKIP LOCKED batch claim remain authoritative. Both success and failure acknowledgement now require the same attempt number as the worker's claim. Stale acknowledgements report skipped and cannot rewrite another worker's status, retry schedule or error. Exhausted stale leases become FAILED with `Final push delivery lease expired; transport outcome unknown`; fresh final attempts remain untouched. Expiry is embedded in the existing claim statement, without extra database round trips. Direct claims expire only their requested ID; the authorized global scheduled sweep retains its existing cross-society queue role.

Four database cases exercise late success, late failure, final-attempt expiry without a ninth send, and live/unrelated lease retention. Fixtures and cleanup use random dedicated society/user IDs, and tests never drain or mutate unrelated societies' global pending work. Two local regressions fail against the previous acknowledgement logic and pass after the fix. No migrations, dependencies, API payload fields, files or functionality are removed. The external push transport remains at least once: fencing protects persisted state but does not cancel an already sent provider request or establish exactly-once display. Device delivery, dead-letter escalation and field acceptance remain open evidence boundaries.

Push lease local evidence on Node 22: **1,369 API tests passed, 20 database-dependent cases skipped**; API lint/typecheck, 44 stable domain checks, tenant readiness, privacy/dependency, maintainability/hygiene, API inventory, repository integrity, merge-gate orchestration and complexity checks pass. New-head PostgreSQL CI remains required.


The first push-lease PostgreSQL run exposed an additional existing runtime failure: Prisma binds numeric minute parameters as bigint, and PostgreSQL `make_interval(mins => bigint)` has no matching signature. Both pre-existing outbox claim paths and the new expiry predicate now cast the bounded minute constant explicitly to `int`. Race tests now surface early claim rejection through Promise.race instead of waiting on a transport barrier. Related uncast numeric minutes/hours in parcel pickup/reminders, helpdesk policy reapplication and storage-cleanup backoff are prioritized for the next correctness slice; second-based intervals use PostgreSQL's double-precision seconds parameter and are a separate signature. None of these follow-up modules are changed in the outbox slice.
