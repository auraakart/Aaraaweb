# Aaraagate V4.88 — Quality Convergence (Excluding Productionization)

Baseline: `develop` at `b2fc772d52b9f92c535c99f26c0af09852c6e7d8` (V4.87.0 plus release-delay safeguards). The V4.87.0 staging-to-main PR #1135 is independent of this development cycle and requires the existing reviewer/manual-main governance.

## Goal and score discipline

Target a defendable **8.5+/10** quality score without treating production infrastructure, real providers, physical devices, hardware integrations or live-pilot validation as completed. Score only reproducible repository and CI evidence. The V4.20 historic 9.13 score is not a substitute for a current, outcome-based re-score.

## Ordered slices

1. **V4.88.1 — Shared HTTP reliability.** Bound Resident REST operations end-to-end with a configurable deadline. Bound SSE connection handshake while allowing healthy streams to remain open. On write timeouts, report unknown server outcome; do not encourage blind replay. Add transport regression tests for stalled reads/writes, authenticated success, SSE liveness and failed handshakes. Review other Guard/Admin client boundaries in a later slice.
2. **V4.88.2 — Accessibility and device-shape regression.** Verify 320px/200% text, TalkBack semantics, touch targets, keyboard, dark/light mode and reduced motion for critical Resident/Guard screens. Actual physical-device acceptance remains pending.
3. **V4.88.3 — Cross-role workflow and security evidence.** Recheck current-occupant gate notification, owner/tenant dues notifications, approval permissions, tenant isolation, immutable finance/payment confirmation, visitor replay and offline recovery. Reuse existing tests; add only missing contracts.
4. **V4.88.4 — Coverage and performance floors.** Establish measured API/Flutter/Admin coverage where CI can collect it, identify high-risk low-coverage components, fix material gaps, and verify performance thresholds against real CI artifacts. Do not claim arbitrary percentages.
5. **V4.88.5 — Consolidated evidence and scoring.** Perform full CI, affected-module regression, dependency/security checks, smoke and release-evidence reconciliation. Re-score each category against available evidence. If a score is still below 8.5, document precise remaining gaps instead of inflating the rating.

## First slice implementation and acceptance

- A 20-second default REST deadline now covers opening, sending and consuming each response. The constructor accepts a shorter duration for isolated tests.
- A `408` client-side `ApiException` signals an expired deadline, not proof that a POST/PUT/PATCH was rolled back. Mutations require status reconciliation before any retry.
- The SSE handshake is deadline-bound; ongoing event delivery is not terminated simply because a quiet stream exceeds 20 seconds.
- Existing authentication, method semantics, JSON decoding and HTTP error mappings remain unchanged.
- Validation: `cd apps/resident && flutter test test/api_client_deadline_test.dart`; then Resident regression and relevant CI. V4.88.1 merged as PR #1140 with successful CI run 37824470430. Later changes require their own candidate validation.
- Scope exclusion: production deployment, provider activations, physical microphone/TalkBack evidence, iOS and hardware.

## Release governance

Development changes target `develop` through review/CI. Minimize `staging` promotions and do not merge `main` without a fresh explicit user approval. No score increase or milestone completion is claimed on the basis of code changes alone.

## V4.88.2–V4.88.5 consolidated candidate

Candidate identity: Root/API/Admin `4.88.5`; Resident/Guard `4.88.5+48805`.
Changes build on develop `7a3161e3c7013484936ffdca496746e456991e0e`.
One consolidated develop PR avoids per-slice staging or main commits.

| Slice | Implemented evidence | Acceptance still required |
|---|---|---|
| V4.88.2 | App-shell device text scaling preserved, Easy Mode minimum, sign-in footer reflow; Guard action exposes a single labelled semantic action; 320px/200% light/dark keyboard regression | Exact-candidate Flutter checks; physical TalkBack, voice and two-device acceptance |
| V4.88.3 | Shared Guard operations transport, bounded OTP/web requests, no automatic uncertain-write replay; Resident disposal/late-connection cancellation; revoked-owner payment recovery and rolled-back tenant-context isolation; real Admin finance confirmation, denial and read-only journeys | Exact-candidate mobile, browser and migrated PostgreSQL suites |
| V4.88.4 | Six sampled API coverage floors raised against prior measured coverage; historical gates enforce minimums; additional authenticated finance-readiness workload against 100k payment fixture | Candidate API/Resident/Guard coverage and performance artifacts; these are sampled regression floors, not whole-codebase coverage or production capacity |
| V4.88.5 | Synchronized release identity; consolidated acceptance matrix and fixed scoring rubric below | Full required CI and evidence review before integration/promotion; no automatic score increase |

