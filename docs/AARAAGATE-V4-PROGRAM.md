# Aaraagate V4 Development Program

Version: 4.0 execution baseline  
Date: 2026-09-18  
Status: Approved mastermind execution plan  
Baseline branch: `develop`  
Baseline commit before V4 planning: `62172784c824cd60273a146b900bf338c96c8c96`

## Mission
Aaraagate V4 is the competitive-hardening release. The objective is to move the product from the current approximately 7.9/10 competitive implementation score to a demonstrable score above 8.5/10 without quality compromise, feature sprawl, or unnecessary release churn.

V4 is not a rewrite and not a broad new-feature expansion. It deepens the capabilities already present in V3, closes the highest-value Indian-market gaps, improves reliability and migration readiness, and turns Aaraagate's differentiators into production-grade advantages.

Target product position:

**Aaraagate = AI-native operating system for Indian communities and homes — fast gate operations, automated RWA finance, trusted household services, and one identity across multiple properties.**

## V4 success target
V4 is complete only when all release-critical evidence supports a competitive score of at least 8.5/10.

Target score profile:
- Gate and security: >= 9.0
- Resident experience/features: >= 9.0
- Accounting/billing/ERP: >= 8.6
- Administration/governance: >= 8.7
- Amenities/community/services: >= 8.8
- Architecture/platform design: >= 9.0
- Differentiation potential: >= 9.3
- Production/field readiness: >= 8.0 before pilot, with explicit remaining real-world dependencies documented
- Overall competitive score: >= 8.6

The score must be based on implemented, tested and evidenced capability. Planned-only features do not count.

## V4 non-negotiable engineering principles
1. `develop` is the only active integration branch during V4.
2. `staging` and `main` are not promoted during normal V4 development. They are updated only after V4 completion and release-gate approval.
3. No repeated low-value release promotions.
4. No feature is accepted because a screen or endpoint merely exists; critical workflows require end-to-end verification.
5. Speed comes from reduced coordination overhead, smaller bounded-context scans, batched implementation and targeted tests, never from skipping quality gates.
6. Existing V3 capabilities must not regress.
7. External dependencies such as real payment credentials, hardware, push credentials or WhatsApp approvals must use explicit interfaces, simulators or sandboxes until production credentials are available.
8. Production paths must not silently fall back to demo/mock behavior.
9. Tenant isolation, property context, RBAC/ABAC, auditability and idempotency remain architectural invariants.
10. Every milestone must leave `develop` buildable and testable.

## Anti-delay execution protocol
The V3 delay pattern must not repeat. V4 uses the following operating rules.

### Repository-reading discipline
- Inspect the current `develop` head, active PRs and CI once at the start of each milestone.
- Read only the bounded contexts needed for that milestone.
- Do not repeatedly rescan the whole repository unless a cross-cutting regression requires it.
- Reuse documented architecture, contracts and previous audit evidence instead of rediscovering them.

### Branch and commit discipline
- Use one feature branch per V4 milestone or one substantial milestone slice.
- Batch related code changes before committing.
- Avoid cosmetic, checkpoint and documentation-only commits during implementation unless the documentation is itself a milestone deliverable.
- Prefer one coherent implementation commit plus narrowly scoped corrective commits when needed.
- Merge only green milestone work into `develop`.
- Do not touch `staging` or `main` until V4 release consolidation.

### Test discipline
- Run targeted unit/contract tests during coding.
- Run affected application build/lint checks before milestone PR completion.
- Run cross-module regression at milestone boundaries.
- Run the complete V4 release suite once, at final release consolidation, rather than repeatedly after every small change.

### Blocker discipline
- If an external dependency is unavailable, implement and test the abstraction/simulator and record the external proof as deferred.
- Do not stop unrelated V4 work waiting for provider credentials or hardware.
- A blocked sub-item does not block the entire milestone when the architecture and tests can proceed safely without it.

## Step-by-step V4 development plan

## V4.0 — Baseline lock and scorecard
### Goal
Establish an exact V4 starting point and prevent scope drift.

### Work
- Freeze the V4 feature/quality scope against the current `develop` baseline.
- Verify current critical-flow tests and builds.
- Establish the V4 competitive scorecard and evidence checklist.
- Identify P0/P1 technical debt that can invalidate later milestone evidence.
- Map each score gap to one V4 milestone.

### Exit criteria
- `develop` baseline is green or known failures are explicitly assigned.
- Competitive scorecard is documented.
- No unowned P0/P1 baseline defect.

