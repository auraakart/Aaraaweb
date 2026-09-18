# Aaraagate V4.12 Completion Evidence

Date: 2026-09-18  
Scope: Repository development only  
Baseline: `3a551544a270cebb1899865ede01cccc83f88eb7`  
Functional closure before final reconciliation: `9587eb1521d3940ecc49d8557a7f4dce8c574901`

## Merged development evidence

- #656 — Amenity attendance lifecycle — `e1f032e979518060a851d078803de1b51eb45f0b`
- #657 — Deterministic amenity waitlist promotion — `cbb3697b08c867d33e0f4f30c0f4c88528ba1df3`
- #658 — Read-only amenity operations analytics — `087187bdd24e1c73175942ffb1475d72243a6037`
- #659 — Explicit Resident amenity waitlist UX — `9587eb1521d3940ecc49d8557a7f4dce8c574901`

## Capability evidence

### Attendance lifecycle
- Booking states extend through `CHECKED_IN`, `COMPLETED` and `NO_SHOW`.
- Authorized amenity managers execute attendance transitions.
- `checkInOpenMinutesBefore` and `noShowGraceMinutes` are configurable booking rules.
- Attendance actor, note and timestamps preserve operational evidence.
- No financial penalty is posted from a no-show.

### Waitlist and promotion
- Waitlist records are society, amenity, unit, user and exact-window scoped.
- Joining is rejected while normal booking capacity remains available.
- Active duplicates/property-overlap conflicts are blocked.
- Cancellation/rejection/revocation can release future capacity.
- Promotion selects the oldest eligible waiting entry under advisory locking and fresh property/booking eligibility checks.
- Queue priority is deterministic; no AI score, paid priority or hidden rank is used.

### Operations analytics
- Admin receives a tenant-scoped 30-day snapshot of booking and attendance outcomes.
- Metrics include completed/no-show/cancellation states plus current waiting and promoted counts.
- Per-amenity demand signals combine observed bookings and waitlist joins.
- The response contract is `predictive:false`; no forecast or automatic allocation is claimed.
- Analytics are read-only.

### Resident experience
- Amenity screen loads bookings and waitlist state for the currently selected property.
- Active waiting entries display queue position and can be explicitly left.
- Promoted/cancelled history is visible without creating another booking.
- A known server-side capacity conflict offers an explicit “Join waitlist” choice.
- No waitlist entry is created before user consent, and the joined entry uses the exact amenity/property/time window from the failed booking attempt.

## Quality evidence

The four functional slices were merged only after their exact-head quality gates were green. Evidence includes clean migration application, API lint/typecheck/tests/build/production-readiness, Flutter Resident/Guard analysis and tests, Admin validation, dependency security and applicable cross-role, performance, security/privacy and pilot contracts. Two test failures encountered during development were narrow fixture/assertion-contract issues and were corrected without weakening production behavior or gates.

## External evidence still pending
- real-society amenity configuration and policy acceptance;
- representative Resident/Admin device/browser usability;
- observed no-show, utilization and waitlist-conversion outcomes;
- physical amenity access/check-in hardware;
- real notification/provider delivery for amenity events;
- production hosting and operational monitoring evidence.

V4.12 therefore closes repository depth only; it does not claim field or production completion.
