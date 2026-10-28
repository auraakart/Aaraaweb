# Aaraagate repository health review — 27 October 2026

## Scope, authority and limitations

Read-only baseline: `auraakart/Aaraaweb`, develop `50977d7f0ae84d39a6a4dd9eb2057e18addc0b2f`, tree `94a7e7726625470ac29caf75a8ef56e708face2e`. Work branch: `fix/health-assessment-20261027`. Main's recorded release is `29f95ecaef53c5a03af8858ea89ca58cf2fe0811`. Main/staging are not changed by this review. Canonical promotion remains feature → develop → staging → main, with protected checks and manual main review.

The attached August product specification was read for requirements context; current repository implementation and newer approved owner/tenant rules take precedence. This is an incremental assessment, not a completed independent penetration test, standards certification, physical-device UX review or production acceptance. Findings distinguish observed defects, architectural limitations and missing evidence. No blanket rewrite or RLS activation is justified by this review.

Repository inventory at baseline: 2,381 tracked files, 452 API spec files, 218 migration files, 95 Resident test files, 45 Guard test files and 422 Markdown documents under docs. Counts are files, not unique test cases or coverage percentages. The retrieved Git tree was not truncated.

## Initial scorecard, before fixes

Scores are professional judgment, not measured competitor benchmarks. Performance and UX scores have lower confidence because production load and authenticated physical-device evidence were not collected. Overall is the rounded equal-weight mean of the nine dimensions (7.47).

| Dimension | /10 | Evidence and constraint |
| --- | ---: | --- |
| Architecture | 8.0 | Modular NestJS monolith, bounded contexts, shared clients and explicit ownership/occupancy; avoid service extraction without evidence |
| Code quality | 7.8 | Typed services and extracted policy/query helpers; authentication concurrency defect and several compressed/large units remain |
| Maintainability | 7.4 | Hotspot budgets and stable invariants; 995-line provider completion and 982-line amenities service remain |
| Security | 7.0 | Server guards, HMAC callbacks, active-relationship checks; OTP concurrency and route throttling defects; RLS rollout remains open |
| Performance | 7.0 | Tenant-leading index contracts and bounded history paths; several unbounded finance lists; no new p95/EXPLAIN/load proof |
| Testability | 8.2 | Extensive behavioral, PostgreSQL, Flutter and browser suites; selected-file risk coverage is not whole-repository assurance |
| UX consistency | 7.5 | Shared Admin components, recovery states, role-specific clients; TalkBack, Tamil repeated input and device approval remain open |
| Documentation | 6.8 | Rich historical evidence; capability index omits V5.10 at top, architecture introduction is dated V2 and navigation is ambiguous |
| Competitive position | 7.5 | Broad repository feature coverage and useful permission-scoped operations; live-provider, field training and independent acceptance gaps |
| Overall health | 7.5 | Promising engineering baseline; do not equate automated completion with operational readiness |

## Prioritized backlog and implementation batches

Risk is change/regression risk. Effort: S is a focused change; M crosses a bounded module; L needs cross-module or external acceptance. Security severity is separate from execution priority.