## V4.1 — RWA Finance and Reconciliation Hardening
### Goal
Close the largest functional gap against mature Indian society ERP products.

### Scope
- Recurring maintenance generation and configurable charge rules.
- Opening balances and migration-safe ledger initialization.
- Immutable unit/party ledger events.
- Arrears, late fee/interest, waiver approval and adjustment workflows.
- Advance/unapplied credits and partial allocation.
- Debit/credit notes.
- Payment idempotency and duplicate protection.
- Gateway webhook replay/retry handling.
- Refund/reversal/dispute references.
- Bank statement import and bank reconciliation.
- Vendor bills, expense approval and payment status.
- Budget versus actual.
- Corpus/sinking/reserve fund tracking.
- Trial balance, income/expenditure and balance-sheet outputs.
- Defaulter ageing and collection dashboard.
- Accountant-friendly CSV/Excel/Tally-compatible export baseline.

### Quality gates
- Ledger invariants and balanced-posting tests.
- Duplicate webhook/payment tests.
- Reconciliation mismatch tests.
- Finance-role segregation tests.
- Resident dues, receipt and admin finance end-to-end tests.

### Target score impact
Accounting/ERP from ~7.4 toward >=8.6.

## V4.2 — Guard Operations 3.0: Offline, Multilingual and Fast
### Goal
Make the guard experience competitive with the strongest Indian incumbents.

### Scope
- True offline-first event queue for high-frequency gate actions.
- Deterministic sync, retry, deduplication and conflict handling.
- Resident/unit lookup optimized for low-end devices.
- Repeat visitor/provider fast paths.
- Delivery quick actions.
- Overstay and exit handling.
- Material gate pass and move-in/move-out handling.
- Shift handover and supervisor visibility.
- Patrol/checkpoint continuity.
- Incident capture with attachment references.
- Regional-language baseline: English, Hindi and Tamil first.
- Architecture ready for Telugu, Kannada, Malayalam, Marathi, Bengali and Gujarati.
- Optional voice-assisted guard input for selected workflows.
- Large touch targets, strong contrast and low-literacy-friendly labels/icons.

### Performance targets
- Routine pre-approved visitor processing: <=5 seconds under normal device/network conditions.
- Routine high-frequency action: <=3 primary taps where practical.
- No data loss after temporary network loss.

### Quality gates
- Offline/online transition tests.
- Duplicate-sync tests.
- Stale-state/conflict tests.
- Low-connectivity tests.
- Localization completeness tests.
- Guard app build/performance smoke checks.

### Target score impact
Gate/security from ~8.4 toward >=9.0.

## V4.3 — Competitor Migration and Society Onboarding Engine
### Goal
Remove switching friction for societies moving from MyGate, NoBrokerHood, ADDA, ApnaComplex or spreadsheets.

### Scope
- Import templates for societies, buildings, units, residents, owners/tenants, vehicles, parking, staff/workforce, vendors and opening finance balances.
- Generic CSV/Excel ingestion pipeline.
- Mapping/normalization layer rather than competitor-specific hard coupling.
- Validation report before import.
- Dry-run/preview mode.
- Duplicate detection.
- Referential-integrity validation.
- Reconciliation summary.
- Import audit log.
- Rollback/undo strategy for failed onboarding batches.
- Admin onboarding checklist and progress dashboard.
- Migration evidence export.

### Quality gates
- Invalid-data rejection tests.
- Duplicate-data tests.
- Large-import performance tests.
- Rollback tests.
- Finance opening-balance reconciliation tests.
- Cross-society isolation tests.

### Target score impact
Major improvement in real-world adoption and production readiness.

## V4.4 — Production Reliability and Resilience
### Goal
Convert broad feature coverage into dependable operational behavior.

### Scope
- Retry/backoff policy audit for external integrations.
- Notification retry and deduplication.
- Push-device lifecycle hardening.
- Payment webhook replay protection.
- Background-job idempotency.
- Concurrent amenity-booking protection.
- Double-submit protection for critical mutating actions.
- Session/device revocation verification.
- Object/file authorization checks.
- Backup/restore evidence refresh.
- Rollback procedure refresh.
- Observability correlation IDs and critical metrics.
- Error-budget style dashboards for API/queue/integration failures.
- Rate-limit and abuse controls on sensitive/public-facing endpoints.

### Quality gates
- Failure-injection tests for selected integrations.
- Concurrency tests.
- Retry/idempotency contract tests.
- Backup/restore drill evidence.
- No unresolved P0/P1 reliability defect.

