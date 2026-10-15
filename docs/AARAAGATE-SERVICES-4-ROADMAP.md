# Aaraagate Services 4.0–4.4 — independent roadmap

Status: **Services 4.0.1–4.3.1 merged to develop; Services 4.3.2 under review and CI validation.**
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

## Services 4.0.3 deliverable

- The authenticated, verified assigned technician may record `{ "itemId": "inspect_filter", "passed": true, "note": "Checked" }` through `POST /provider-agent/services/assignments/:assignmentId/quality-evidence`.
- Writes require an `ARRIVED` assignment, the matching active `IN_PROGRESS` booking, and an item ID in that booking's immutable checklist snapshot. The booking row is locked to prevent completion/evidence races.
- The assessment history is append-only, not overwritten by retry, and cannot mutate previously snapshotted items or original booking price.
- Agent read `GET /provider-agent/services/assignments/:assignmentId/quality-evidence` uses the authenticated agent/provider assignment mapping.
- Consumer read `GET /consumer/services/bookings/:bookingId/quality-evidence` is limited to the authenticated booking owner.
- No claims about technician certification, resident approval, automatic warranty, booking completion gating or rework settlement are added.
- Tests include unauthorized assignment/consumer reads, invalid checklist items, absent legacy snapshots, ownership enforcement and immutable event insertion.

## Services 4.0.4 — required quality gates

- Provider-agent completion requests AND final consumer completion confirmation verify `required: true` steps against the **immutable booking-time snapshot**.
- Only the latest assessment for each item on the *current arrived assignment* counts; a failed or missing required step blocks completion and optional steps do not.
- The booking lock serializes agent evidence with completion confirmation; rechecks prevent lost-response retries from bypassing failed assessments.
- Legacy bookings with no captured checklist continue unchanged. No pricing, warranties, guarantees, rework, approvals, or payments are introduced.
- Focused tests assert missing/failed/passing evidence, optional items, stale retries, active-assignment scoping, and legacy compatibility.

## Services 4.0.5 — review-only rework intake

- Reuse existing `ConsumerServiceDispute` and associated evidence/reviewer flows; no parallel support ledger or rework payment system.
- `GET /consumer/services/bookings/:id/rework-terms` returns original captured warranty/revisit terms only for the booking owner and only after completion, with explicit expiry/absence status.
- `POST /consumer/services/bookings/:id/request-rework` opens an owner-scoped existing dispute with reason `REWORK_REQUEST` and requires a 10–2000 character description.
- Every rework intake is **review only**. No automatic warranty approval, guaranteed visit, billing or refund. Expired or uncaptured terms are not represented as coverage.
- The existing one-open-dispute constraint and reviewer permission gate remain authoritative; duplicate case APIs are deliberately avoided.
- Follow-up slice: provider quality scoring and agreed rework SLA after independent product acceptance.

## Services 4.0.6 — provider quality evidence summary

- `GET /provider/services/quality-summary` returns a **provider-private**, verified-operator-scoped 90-day summary using existing booking, booked-checklist and rework-dispute records.
- It exposes completed bookings, completed bookings with checklist snapshots, rework-review request counts, and currently open rework-review counts; no individual resident, household, address, or agent is exposed.
- The completed-booking cohort uses current booking completion state and `updatedAt` in the last 90 days. It is an **operational proxy**, not a precise original-completion-time cohort or quality success rate.
- 5+ completed bookings is a sample-size readiness indicator only; it does not authorize scoring. `qualityScore: null`, `reviewOnly: true`, public ranking disabled, automatic penalties disabled.
- No migration, mutable quality score, membership, finance or warranty impact. KPI interpretation and any ranking require independent product/UAT acceptance.
- Before PR review, run `node services/api/scripts/tenant-access-inventory.mjs --write` and include the deterministic output to avoid blocked CI after introducing API/SQL paths.


## Services 4.1.1 — provisional provider-scoped dispatch candidate matching