| ID | Finding | Severity | Recommendation / classification | Risk | Effort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| H27-01 | OTP check/update/consume are separate operations; failed checks refresh TTL and concurrent attempts can lose increments | P0 / High | REFACTOR to one atomic Redis verification with original expiry, equivalent development semantics and concurrent regressions | Medium | M | Diagnosed; Batch A |
| H27-02 | Exact-string rate policy differs from Express route matching; Partner and host Partner OTP verification miss strict bucket | P0 / High | REFACTOR policy matching to route aliases and share verification bucket; test actual HTTP routing and store failure | Low | S | Diagnosed; Batch A |
| H27-03 | Transaction-local tenant context is not RLS enforcement; runtime-role/parent-derived/job/storage acceptance remains open (#212) | P0 / High assurance gap | RETAIN application checks; stage transaction-client conversion and policy-enabled negative tests per V5.10 rollout | High | L | Open; not a newly demonstrated cross-society exploit |
| H27-04 | Provider payment acceptance is not proven by simulator HMAC receipts | P0 / High release assurance gap | RETAIN locks, HMAC, idempotency and receipts; confirm actual provider amount/currency/order identity and replay/reconciliation before live enablement | High | L | Open external/provider acceptance |
| H27-05 | Capability index/architecture entry points describe older current state | P3 / Medium | CONSOLIDATE navigation to existing current V5.10 evidence; distinguish historical release narratives | Low | S | Batch B |
| H27-06 | Legacy OtpStore duplicates active auth state, but deletion evidence is incomplete | P3 / Low | RETAIN pending reference/dynamic/test audit; do not delete on filename or age | Medium | S | Retained; deletion ledger below |
| H27-07 | Large provider/amenity/workforce/report services remain near budgets | P2 / Medium | REFACTOR bounded query/policy concerns only when behavioral coverage protects contracts | Medium | M | Open; existing budgets retained |
| H27-08 | Selected risk coverage leaves substantial code outside instrumented files | P1 / Medium assurance gap | RETAIN full suite; expand risk selection based on actual defects, including OTP behavior and rate middleware | Low | M | Batch A test work; broader coverage remains open |
| H27-09 | Several invoice/audit/summary paths load full histories | P4 / Medium | DEFER API-shape changes until EXPLAIN/p95/row-count evidence; add compatible pagination/SQL aggregates where measured | Medium | M | Open; code-level candidate, not measured bottleneck |
| H27-10 | Default workspace Node 24/pnpm 11 differs from repository Node 22/pnpm 10; pnpm 11 ignores manifest overrides | P1 / Medium validation risk | RETAIN pinned Node 22.22.2/pnpm 10.15.0 for install and checks; frozen lockfile, no incidental upgrade | Low | S | Correct toolchain selected for this review |
| H27-11 | Device, multilingual repeated speech, screen-reader and independent Partner A/B acceptance outstanding | P1 / Medium release assurance gap | RETAIN current acceptance register; execute exact-candidate device matrix and independently operated partner tests (#1380) | Medium | L | Open external evidence |
| H27-12 | Live dependency audit and candidate CI need fresh evidence | P0 / High if vulnerability found | RETAIN zero High/Critical dependency tolerance; run audit and required candidate CI; no blind major upgrades | Medium | M | Pending; prior green evidence not current scan |
| H27-14 | Gateway accepts invalid/unsafe refund numbers; runner converts stored BIGINT without range validation | P0 / High boundary risk | REFACTOR to validate before conversion/fetch; retain valid request identity and retry evidence | Medium | S | Implementation and local risk pass; protected CI pending |
| H27-13 | Competitors already market broad ERP/AI capabilities | P5 / Medium | DEFER feature expansion; prove guard speed, trustworthy finance and useful authorized AI outcomes before adding breadth | Low | L | Comparative review below |

Batch A: reproduce and fix authentication security defects; test TTL, concurrency, route equivalence, shared quotas and fail-closed behavior; review runtime diff. Batch B: current-state documentation navigation and evidence alignment, retaining history. Batch C: execute risk/full API and appropriate repository regression; audit dependencies; review migrations and candidate CI. Larger RLS/provider/device/field tasks remain explicitly gated by their actual prerequisites; no acceptance can be synthesized from a report.

## Architecture and workflow review

Retain the existing Flutter Resident/Guard, Next.js Admin, NestJS modular monolith, Prisma/PostgreSQL, Redis and durable push outbox. The architecture guide separates operational tenancy from partner branding/commercial authority. Do not duplicate marketplace, ledger, notification or identity engines.

Inspected security/correctness surfaces include BearerGuard, TenantGuard, AuthController, AuthService, AuthStateStore, PrismaService, runtime-role catalog preflight, property-finance permission helpers, GateRecipientService, BillingService, PaymentOrderService, PaymentWebhookProcessor, BillingController, AI tool policy/controller and Guard durable queue. Static inspection is not proof of every API route or runtime path.

- Owner/current tenant: payable queries and payment order checks require verified active ownership or active TENANT occupancy within effective dates. Nonresident ownership is not gate occupancy. Preserve `currentPayerPropertySql` and controller permissions.
- Gate notifications: GateRecipientService scopes society + unit + active/effective occupancy and gateNotificationEnabled. Preserve primary contact/escalation ordering and approval eligibility.
- Dues: invoice issuance selects active owners and current tenants, uses durable outbox intent within the transaction, then realtime publication. Preserve owner and tenant eligibility and recipient union.
- Payment integrity: order creation rechecks authority under invoice row lock; existing order and key binding protect concurrent owner/tenant payments and retries. Webhooks use server HMAC, unique event receipts, payload digest binding, transaction locks and audited payment events. This custom gateway-adapter protocol does not establish certification or real provider amount/currency validation.
- AI: tools are permission scoped, tenant/property context is explicit and controlled actions have preview/confirm endpoints. Regex prompt-injection screening is supplemental; backend permission checks and domain authority remain the boundary. Do not introduce unrestricted SQL/LLM access.
- Offline Guard: queue entries bind society and guard, retain idempotency keys and distinguish transport retry from review-required failure. Offline queue acceptance does not authorize entry without required server verification.
- Database: current helper uses transaction-local set_config and parameterized Prisma SQL; it does not activate policies. Catalog presence checks explicitly say isolationProven=false. Parent-derived records and global worker exceptions need semantic acceptance.

## Deletion ledger

| Item | Reason | Evidence | Risk | Validation |
| --- | --- | --- | --- | --- |
| None removed in this review | Functionality and historical evidence take priority | No deletion has met the complete dynamic/runtime/API/migration/flag/offline/test/CI/backward-compatibility checklist | Avoids speculative behavior loss | Diff must contain no deleted paths |
| services/api/src/auth/otp.store.ts — RETAIN | Apparent older in-memory duplicate, not registered in current AuthModule | AuthModule registers AuthStateStore/AuthService; full dynamic/backward-compatibility proof not yet established | Unknown external/test consumer | No removal authorized by incomplete evidence |
| Historical release/architecture records — RETAIN | Decisions, migrations, recovery and release evidence must survive navigation cleanup | Versioned documents are referenced by source-contract scripts | Deleting them could break traceability and CI | Keep files and historical anchors intact |

No dependency is removed solely because a package appears unused. Static import absence does not establish runtime/tooling/native absence. No major dependency upgrade is part of this review.

## Documentation classification

| Document/group | Class | Action |
| --- | --- | --- |
| README.md | CURRENT | Keep concise current cycle and promotion pointers |
| docs/V5.10-HEALTH-HARDENING.md | CURRENT | Authoritative V5.10 engineering/remaining-acceptance record |
| docs/architecture/V5.10-TENANT-ISOLATION-ROLLOUT.md | CURRENT | Keep concrete RLS sequencing; enforcement remains open |
| docs/architecture/README.md | CURRENT with HISTORICAL V2 introduction | Clarify present architecture vs original baseline; link V5 layers |
| docs/CURRENT-CAPABILITY-INDEX.md | CURRENT navigation + HISTORICAL milestone content | Add current V5.10 pointer and qualify historical headings |
| docs/architecture/v5-tenant-access-inventory.json | GENERATED | Regenerate with existing generator when source inventory changes; never hand-author acceptance |
| docs/v5-release-manifest.json | CURRENT machine register | Preserve core acceptance/maintenance distinction |
| Earlier V4/V5 evidence and migration decisions | HISTORICAL | Retain for traceability; no bulk deletion |
| Apparent repeated release summaries | DUPLICATE candidates | Consolidate navigation only after reference audit |
| OBSOLETE / SAFE TO DELETE | None established | No deletion based on age alone |

## Competitive assessment — current public vendor claims

These are feature-positioning comparisons from official pages checked 27 October 2026, not independently tested vendor security, latency or usability. Aaraagate classifications concern inspected repository surfaces, not live acceptance. ADDA also markets AI-enabled community/helpdesk products; AI alone is not an exclusive differentiator.

| Area | Official competitor positioning | Aaraagate classification and next action |
| --- | --- | --- |
| Gate operations | Mygate visitor entry; NoBrokerHood security and domestic-help tracking | Parity in repository breadth; Gap in measured low-bandwidth guard task time and physical pilot acceptance |
| Resident experience | All four offer resident/community workflows | Parity in breadth; Gap in independently observed compact-device and accessibility journeys |
| Staff/workforce | Mygate/NoBrokerHood staff entry and management | Parity in modeled workforce/attendance; prove current-month/6-month evidence and society-worker gate flows |
| Payments/accounting | ADDA emphasizes accounting; NoBrokerHood advertises ledgers, billing and reconciliation | Parity in implemented domain coverage; Gap in provider/live bank and accountant acceptance |
| Services | NoBrokerHood resident services; ApnaComplex vendor tools | Parity plus potential Differentiator in transparent included-work/approval/commercial terms; validate provider operations |
| Amenities | Mygate/NoBrokerHood booking | Parity; retain overlap, deposit, cancellation and no-show safety |
| Complaints | All four advertise complaint/helpdesk handling; ADDA markets AI Desk | Parity; potential Differentiator is auditable cross-domain handoff and measurable resolution improvement |
| Parking | NoBrokerHood vehicle/boom-barrier integrations | Parity in software workflow; Gap in separately gated hardware acceptance; do not build hardware just for parity |
| Community | Notices, documents, polls and communications recur across vendors | Parity; preserve opt-in/privacy and avoid promotional complexity |
| Admin UX | Competitors market broad committee/ERP controls | Gap in field-proven task efficiency; keep shared components and validate role-focused operations |
| Analytics | ERP/accounting/reporting are established offerings | Parity in report breadth; prove accuracy and action usefulness over extra dashboards |
| Privacy/security | Vendor pages describe privacy and role controls | Gap in independent assurance/RLS acceptance; do not rank security from marketing claims |
| Automation | NoBrokerHood advertises auto-assignment and reconciliation | Parity/Gap depending on live provider; preserve explicit financial and risky-action confirmation |
| AI | ADDA publicly describes AI-enabled community/helpdesk products | Potential Differentiator in permission-scoped evidence and controlled actions, not an exclusive feature claim |
| Ads/commerce/hardware breadth | Some vendors expand monetization and integrations | Unnecessary competitor feature unless user demand/business case justifies it |

Sources: https://mygate.com/society-management-system/ ; https://mygate.com/faqs/ ; https://nobrokerhood.com/solutions/nobrokerhood-features ; https://ind.adda.io/ ; https://ind.adda.io/society-management-system ; https://www.apnacomplex.com/common_public/features ; https://www.apnacomplex.com/ . Express routing reference: https://expressjs.com/en/5x/api/ . Marketing claims are not certification evidence.

## Validation register

Before runtime fixes: tracked-secret pattern scan passed across 2,381 tracked paths; hotspot complexity gate passed; 44 stable domain invariants passed; 33 dependency-budget/coverage/catalog-policy tests passed. These Node-only checks ran under the workspace Node 24 and are not substitutes for the pinned application toolchain checks.

Prior protected evidence is recorded in V5.10-HEALTH-HARDENING.md: PR #1525 candidate `c23bf89b8cbfbd94449f002ac5e976d9ee1b33ca`, CI 40156751980, API 2,545 passed / 15 skipped; Resident 606 and Guard 254 full tests; Admin 214 browser cases. These are historical recorded results, not reruns performed by this review. Latest develop SHA only returned dependency automation runs from the queried Actions collection; do not claim a new full application CI result on that SHA.

Batch execution and final evidence will be appended below. The full optimization definition of done remains OPEN while required tenant-policy/provider/hosted/device and candidate CI evidence is missing.

## Batch A — authentication security hardening

Changed: AuthStateStore now verifies OTPs with one Redis Lua operation, preserves the original expiry and atomically consumes success. Memory mode now serializes verification, fixed-window increments and single-use consumption without an await inside the mutation. AuthService rejects non-UUID challenge IDs before constructing a state key. Rate-limit policies normalize the aliases accepted by Express and share one verification bucket across platform, Partner and host-Partner OTP endpoints. Existing challenge JSON and valid UUID-based API responses remain compatible.

Root causes: read/modify/write OTP verification lost updates under concurrency and rewrote the TTL; memory consume/increment also awaited between reading and mutating; policy lookup assumed literal URL equality while the router did not; user-provided challenge suffixes could address the phone issuance-counter namespace.

Files: `services/api/src/auth/auth-state.store.ts`, `auth.service.ts` and their existing specs; new `auth-state.redis.spec.ts`; `services/api/src/reliability/rate-limit.middleware.ts` and spec; new `rate-limit.http.spec.ts`; `services/api/vitest.risk-coverage.config.ts`; `.github/workflows/ci.yml`. The tenant inventory generator updated only the source digest in its existing JSON register; the human summary counts still match.

Evidence: new OTP/HTTP/policy regressions failed against untouched `50977d7` in a separate worktree (13 failures), then passed against the fix. A separate malformed-key regression also checks that no state lookup occurs. Real Redis 7 tests use two independent API state-store connections and cover 30 simultaneous successful/wrong/mixed checks, exhaustion, expiry retention and last-valid-attempt semantics. The dedicated `AUTH_TEST_REDIS_URL` selects only disposable test Redis; CI supplies its existing Redis service and requires these regressions before broad API regression and within risk coverage. It does not change production REDIS_URL or activate memory fallback in production.

Security impact: closes the observed OTP verification/expiry, state-key suffix and rate-policy bypass defects in this branch. General tenant isolation/RBAC and live provider assurance are not certified by this change. Regression risk: medium because authentication state is shared by clients; valid server-issued challenges retain their format and existing sessions/selection grants retain their interfaces. Redis must allow EVAL with GET/SET/DEL on authentication challenge keys; the repository already tests Redis 7. An unavailable or unauthorized Redis script fails closed rather than replaying an uncertain verification.

Performance impact: OTP verification becomes one Redis script call instead of separate read/write/consume calls; memory rate windows match Redis fixed-window behavior. This is a reduction in command count, not a measured end-to-end latency claim. No schema/data migration, business permission, theme, owner/tenant notification or payment rule changes. Files removed: none.

## Batch B — authoritative documentation navigation

Changed README, architecture overview and capability index to point to existing V5.10 evidence and the separate core V5 acceptance register. The architecture overview now states the actual five Resident tabs and keeps Billing/Staff/Amenities/Helpdesk contextual actions. Versioned histories remain intact and explicitly historical.

Root cause: current architecture/capability entry points accumulated versioned release narratives while their top-level current-state labels lagged. Regression risk: low; documentation/navigation only. Security/performance impact: no runtime effect; tenant enforcement remains visibly open. Files removed: none.

## Batch C — validation checkpoint

Pinned toolchain: Node 22.22.2 / pnpm 10.15.0. Frozen install completed with no package manifest or lockfile changes. Final runtime source was built before the broad API run; source-only discovery avoided executing generated dist specs.

| Check | Result in this review |
| --- | --- |
| Full API suite, real Redis available to dedicated tests | 2,450 passed; 137 skipped; 454 spec files discovered |
| Expanded selected-risk suite | 195 passed; no skips with disposable Redis |
| Selected-risk coverage | 82.86% lines, 68.70% branches across 13 instrumented runtime files; all existing and new floors pass |
| AuthStateStore risk coverage | 100% lines, 95.77% branches; Redis Lua semantics additionally tested by the real Redis regressions |
| AuthService risk coverage | 97.29% lines, 92.85% branches |
| RateLimitMiddleware risk coverage | 94.64% lines, 81.48% branches |
| Workspace lint and typecheck | Passed; API checks repeated after final authentication edit |
| API build and Admin production build | Passed |
| Admin regression groups | Passed, including the shared request/session tests; no new browser/device execution locally |
| Prisma schema validation | Passed; no migration/schema edits |
| Runtime PostgreSQL parameter contracts | Passed |
| Stable domain invariants and complexity boundaries | 44 invariant checks and hotspot gate passed |
| Catalog/index/coverage/dependency-budget unit tests | 35 passed |
| Dependency audit and repository dependency risk gate | Zero info/low/moderate/high/critical advisories; complete pinned-tool audit and risk gate passed |
| Tenant access inventory | Regenerated; source digest updated, human summary remains synchronized; 287 tables, 218 migrations, zero migration policy signals |
| Tracked-source secret pattern scan | Passed; does not establish full historical secret absence |
| Diff whitespace and manifest/lockfile drift | Checked before commit; no dependency declaration/lockfile change and no deleted paths |

The 137 skipped API cases require database/acceptance fixtures unavailable to the local run. No successful PostgreSQL migration replay or hosted runtime-role/RLS acceptance is claimed locally. Flutter, native Android and authenticated browser/device acceptance must come from protected candidate CI and the independent acceptance matrix, not the earlier V5.10 counts. Overlapping risk and full-suite tests must not be summed as unique tests.

## Backlog disposition at this checkpoint

H27-01/H27-02: implemented and locally verified, pending protected candidate CI. H27-05: current-state navigation reconciled; the wider historical documentation audit remains open. H27-08: OTP/rate surfaces added to behavioral and risk coverage; broader domain selection remains ongoing. H27-10: pinned toolchain used. H27-12: fresh dependency audit passed; candidate CI pending. H27-03/H27-04/H27-07/H27-09/H27-11/H27-13 remain open under their stated prerequisites. H27-06 remains RETAIN, not deleted.

Next action: submit one related security/documentation commit through the protected develop PR path; require application/native/PostgreSQL CI. Continue the existing staged tenant-policy rollout with a real non-owner runtime role and exact-candidate negatives before any database-enforcement claim. Provider, device and pilot acceptance remain separate work, not waived requirements. Main/staging promotion is excluded from this batch.

## Before versus this checkpoint — not final optimization completion

These remain judgment scores with the same evidence limits as the initial assessment. Gains reflect the concrete local fixes and documentation correction; there is no claimed measured performance or competitive gain.

| Dimension | Before | Current checkpoint |
| --- | ---: | ---: |
| Architecture | 8.0 | 8.0 |
| Code quality | 7.8 | 7.9 |
| Maintainability | 7.4 | 7.5 |
| Security | 7.0 | 7.4 |
| Performance | 7.0 | 7.0 |
| Testability | 8.2 | 8.4 |
| UX consistency | 7.5 | 7.5 |
| Documentation | 6.8 | 7.4 |
| Competitive position | 7.5 | 7.5 |
| Overall health | 7.5 | 7.6 |

Definition of done: **NOT MET for the complete optimization program**. This is a completed local security/documentation batch and a prioritized, evidence-limited health assessment. Open High assurance gaps, skipped database acceptance, protected CI and independent operational acceptance prevent a completion or production-readiness claim.


## Next implementation batch — H27-03 checkout and statement scope

See [billing tenant-context conversion](architecture/BILLING-TENANT-CONTEXT-2026-10-27.md) for transaction changes, the duplicate-query deletion ledger, dedicated non-owner RLS fixture, validation and remaining callback/read/job scope. H27-03 remains partial until the complete staged rollout and hosted acceptance pass. Earlier checkpoint tables retain their historical assessment context; PR #1527 closed H27-01/H27-02 with protected CI.


## H27-03 follow-through — billing reads and webhook recovery

[Billing reads, issuance and webhook context](architecture/BILLING-READ-WEBHOOK-CONTEXT-2026-10-27.md) records scoped reads, preferences, invoice/outbox transactions, receipt persistence/replay and post-rollback processing failure evidence. It retains the explicit global resolver/reconciliation/job/hosted activation backlog; H27-03 is not fully closed.


## H27-03 follow-through — reconciliation scope

[Reconciliation tenant context](architecture/RECONCILIATION-TENANT-CONTEXT-2026-10-27.md) records scoped case/operation lifecycle and metrics, atomic resolution response, expanded risk coverage and isolated-policy acceptance. Global runner claims, callback order resolution and hosted activation remain open; H27-03/H27-08 remain partial.


## H27-14 — Gateway refund integrity

[Gateway refund integrity](architecture/GATEWAY-REFUND-INTEGRITY-2026-10-27.md) records the worker/adapter precision defect, pre-provider validation, preserved retry identity, tests and deletion ledger. This financial-boundary correction precedes global discovery refactoring. H27-03/H27-04 remain partial; no production policy/provider acceptance is implied.


## H27-03 follow-through — signed callback resolver (28 October)

[Callback routing capability](architecture/PAYMENT-CALLBACK-RESOLVER-2026-10-28.md) records the exact-order two-identifier function, migration, deployment grant prerequisites and restricted-owner RLS/public callback acceptance. Runtime deployment must provision reviewed ownership and EXECUTE before this application update. Global worker claims and hosted policy acceptance remain open.
