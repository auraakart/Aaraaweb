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
- Validation: `cd apps/resident && flutter test test/api_client_deadline_test.dart`; then Resident regression and relevant CI. **Tests/CI are pending** until executed by GitHub; this document does not claim completion.
- Scope exclusion: production deployment, provider activations, physical microphone/TalkBack evidence, iOS and hardware.

## Release governance

Development changes target `develop` through review/CI. Minimize `staging` promotions and do not merge `main` without a fresh explicit user approval. No score increase or milestone completion is claimed on the basis of code changes alone.