- Platform dispatch operators use `GET /platform/services/consumer-bookings/:bookingId/dispatch-candidates` under existing `PLATFORM_CONSUMER_DISPATCH_READ` permissions.
- Booking must be confirmed, unassigned and associated with an active verified provider. Up to 25 active agents are restricted to that exact provider.
- Rank by conflicting active assignment schedules, active assignment count and deterministic agent display name/ID. Do not use any cross-provider work, ratings, paid placement or unverified capabilities as selection criteria.
- Returns only agent IDs, display names and provisional load/conflict metadata, no agent phone, home address or consumer PII.
- Always declare `availabilityConfirmed: false`, `skillsVerifiedForOffering: false`, `etaMinutes: null`. This is not GPS availability, a guarantee, or a real ETA.
- This endpoint makes **no assignments or state changes**. Existing platform authorization and assignment transaction remain authoritative; concurrent assignments can invalidate a shortlist.
- Further slices: 4.1.2 authorized quick dispatch with time-conflict checks; 4.1.3 operational ETA based on verified dispatch milestones and explicit freshness rules.
- Stop condition: all required PR CI gates passing and `develop` merge only; staging/main unchanged. Generate the deterministic V5 tenant inventory with the repository script.


## Services 4.1.2 — one-action conflict-safe quick dispatch

- Authorized platform operator uses `POST /platform/services/consumer-bookings/:bookingId/quick-dispatch` (existing `PLATFORM_CONSUMER_DISPATCH_MANAGE` permission). No request body or unreviewed price/location changes.
- Reuse the read-only provider-scoped 4.1.1 shortlist to select the first candidate without a schedule conflict. If none, fail closed.
- Dispatch calls the existing authoritative `assign()` transaction, which locks the target booking, rejects existing active assignment, then locks the selected provider agent.
- **Under the locked agent row**, re-check all active dispatch assignments for time overlap before inserting; this also hardens manual direct agent assignment against concurrent double-booking.
- If a shortlist becomes stale, reject the transaction and require retry. This does not certify skills, physical availability or operational ETA.
- Retain assignment event, existing notification flow, provider verification, no extra payments, no migration and existing society separation.
- Required gates: source inventory regeneration, targeted dispatch race/authorization tests, full API and security CI, develop merge only.
- Follow-up: 4.1.3 operational ETA grounded in dispatch milestones and freshness, no fabricated GPS.

## Services 4.1.3 — conservative operational arrival estimate

- `GET /consumer/services/bookings/:id/operational-eta` is authenticated and scoped through the pre-existing booking-owner dispatch authorization.
- `ARRIVED` uses the authoritative recorded arrival milestone: no calculated ETA.
- Other non-en-route statuses, absent evidence and an en-route timestamp over 15 minutes old return `etaMinutes: null` with an explicit reason.
- A fresh en-route milestone may use the provider's last 90 days of historical en-route→arrival intervals (5–180 minutes) if there are **at least five** observations. The current assignment is excluded. The response rounds remaining minutes upwards in five-minute bands.
- Results are explicitly `confidence: LOW`, `liveTracking: false`, `guaranteedArrival: false`, with provenance `PROVIDER_HISTORICAL_EN_ROUTE_TO_ARRIVED`. If the historical time window has already elapsed, no ETA is claimed.
- Never expose other jobs, GPS coordinates, agent addresses, phone numbers or individual journey records. No automatic dispatch, status mutation, payment change, migrations or location integrations.
- Require focused owner-boundary/freshness/sample tests and deterministic tenant-access inventory regeneration before develop merge.

## Services 4.2.1 — explicit booking from recurring preferences

