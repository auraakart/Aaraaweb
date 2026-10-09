# Aaraagate V4.89 — Secure Society Copilot Expansion

## V4.89.1: property-relationship authorization foundations

- Assistant visitor/gate, household staff and private utility queries now require an **active selected-unit occupancy**; verified ownership alone is not enough to inspect daily occupant activity.
- Payable invoice reads require a **current verified owner or current tenant payer** for that unit, not an unrelated OWNER role from another apartment. Payment history is **payer-user scoped**, including for owners, so one payer's private history is never exposed to another.
- Resident certificate/NOC request summaries now select only the signed-in creator's requests, not another occupant's requests for the same unit.
- Explicit negative regressions cover non-resident ownership, cross-property role combinations, and private request scoping.
- Existing society authorization, role checks, tool entitlements and explicit mutation confirmations remain in force.

## Remaining ordered slices

1. V4.89.2: authorized My Home tools and read-only household/visitor/parking/dues query expansion; relationship and minimal-field projections.
2. V4.89.3: approved society FAQ/rules/notices/docs and authoritative citations.
3. V4.89.4: conversational intent handling, follow-ups and vernacular routing with safe no-answer behavior.
4. V4.89.5: permission-gated action proposal UX and source deep-links.
5. V4.89.6: opt-in daily briefing, user feedback and evidence-based validation.

## Governance and acceptance

All work targets `develop` until staged release approval. Full API/Resident/Admin security and tenant regression gates are mandatory; no score increase or production/device readiness is implied. Validate owner of Unit A/tenant of Unit B, move-out expiry, family role, revoked owner, independent payer and other-household denial. Financial/gate mutations still follow authoritative domain services and require confirmation.

## V4.89.2: first authorized My Home read tool (candidate)

- `RESIDENT_HOUSEHOLD` answers a family's member-list question only with an active, time-valid selected-unit occupant relationship and `HOUSEHOLD_READ_OWN` permission.
- Minimal projection returns only active approved `FAMILY_MEMBER` names and relationship; no phone/email, other units, pending or ended occupants.
- The Assistant provides a grounded answer and routes to Profile → Family members for detailed or management flows.
- A missing unit context does not trigger a cross-unit lookup; a non-resident owner or former occupant is denied.
- Further V4.89.2 read tools (vehicles, deliveries and personalized account status) remain planned; this is an initial capability slice.
