# Aaraagate Services 4.0–4.4 — independent roadmap

Status: **Services 4.0.1 merged to develop; Services 4.0.2 is under CI validation in a separate PR.**
Owner: Services engineering / Product acceptance. Branch target: `develop`.
Do not reopen Services 3.1 or infer staging/main/production approval.

| Phase | Requested scope | Gap-oriented sequence | Guardrail |
| --- | --- | --- | --- |
| Services 4.0 (P1) | checklists, rework guarantees, technician quality controls | 4.0.1 versioned offering checklist templates; then booking-time snapshots, agent evidence/required-item gates, rework claim/decision SLA and provider quality reporting | Existing completion, warranty and dispute paths are authoritative |
| Services 4.1 (P1) | smart matching, quick dispatch, operational ETA | Improve existing matching/dispatch with clear opt-in location-based eligibility, availability and ETA confidence | No fabricated live GPS ETA |
| Services 4.2 (P2) | recurring services, group bookings, provider continuity | Extend existing recurring plans, community service campaigns and continuity terms; focus on execution rather than duplicating models | Explicit consumer consent and society membership |
| Services 4.3 (P2) | consolidated checkout, parts, itemized billing | Separate finance/legal proposal and tax/GST, seller, payer, ledger and refunds signoff before chargeable implementation | Non-payable Services 3.1 drafts never become invoices or payments implicitly |
| Services 4.4 (P3) | membership, loyalty, optional protection | Entitlement design, opt-in, cancellation, provider underwriting and regulatory review before checkout | No unapproved insurance/protection claims |

## Services 4.0.1 deliverable

- `GET/PUT /provider/services/offerings/:offeringId/quality-checklist` is authenticated and provider-owned.
- `PUT` accepts `{ "expectedVersion": 0, "items": [{"id":"inspect_wiring","label":"Inspect wiring","required":true}] }`.
- IDs are stable lowercase machine keys, 2–40 chars; labels 2–120 chars; at most 20 unique items. `items: []` removes the *current template's* checklist steps, not historical revisions.
- First write requires version 0; subsequent edits require the current version. Row locks prevent concurrent first-write races. Every change writes an append-only revision in the same database transaction.
- `GET /consumer/services/bookings/:bookingId/quality-checklist-preview` is scoped to the authenticated booking owner and responds with `previewOnly: true`, current `templateVersion`, and checklist items (or an empty preview).
- This is **current offering guidance**, not a booking-time immutable snapshot, completed checklist evidence, technician QA certification or new/revised guarantee. Do not gate completion on a mutable template.

## Services 4.0.2 deliverable

- Booking creation atomically copies the offering's current checklist `version` and `items` into a per-booking snapshot when a template exists.
- The idempotent same-key retry path returns the existing booking without replacing its original checklist.
- Repeat bookings already use `ConsumerBookingsService.createBooking`, so each new repeat booking receives the **then-current** template.
- `GET /consumer/services/bookings/:bookingId/quality-checklist` returns the booking-time snapshot only to the booking owner.
- Legacy bookings and offerings without a configured template return `captured: false` and `immutable: false`; do not impose a retrospective checklist.
- `quality-checklist-preview` remains a separate live, explicitly non-binding offering preview.
- Technician per-item evidence, resident acceptance and rework claims are **not** part of this slice.

## Acceptance / scope gates

1. Migration deploy and rollback rehearsal in test environment; no schema drift in deployed DB.
2. API typecheck, Vitest and auth/tenant isolation regression; stale optimistic updates fail closed, revision audit is transactional.
3. Review provider/consumer UI and accessibility only after checklist template contract is stable.
4. No payment, invoice, warranty extension, existing Services 3.1 behavior, or branch-promotion changes.
5. **Stop after 4.0.2** until its CI is green. Continue technician evidence and rework governance as separately bounded slices.