- Authenticated `POST /consumer/services/recurring-plans/:planId/book` accepts the same schedule, notes and optional idempotency key as the existing one-off booking flow.
- Only the authenticated plan owner with `ACTIVE` status can invoke it; `PAUSED` and `CANCELLED` plans are rejected.
- The plan provides only offering and location references. Current unit/home ownership, provider verification, availability, price, booking-time checklist snapshot and replay safety are all revalidated by the authoritative `ConsumerBookingsService.createBooking` path.
- Each explicit call creates **one requested booking**, never an automatic recurring schedule, calendar reservation, provider assignment, invoice, or charge.
- Provider preferences `cadence`, `preferredWeekday` and `preferredTime` remain guidance, not confirmed reservations. Later automation requires separate policy, consent, reminder and scheduling acceptance.
- Follow-up 4.2 work: clearer next-visit planning, existing community campaign conversion and continuity workflows without parallel ledgers.

## Services 4.2.2 — owner-scoped recurring preference visit visibility

- `GET /consumer/services/recurring-plans/:planId/visits` returns at most 25 actual bookings matching the owner, offering and location of the plan.
- Both HOME and SOCIETY_UNIT are scoped to the authenticated plan owner. Paused/cancelled plans may read matching historical bookings.
- The endpoint deliberately returns `planOriginVerified: false`. Bookings are matched by references only; the system does not record a plan-to-booking foreign key.
- Booking statuses, timestamps and past activity are records, not calculated next visits, guaranteed recurring commitments or automatic reservations.
- No personal addresses, agent details, payment mutations, new tables or scheduled jobs. No changes to Services 3.1.
- Validation: focused auth, location scoping, status and historical-origin tests, plus full required PR CI.

## Services 4.2.3 — society-scoped group participation transparency

- `GET /consumer/services/community-deals/:campaignId/participation?locationType=SOCIETY_UNIT&locationId=<unit-id>` reuses the existing society-unit ownership validator.
- Campaign lookup and the user's unit's participation are restricted to the resolved society. Return a not-found response for foreign campaigns.
- Return only aggregate joined-household count, threshold and dates, campaign price, status and the requesting unit's own participation status. No household list, phone, address, or private booking details.
- Explicitly state `interestOnly: true`, `bookingConfirmed: false`, `paymentAuthorized: false`, and `serviceGuaranteed: false`: joining, even after a threshold is met or a campaign is LOCKED, is not a purchased/confirmed booking.
- No group booking conversion, payment capture, resident charging, new schema, or existing contract changes; confirmation policy and execution still require separate product acceptance.
- Tests cover no-society units, foreign-society campaign non-disclosure, threshold semantics and withdrawn household state.
- Regenerate the V5 tenant-access inventory, confirm full API CI, and merge to develop only after green gates.

## Services 4.2.4 — threshold-safe manual community deal lock

- Society-admin `PATCH /services-marketplace/community-deals/admin/:campaignId/status` retains the existing tenant/permission gates and OPEN → LOCKED manual workflow.
- An admin may lock an OPEN campaign **only while its service date is in the future** and its society-scoped **JOINED** household count is at least `thresholdHomes`. Withdrawn interests never count.
- Check readiness inside the existing campaign-row-lock transaction. Resident join/withdraw operations use the same lock; compute the interest count **after** acquiring the lock to avoid a stale pre-lock count.
- Below threshold or after the service date, fail without changing the campaign. Terminal state and cancellation transitions retain their existing contracts.
- LOCKED means participation closed, **not** that a booking exists, the provider is committed, or the discounted price has been charged. There is no consumer payment, invoice, agent dispatch, group-booking conversion, scheduler, migration or new API endpoint.
- Targeted validation: below-threshold denial, sufficient JOINED interest, expired date, tenant-scope query, lock sequencing, unchanged cancellation behavior, inventory regeneration and full protected CI before merging to `develop`.

## Services 4.2.5 — owner-scoped technician continuity evidence