### Fixed assessment rubric

| Dimension | Weight | Evidence required |
|---|---:|---|
| Workflow and financial integrity | 25% | Daily journeys, duplicate/concurrent writes, reconciliation, reversal and migration fixtures |
| Reliability and recovery | 20% | Bounded requests, safe replay identities, cancellation, stale-result rejection, notification recovery |
| Security and tenant isolation | 20% | Cross-society denial, revoked authority, ownership transitions and background-work boundaries |
| Resident, Guard and Admin usability | 15% | Automated accessibility plus explicitly recorded physical-device acceptance |
| Maintainability | 10% | Shared transport, bounded responsibilities and current guidance |
| Performance evidence | 10% | Repeatable representative workloads with predefined budgets |

Acceptance: weighted score >=8.5, no dimension below 8.0, no unresolved critical/high in-scope findings and passing required candidate checks. The historic 9+ rating is not comparable without the same scope and evidence. No numeric re-score is assigned while candidate validation or usability acceptance is incomplete.

### Regression evidence map

- Resident: `api_client_deadline_test.dart` retains V4.88.1 SSE handshake/liveness tests and adds stalled-body, single-send, recovery and closed-client cases; `app_text_scaling_test.dart` exercises the actual app shell.
- Guard: `api_deadline_test.dart` verifies original idempotency headers and transport classification; existing queue/controller tests remain authoritative for offline replay. `guard_accessibility_test.dart` covers the shared action's semantic, touch and keyboard contract.
- Admin: `finance-safety.spec.mjs` mounts the actual finance page with deterministic API fixtures; this proves UI confirmation/denial behavior, not database authorization. API PostgreSQL tests provide separate server-side evidence.
- API: `payment-integrity.postgres.spec.ts` adds revoked-owner recovery denial; `prisma.tenant-context.integration.spec.ts` adds rollback isolation. Existing notification, gate replay, accounting reversal and migration suites are reused without claiming that fixtures replace live integrations.
- Performance: `performance-smoke.mjs` adds authenticated operational readiness beside treasurer control, both with 24 measured requests, concurrency 4, p95 <=2500ms, throughput >=1.5 requests/s and zero failures. This broadens finance-read coverage; mixed Resident/Guard peak-load certification remains unproven.

### Current validation state

The 12 local JavaScript transport, coverage-contract and benchmark-helper tests pass under Node 22.23.3. Local API tests: 1,402 passed and 31 database-dependent cases skipped. API/Admin typechecking, API lint and Admin UI lint pass.

Initial candidate `8badf9fcd8d25d3420e909c367dbf6132c17c91e`, CI [37875584884](https://github.com/auraakart/Aaraaweb/actions/runs/37875584884):

- API: all 1,433 tests passed across 340 files, including migrated PostgreSQL cases; 181 migrations applied. Risk suite: 58 tests passed; sampled line coverage 70.29%, branch coverage 50.23%; all six file floors passed.
- Admin: all 31 browser cases passed, plus source regressions, lint, typecheck and build.
- Dependency security: passed, zero reported vulnerabilities.
- All five benchmark scenarios passed with zero request failures. Finance-readiness p95 34.83ms; treasurer-control p95 889.15ms on the synthetic 100k-payment ledger. Runner-specific measurements are regression evidence only.
- Resident changed tests: eight transport cases passed; the app-shell test caught the sign-in footer overflowing at 200% text. The footer now wraps within available width, and the test uses a 320px viewport. The initial run is therefore **not** an accepted full candidate.

Final-candidate required checks and merge status are tracked in [PR #1141](https://github.com/auraakart/Aaraaweb/pull/1141). All required checks must pass on the final head after the footer correction; partial initial success does not waive mobile acceptance. Production deployment, live-provider certification, physical hardware and adoption remain excluded; physical accessibility acceptance remains pending and is not silently marked complete.
