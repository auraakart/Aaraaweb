# Aaraagate V4.70 — Competitive Operations Convergence

Date: 2026-09-28  
Baseline: `develop@0ed4aaa30fc2e7abd10cf04e31230c550577032a`

## Objective

V4.70 converts the latest competitor-gap review into six focused improvements without broadening Aaraagate into duplicate domains. The cycle extends existing finance, amenities, platform analytics, helpdesk, integration-registry and outcome-analytics sources of truth. It does not turn repository capability into a field-certification claim.

## 1. Finance Smart Intake

The existing bank-reconciliation suggestion flow remains authoritative and now exposes deterministic match signals and an explanation for each candidate. Suggestions remain `autoMatched:false` and require an explicit finance decision.

Expense intake adds a pre-create assessment for duplicate or conflicting vendor evidence. It detects exact invoice-reference/vendor/amount matches and nearby same-vendor/same-amount cases, classifying them as exact duplicate or review-required evidence.

The assessment is read-only: it does not create an expense, payable or journal and does not replace the existing approval/posting workflow.

**Important exclusion:** No OCR/document-extraction provider is integrated by V4.70. Vendor-invoice OCR remains a future live-integration capability; this slice improves duplicate/conflict controls around structured intake.

## 2. Amenity Policy Depth

The existing amenity rule engine is extended rather than replaced.

New policy depth includes:
- cross-amenity conflict groups for facilities that cannot be booked concurrently by the same unit;
- deterministic time-band pricing stored inside the existing booking-rules contract;
- the same conflict-group protection during direct booking, waitlist join and waitlist promotion;
- promotion-time fee calculation using the same pricing rules as direct booking.

Admin can configure a conflict group and a peak time-band. The service contract supports multiple validated non-overlapping pricing bands, while the first Admin control intentionally exposes a simple peak-band workflow.

No opaque demand pricing or algorithmic price optimisation is introduced.

## 3. Portfolio Command Centre

The existing platform analytics path now exposes a cross-society command centre for Super Admin.

For each society it derives current-state operational attention from:
- open and SLA-breached helpdesk work;
- pending gate approvals;
- active SOS incidents;
- critical and overdue facility work;
- overdue maintenance invoices;
- active resident occupancy.

Attention is deterministic `CRITICAL / HIGH / WATCH / NORMAL` current-state evidence with explicit reasons. It is not a prediction, quality ranking or automated intervention.

## 4. Helpdesk Triage Intelligence

Helpdesk review now exposes deterministic advisory triage over the existing ticket workflow.

It provides:
- keyword-based category evidence when no category is already recorded;
- same-unit similar-ticket recurrence over the prior 90 days;
- current open-ticket workload for active society members;
- an assignment option only when one active member has a uniquely lowest workload.

A tied workload deliberately produces no recommended assignee. Category and assignment are never applied automatically; the existing reviewer actions remain authoritative.

## 5. Integration Activation Plan

The existing integration registry and conformance checks now produce an activation plan.

The plan distinguishes:
- contract gaps;
- deployment/adapter configuration gaps;
- missing, disabled or mismatched society provider selections;
- external field-evidence requirements;
- internal activation readiness.

This converts provider-neutral architecture into clearer operational next actions without exposing secrets or changing domain truth.

**No live-provider or physical-hardware certification is claimed.** Reference ANPR/RFID/boom-barrier adapters, IVR simulators, configured gateway contracts and other conformance evidence remain readiness evidence until real credentials/devices/providers are independently accepted.

## 6. Field Experience Telemetry

The existing privacy-minimal operational-usage mechanism is extended with three high-frequency task-start signals:

- `AMENITY_BOOKING_STARTED`;
- `PAYMENT_CHECKOUT_STARTED`;
- `HELPDESK_DRAFT_STARTED`.

Signals remain SHA-256 pseudonymous and deduplicated per event type/user/day. Raw tap, text-entry, navigation or keystroke traces are not stored.

Reports compare those start signals with authoritative AmenityBooking, Payment and HelpdeskTicket outcomes. During client rollout, if authoritative completions exceed V4.70 start signals, the report explicitly shows `PARTIAL_CLIENT_COVERAGE` and suppresses conversion percentage rather than inventing a misleading rate.

Existing domain outcome analytics continue to measure gate processing/approval, helpdesk SLA, notification handoff, guard offline recovery, collections and service completion without duplicating them as client telemetry.

## Source-of-truth reuse

V4.70 deliberately does not create:
- a second accounting ledger or reconciliation engine;
- a second amenity booking domain;
- a parallel helpdesk assignment system;
- a second integration registry;
- an individual-behavior analytics profile;
- an autonomous cross-society control agent.

The existing domain transactions and authorization boundaries remain authoritative.

## Human agency and safety boundaries

- Finance suggestions never auto-match or auto-post.
- Expense intake assessment never creates accounting evidence.
- Helpdesk intelligence never auto-classifies or auto-assigns a ticket.
- Portfolio attention never mutates society operations.
- Integration readiness never certifies an external provider/device by itself.
- Experience telemetry does not infer satisfaction, intent, health, identity or individual risk.
- Gate/access authorization behavior is unchanged by V4.70.

## Verification

Focused regression tests cover:
- finance duplicate/conflict assessment and bank suggestion explainability;
- amenity cross-group conflicts and time-band fee selection;
- portfolio attention derivation;
- helpdesk classification/recurrence/workload evidence, including tied-workload refusal;
- integration activation-plan truth boundaries;
- privacy-minimal task-start telemetry and partial-coverage reporting.

`scripts/check-v4.70-competitive-operations.mjs` locks the structural semantic contracts in repository CI. Existing API, Admin, Flutter, security, migration and historical milestone validation remain required.

## External exclusions

V4.70 does not claim:
- hosted production acceptance or real-society adoption;
- a live OCR/vendor-invoice extraction provider;
- live payment mandate/AutoPay execution;
- live telephony/WhatsApp acceptance;
- physical ANPR, RFID, boom-barrier or smart-meter certification;
- statutory/legal certification;
- accepted field-pilot evidence.

Those remain external integration and field-validation gates.