- Authenticated `GET /consumer/services/recurring-plans/:planId/technician-continuity` reuses `ConsumerServiceMemoryService` and the existing recurring preference/booking/dispatch tables; it does not create another technician, booking, or preference ledger.
- First fetch the recurring plan by **authenticated user ID**. Revalidate the plan's **current** HOME or SOCIETY_UNIT access with `ConsumerServiceLocationService.resolveLocation`; former occupants cannot use a stale plan as a society access grant.
- Return up to three currently **active** technician records belonging to the currently active, verified offering provider, supported by that user's own **COMPLETED** bookings for the **same offering and same location**, with a recorded technician `arrivedAt` milestone.
- Response exposes only technician display name, internal reference ID, recorded arrival timestamp and number of matched completed visits; never phone number, address, GPS or another household's history. A PAUSED/CANCELLED plan can view its own historical evidence if the user still owns the location.
- Response explicitly declares `historicalEvidenceOnly: true`, `technicianAvailabilityConfirmed: false`, `technicianAssignmentGuaranteed: false`, `bookingCreated: false` and `automaticDispatch: false`. An active technician record **does not mean they are available** for a date, qualified for the offering, or committed to a new visit.
- This is a read-only visibility slice. Requesting that specific technician, preferential dispatch, rebooking UI surfacing and any consumer notification require a separately accepted contract. The existing explicit booking, conflict-safe dispatch, immutable prices and permission rules remain authoritative.
- Targeted unit tests: foreign plan denial, lost unit access, unsupported/mismatched location, completed+arrived owner/offering/location scoping, no-PII output, paused-history visibility and empty evidence. Regenerate tenant-access inventory and satisfy required PR CI; merge `develop` only.

## Services 4.2.6 — explicit technician request per booking

- Resident-owned `GET/PUT /consumer/services/bookings/:bookingId/technician-preference` accepts an explicit technician UUID (or `null` to clear). Each booking holds at most one preference, persisted separately from booking state.
- The booking must belong to the authenticated consumer and remain `REQUESTED` or unassigned `CONFIRMED`. The mutation serializes with dispatch via the **existing booking row lock**. A resident must retain current HOME or SOCIETY_UNIT access; former occupants are denied.
- A selectable technician must still be active under the same verified provider and have recorded arrival on a **COMPLETED booking owned by this user for the same offering and location**. Another household's technician, a different provider/offering, or an inactive agent is rejected.
- `GET` returns only the owner-visible requested agent ID/display name and a current *record-active* flag, with explicit `requestOnly`, `availabilityConfirmed: false`, `assignmentGuaranteed: false`. No contact details, private agent information or other household history.
- Existing platform dispatch shortlist reads the request, ranks a conflict-free requested agent before equal alternative agents and marks `residentRequested`; active provider/agent checks and locked schedule-overlap assignment remain authoritative. If the requested agent is unavailable, the platform may assign another eligible agent. This is **not** reservation or skill certification.
- One small migration adds `ConsumerServiceTechnicianPreference` with booking/owner/provider/agent references. No automatic visits, booking changes, gate permissions, scheduler, charge, refund or invoice.
- Validate ownership, revoked occupancy, completed historical assignment proof, active dispatch exclusion, clear/update, no-PII return, preference ranking and fallback. Regenerate deterministic V5 tenant inventory and merge to `develop` only after all CI gates pass.

## Services 4.2.7 — resident booking technician selector

- Add a booking-scoped read-only `GET /consumer/services/bookings/:bookingId/technician-candidates`. Owner and current HOME/SOCIETY_UNIT access are checked before reading history. Only REQUESTED/CONFIRMED unassigned bookings qualify.
- Return at most 20 active technicians of the booking's verified provider with a documented arrival on this owner's completed visit for the same offering and location, showing only display name, completed visit count and last arrival. No phones, GPS, other households, automatic booking or implied availability.
- Wire the selector into Resident **My Bookings → booking details** for pending unassigned work, with explicit save/clear, server refresh, loading, empty and error states; keep all statuses and history visible in a bounded scrolling modal.
- Label selection as a request only. Actual agent availability, provider acceptance and assignment stay in the conflict-safe platform dispatch path; reassignment to another technician remains possible.
- Targeted API/Flutter regression, refreshed deterministic tenant inventory, protected CI; no new migration or staging/main promotion.

## Services 4.2.8 — technician request and dispatch status consistency

