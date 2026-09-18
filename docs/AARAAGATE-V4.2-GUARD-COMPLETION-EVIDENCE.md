# Aaraagate V4.2 Guard Operations 3.0 — Completion Evidence

Date: 2026-09-18
Baseline branch: `develop`
Milestone: V4.2 — Guard Operations 3.0: Offline, Multilingual and Fast

## Completion assessment

V4.2 is functionally complete when this completion batch is merged. Real-device timing remains a pilot/release proof rather than a repository-only claim.

## Scope evidence

### Offline-first high-frequency gate actions
- Guard check-in/check-out actions use a persisted secure offline queue.
- Queue entries preserve idempotency keys across retry.
- Queue state is society and guard-user scoped.
- Temporary transport failures use bounded retry/backoff.
- Conflict, rejected and stale actions are quarantined as review-required instead of replaying indefinitely.
- A 30-day stale boundary prevents unsafe replay of obsolete gate actions.
- Guard Tools exposes queued and review-required counts separately.

### Offline restart and directory continuity
- Gate and occupied-unit directory is cached securely per society + guard user.
- Cache freshness is bounded to 24 hours.
- Offline restart can continue gate/unit lookup from a fresh cache.
- Cross-society and cross-guard cache reuse is rejected.

### Fast paths
- QR remains the primary pre-approved visitor path.
- Delivery and cab quick-arrival actions are available from the main Gate Operations screen.
- Production QUICK route supports provider presets and unit search.
- Recent-arrival presets are securely scoped to society + guard identity, deduplicated and bounded.
- A recent repeat arrival restores destination, subject type and provider/person details in one primary tap; submit is the second primary tap when no field correction is required.
- This satisfies the <=3-primary-tap design target for repeat high-frequency arrivals.

### Field operations
Existing Guard Field Operations covers:
- overstay visibility;
- watchlist visibility;
- material-in/material-out passes;
- move-in/move-out passes;
- patrol checkpoint scans;
- shift handover creation and acknowledgement;
- incident creation and history.

The V4.2 completion batch exposes the existing API `mediaRefs` contract in the Guard incident flow, allowing one uploaded evidence/reference identifier per line and displaying the evidence-reference count on recorded incidents.

### Supervisor visibility
- Offline actions requiring review are explicitly counted separately from retryable queued actions.
- Shift handover supports open-item transfer and incoming-guard acknowledgement.
- Field Operations provides operational exception visibility for overstays, watchlist items, passes and incidents.

V4.2 does not invent a client-side privilege bypass for quarantined actions. Server-authoritative supervisor permissions remain the boundary for supervised operational changes.

### Regional-language baseline
Guard operational localization covers:
- English
- Hindi
- Tamil
- Telugu
- Kannada
- Malayalam
- Marathi
- Bengali

The localization architecture is key-based and extensible; Gujarati remains an additive localization-pack item and is not a blocker for the approved English/Hindi/Tamil-first V4.2 baseline.

## Quality evidence

The V4.2 deterministic-offline PR passed:
- Guard analyze and tests;
- Resident analyze and tests;
- API lint/typecheck/tests/build/readiness;
- Admin validation;
- dependency security;
- Security/Privacy contract;
- Role UAT contract;
- Policy contract;
- Staging Pilot contract;
- Pilot Acceptance contract.

The repeat-arrival PR also passed the same exact-head suite, including focused Flutter tests for current-session history visibility, foreign-session isolation and one-tap preset restoration.

The completion batch must pass the same exact-head suite before merge.

## Performance target interpretation

Repository evidence proves the interaction-path target (<=3 primary taps for the repeat-arrival fast path) and bounds local search/history work.

The V4 program target of <=5 seconds for routine pre-approved visitor processing depends on actual device performance, camera/QR acquisition and network latency. It must therefore be measured on representative low/mid-range Android hardware during V4.9/pilot acceptance. V4.2 does not fabricate a synthetic repository benchmark as field proof.

## V4.2 exit decision

After the completion batch passes exact-head CI:
- functional scope: complete;
- offline/sync/localization quality gates: complete;
- interaction-path target: evidenced;
- real-device <=5-second field timing: explicitly deferred to V4.9/pilot evidence;
- staging/main promotion: not performed.

Next milestone: V4.3 — Competitor Migration and Society Onboarding Engine.