### Target score impact
Production readiness from ~6.3 toward >=7.7 before pilot evidence.

## V4.5 — Privacy, Security and Trust Controls
### Goal
Make privacy/security visible, auditable and suitable for enterprise/RWA adoption.

### Scope
- Resident consent/preference surfaces where applicable.
- Data export workflow.
- Retention/deletion workflow design and enforcement points.
- Admin-access audit visibility.
- Permission-negative test expansion.
- Session/token revocation audit.
- Sensitive-data logging review and redaction.
- File/object authorization review.
- Tenant/property-context enforcement review across new V4 modules.
- Security event reporting baseline.
- DPDP-oriented operational documentation without overstating legal certification.

### Quality gates
- Tenant isolation tests.
- Role-negative tests.
- Sensitive-data logging tests.
- Export/deletion authorization tests.
- Audit completeness checks for privileged actions.

## V4.6 — AI Operations 2.0
### Goal
Turn the existing AI layer into a differentiated, permission-aware operations assistant rather than a generic chatbot.

### Admin/committee use cases
- Show overdue maintenance above a chosen amount.
- Explain collection and ageing trends from authoritative finance data.
- Identify helpdesk SLA breaches.
- Summarize security incidents for a selected period.
- Draft notices in supported languages for human approval.
- Summarize facility/vendor work and upcoming maintenance.
- Explain operational dashboards.

### Resident use cases
- Explain maintenance dues and receipts.
- Find payment/booking/complaint status.
- Start visitor pre-approval through normal APIs.
- Create complaint drafts from natural language/voice.
- Find amenities/services and initiate approved workflows.

### Safety rules
- No direct database mutation by AI.
- All mutations use normal authenticated APIs.
- High-impact mutations require explicit confirmation.
- Tenant/society/property context is mandatory.
- AI output must not bypass entitlements or role checks.
- Relevant AI actions are auditable.

### Quality gates
- Tenant/permission negative tests.
- Tool/action allow-list tests.
- Confirmation tests for high-impact actions.
- Hallucination-resistant grounding checks for finance and operational answers.

### Target score impact
Differentiation remains >=9.3 while increasing usable product value.

## V4.7 — Vendor-Neutral Access Integration Hardening
### Goal
Reduce sales friction by supporting multiple physical-access ecosystems safely.

### Scope
- Stable adapter contract for access devices.
- ANPR adapter contract/simulator.
- Boom-barrier adapter contract/simulator.
- RFID/FASTag adapter contract/simulator.
- Device/site mapping.
- Device health/status.
- Idempotent access commands.
- Event-ingestion deduplication.
- Manual fallback when integrations fail.
- Compatibility path for biometric, smart-lock, intercom/CCTV, lift-access and EV integrations.

### Quality gates
- At least three simulator adapters pass common contract tests.
- Device/integration failure cannot block manual gate operations.
- Audit trail preserved for automated access decisions/actions.

## V4.8 — Outcome Analytics, Adoption and Operational UX
### Goal
Measure whether Aaraagate improves society operations, not merely whether screens are visited.

### KPIs
- Maintenance collection percentage.
- Outstanding ageing.
- Reconciliation exceptions.
- Complaint SLA compliance.
- Gate processing time.
- Visitor approval turnaround.
- Guard offline-sync failures.
- Amenity utilization.
- Notification delivery success.
- External-service discovery-to-booking conversion.
- Service completion/cancellation rate.
- Resident activation/adoption.
- Multi-property switching usage.
- Independent-home services engagement.

### UX work
- Ensure the V3 premium UI redesign is consistently applied to all V4 flows.
- Remove heavy table/card patterns where they reduce mobile usability.
- Improve empty/error/retry states.
- Validate accessibility, font scaling and screen-reader basics.
- Ensure marketplace promotions do not overwhelm trusted society/security workflows.

### Quality gates
- KPI definitions derive from authoritative domain events.
- No analytics event contains unnecessary sensitive data.
- High-frequency flows pass UX regression review.

## V4.9 — Full V4 Regression, Competitive Re-score and Release Consolidation
### Goal
Prove V4 as one integrated release before touching `staging` or `main`.