- New authenticated, booking-owner-scoped, read-only `GET /consumer/services/bookings/:bookingId/technician-request-status` joins the saved request to the **currently active** dispatch assignment in one database snapshot. The current HOME/society-unit access check remains mandatory.
- Return explicit `NO_REQUEST`, `AWAITING_ASSIGNMENT`, `REQUESTED_TECHNICIAN_ASSIGNED`, `OTHER_TECHNICIAN_ASSIGNED`, `REQUEST_CLOSED` states. Only active `ASSIGNED/ACCEPTED/EN_ROUTE/ARRIVED` dispatch counts as current; terminal booking status cancels pending preference. Rejected/released assignments never imply a present assignment.
- Do **not** assert that a preference caused an assignment. A matching technician can be assigned for unrelated operational reasons. Never reveal private technician phone, address/GPS, other household data, or dispatch authority.
- Resident **My Bookings → booking details** shows a clear status explanation even after assignment. A successful explicit save refreshes the status from the server. Denied/unavailable status responses fail closed without breaking the existing booking timeline.
- Focused ownership, lost access, unmatched/matched/other, cancelled/completed/released, no-PII and Flutter refresh/error tests. Inventory regeneration and full protected CI are required. No new tables, payment, platform dispatch rules or staging/main commits.

## Services 4.3.1 — owner-only, nonpayable booking checkout breakdown

- New authenticated `GET /consumer/services/bookings/:id/checkout-breakdown` provides the original saved booking-service price, separate existing extra-work quote statuses and existing base-payment status.
- Queries are strictly booking-owner scoped at **each** data-access boundary; never expose addresses, payment provider identifiers, other residents, agents or provider-private settlement data.
- `baseService.amountPaise` is copied from `ConsumerServiceBooking.servicePricePaise`. Extra-work quotes remain individually labeled `includedInBasePayment: false`; even `APPROVED` quote consent **is not** added to payable totals or converted into invoices.
- `readOnly: true`, `checkoutReady: false`, `amountPayablePaise: null` and `taxBreakdown: null` explicitly avoid pretending that GST, legal seller, parts taxes, invoice or consolidated settlement are approved. Lists show up to 20 records each; no aggregate claim about omitted records.
- No write to payment, invoice, quote consent, refund, settlement or booking lifecycle. No new migration or production integration.
- Focused tests must prove owner boundaries, invalid amount denial, approved-quote separation, payment status provenance, and zero-amount historical bookings.
- Next 4.3 slice requires product/finance decisions on seller-of-record, tax regime/GST, invoice ownership, parts provenance, and refund/reconciliation before enabling consolidated payable checkout.

## Services 4.3.2 — resident read-only checkout breakdown

- Add a dedicated, explicitly opened **View price and quote breakdown** sheet under Resident → My Bookings → booking details. No silent background financial reads on routine timeline navigation.
- The widget uses only `GET /consumer/services/bookings/:id/checkout-breakdown`, validates its nonpayable contract, provides loading/denied/retry/refresh states, and safely converts integer-paise amounts to rupees.
- Show the original booking price, each extra-work quote's separate status/amount, original payment state, and a persistent explanation that approved extra work is **not part of base payment**, GST/final total are undetermined, and this view is not an invoice or payment UI.
- No payment buttons, mutation calls, hidden sum, GST inference or changes to quote consent flows.
- Widget regression coverage: base amount/approved-quote separation, denial and retry, unsafe contract refusal, zero/missing historical rows and server-state refresh.
- Full Flutter/API/security CI required before `develop` merge; staging/main untouched.

## Acceptance / scope gates

1. Migration deploy and rollback rehearsal in test environment; no schema drift in deployed DB.
2. API typecheck, Vitest and auth/tenant isolation regression; stale optimistic updates fail closed, revision audit is transactional.
3. Review provider/consumer UI and accessibility only after checklist template contract is stable.
4. No payment, invoice, warranty extension, existing Services 3.1 behavior, or branch-promotion changes.
5. **Stop after 4.3.2** until CI is green. Quality scoring, rework SLA, public rankings and provider sanctions still need independent product acceptance.
