# Aaraagate V4.84 — Field Operations & Pilot Readiness

Date: 2026-10-07

## Objective

V4.84 converts Aaraagate's broad repository capability into a tighter, pilot-oriented operating system. The cycle does not claim hosted production readiness, live-provider certification, physical gate-device acceptance, signed-store release or field-pilot acceptance.

The six planned slices are:

1. Gate Operations Closure
2. Finance Exception Completion
3. Copilot Controlled Actions 2.0
4. Resident Adoption Closure
5. Admin Operational Command Centre
6. Pilot/Test Evidence Closure

## Slice 1 — Gate Operations Closure

Status: implemented on the V4.84 feature branch; protected develop validation remains required before integration.

### Changes

- Guard command summary now exposes active checked-in entries and the age of the oldest active entry.
- Waiting resident approvals older than ten minutes become an explicit operational follow-up signal.
- Open shift handovers expose the age of the oldest unacknowledged handover.
- Open critical incidents expose the age of the oldest critical incident for supervisor continuity evidence.
- Guard Field Operations displays live inside-now volume, oldest-active age, ageing handover attention and resident-approval follow-up chips.
- Existing four-hour overstay escalation, watchlist screening, patrol evidence, incident workflow and handover acknowledgement remain authoritative.

### Safety boundaries

- Ten-minute approval ageing is an attention threshold only; it does not expire, approve, deny or mutate an access request.
- Active-entry age is operational context only. The existing four-hour overstay threshold remains the escalation threshold.
- No fallback grants access automatically.
- Resident approval, Guard permissions, supervisor review and audit trails remain authoritative.
- All metrics are society-scoped and are derived from existing operational records.

### Slice 1 acceptance criteria

- Ageing pending approvals are visible to Guard without creating a new access authority.
- Active checked-in count and oldest-active age are visible.
- Handover age is visible and a handover older than thirty minutes retains HANDOVER_DUE continuity status.
- Critical incidents older than thirty minutes retain supervisor attention priority.
- Existing command-summary regression tests pass and cover the new fields.
- Guard analysis/tests and API validation must pass before develop integration.

## Remaining V4.84 slices

### Slice 2 — Finance Exception Completion

Partial/excess payments, adjustment/waiver boundaries, duplicate or failed reconciliation, refunds, settlement exceptions, owner/tenant payer authority, receipt correction and close-period evidence.

### Slice 3 — Copilot Controlled Actions 2.0

Add only domain-owned proposal contracts with preview, explicit confirmation, normal authorization and audit. Candidate domains are Facilities assignment/escalation and payment-reminder preparation. No generic autonomous mutation.

### Slice 4 — Resident Adoption Closure

Converge Home/Action Inbox discovery across Insta Services, Resident Directory, Community Circles, staff evidence, Utilities and Resident Requests; remove duplicate entry points and close deep-link/loading/error/offline gaps.

### Slice 5 — Admin Operational Command Centre

Use the current Operations Command Centre as the morning operating surface for ageing exceptions, gate risk, collections, facilities attention, SLA breaches and unresolved Copilot recommendations. Do not create a parallel dashboard.

### Slice 6 — Pilot/Test Evidence Closure

Run cross-role Resident/Guard/Admin journeys, tenant-isolation checks, concurrency/retry tests, notification failure/recovery, Android device evidence and performance regression. Repository completion is not field-pilot acceptance.

## Release policy

Work remains on the V4.84 feature branch until a coherent develop candidate is ready. Develop requires protected CI. Staging receives only the validated exact develop tree. Main remains behind independent review, required checks and fresh owner approval.