### Sequence
1. Freeze V4 feature development on `develop`.
2. Run full API/unit/contract suites.
3. Build resident, guard/security, admin and web applications.
4. Run tenant-isolation and permission-negative suites.
5. Run finance reconciliation/ledger suite.
6. Run guard offline/sync/localization suite.
7. Run migration/import/rollback suite.
8. Run reliability/idempotency/concurrency suite.
9. Refresh backup/restore and rollback evidence.
10. Perform V4 competitive re-score using implemented evidence only.
11. Resolve all release-blocking P0/P1 defects on `develop`.
12. Consolidate release documentation.
13. Promote the completed V4 baseline to `staging` once.
14. Run staging smoke/UAT and production-like external-integration checks.
15. If staging is accepted, perform one deliberate `main` promotion for V4.

### Release criteria
- Overall competitive score >=8.6.
- No unresolved P0/P1 release blocker.
- Critical applications build successfully.
- Critical cross-role flows pass.
- Finance invariants/reconciliation tests pass.
- Guard offline/sync tests pass.
- Migration dry-run and rollback tests pass.
- Tenant isolation and privileged-action audit tests pass.
- Backup/restore evidence is current.
- Remaining production-only external dependencies are explicitly documented.

## Execution order and dependency rationale
The order is deliberate:
1. Finance first because it is the largest current competitor gap and migration requires a stable financial model.
2. Guard hardening second because it is the highest-frequency operational workflow and a visible competitive benchmark.
3. Migration third because it depends on stable society, resident and finance schemas.
4. Reliability fourth because all expanded V4 flows must then be hardened together.
5. Privacy/security fifth because new migration and reliability paths expand the attack/data surface.
6. AI sixth so it is built over stable authoritative V4 finance/operations data rather than provisional contracts.
7. Access integration seventh to harden device-neutral deployment without blocking core guard work.
8. Analytics/UX eighth so final KPIs reflect the completed domain model.
9. Release consolidation last, with a single staging promotion and a single main release promotion.

## Commit and PR policy for V4
- No staging or main commits during V4 implementation.
- One active milestone branch at a time unless an isolated urgent fix is required.
- Prefer one PR per milestone; split only when the change set becomes unsafe to review as one unit.
- Do not create PRs merely for checkpoints.
- Do not create commits for generated status updates.
- Documentation changes should accompany the milestone they describe whenever possible.
- A milestone PR must include code, tests and applicable documentation together.
- Corrective commits after review/CI are allowed but must stay narrowly scoped.
- Squash/rebase policy should preserve a clear milestone history without noisy micro-commits.

## Mastermind operating checklist for every V4 milestone
1. Inspect current `develop` head, active PRs and CI.
2. Confirm milestone exit criteria and bounded contexts.
3. Create/reuse the milestone feature branch.
4. Implement the highest-risk contracts first.
5. Add/update tests with the implementation, not afterward.
6. Batch related code and documentation changes.
7. Run targeted tests during coding.
8. Perform affected-app build/lint checks.
9. Review security, tenant isolation, idempotency and error paths.
10. Fix failures narrowly.
11. Run milestone regression.
12. Merge only when green.
13. Update the V4 evidence/status documentation in the milestone batch.
14. Move directly to the next milestone without staging/main promotion.

## Deferred external proofs that must not stall repository development
- Real payment-gateway merchant credentials/webhooks.
- Real FCM/APNs production credentials and heterogeneous device fleet behavior.
- Approved SMS/WhatsApp provider templates.
- Real ANPR/RFID/boom-barrier hardware/vendor protocols.
- Production cloud DNS/TLS/secrets and managed infrastructure.
- Representative live society data and committee policies.
- Independent accounting/legal validation for society-specific statutory treatment.
- Real-world pilot acceptance.

For each unavailable dependency, V4 must provide a tested adapter, simulator, fixture or sandbox plus a clear production verification checklist.

## Documentation deliverables
During V4, update or add documentation only when it materially improves execution or release evidence. Expected documentation includes:
- this V4 program;
- finance/reconciliation operational notes where contracts change;
- migration/onboarding guide;
- guard offline/sync operational notes;
- privacy/security operational notes;
- AI action/safety contract documentation;
- integration adapter contract notes;
- V4 release evidence and final competitive scorecard.

Avoid duplicating information already maintained by V2/V3 documents unless V4 changes the contract or replaces the process.

## Definition of V4 done
Aaraagate V4 is done when the repository demonstrates, through code and evidence, that the platform has moved from broad feature coverage to competitive operational depth: RWA-grade finance, fast/offline multilingual guard workflows, low-friction society migration, resilient integrations, visible privacy/security controls, useful permission-aware AI, vendor-neutral access integration and measurable operational outcomes.

Only after this definition is met should `develop` be promoted once to `staging`, validated, and then promoted once to `main` as the V4 release.
