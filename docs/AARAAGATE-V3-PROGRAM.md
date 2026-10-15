# Aaraagate V3 Development Program

Version: 3.0 execution baseline  
Date: 2026-09-17  
Status: Approved direction / implementation started

## Mission
Aaraagate V3 moves the product from broad feature coverage toward a production-capable residential operating platform with strong finance, guard operations, services commerce, facility operations, AI-assisted workflows and integration readiness.

V3 is not a rewrite. It builds on the existing V2 architecture and preserves the current tenant isolation, owner/occupant separation, multi-property identity model, independent-home mode, role/permission controls, auditability and release governance.

## Delivery principles
1. `develop` remains the active integration branch.
2. Feature work is batched by milestone; avoid frequent low-value staging or release promotions.
3. `main` is changed only for deliberate release promotion and requires explicit manual approval.
4. Staging is used at milestone boundaries or where realistic infrastructure behavior is necessary to validate the work.
5. Each milestone should be completed end-to-end before moving to the next unless an external dependency blocks completion.
6. Selective tests run during implementation; full regression runs at milestone boundaries.
7. Existing high-frequency user flows must not regress while V3 capabilities are added.
8. Production-only dependencies use sandbox/test adapters until real credentials, providers or hardware are available.

## V3 product position
Aaraagate should differentiate as:

**Society OS + Home Services + Independent Homes + Multi-property Identity + AI-assisted Operations**

The goal is not to clone MyGate, NoBrokerHood, ADDA or ApnaComplex feature-for-feature. V3 must close Indian-market operational gaps while strengthening capabilities those products do not combine as cleanly, particularly independent-home services, multi-property context and the connection between service booking and physical gate authorization.

## Milestone V3.1 — Integrated baseline hardening

### Goal
Make the capabilities already present on `develop` reliable enough to serve as the foundation for the remaining V3 work.

### Scope
- Validate resident -> API -> database -> admin/security end-to-end contracts for critical flows.
- Remove or isolate demo/fallback behavior from production-intended paths.
- Harden error, loading, empty and offline states.
- Verify multi-property switching and independent-home feature visibility boundaries.
- Verify owner/tenant/occupant access rules and gate-notification routing.
- Validate tenant isolation and permission-negative cases.
- Verify audit events for privileged actions.
- Strengthen CI contract coverage for critical cross-application flows.
- Ensure build/test/lint baselines are green before V3.2.

### Critical flows
- Authentication and active-property selection.
- Visitor pre-approval and gate approval.
- Domestic-help/workforce attendance.
- Deliveries/parcels.
- Complaints/helpdesk.
- Amenities/bookings.
- Billing/payment status surfaces.
- External services discovery, offers and bookings.
- Notifications and emergency/SOS paths.

### Exit criteria
- No known P0/P1 regression in critical flows.
- No unintended demo fallback on production-intended paths.
- Targeted contract, tenant-isolation and role tests green.
- Resident, Admin and Security applications build successfully.
- API test suite and migrations are clean.
- A milestone readiness record documents remaining production-environment-only validation.

## Milestone V3.2 — Society Finance Engine

### Goal
Bring Aaraagate close to Indian apartment-management parity for billing, collections and auditable society finance.

### Scope
- Configurable recurring maintenance and charge formulas.
- Unit/party ledger with immutable debit/credit/adjustment events.
- Arrears, late fee/interest and controlled waiver workflows.
- Advance/unapplied credits and partial allocations.
- Receipts and payment allocation.
- Production-ready payment abstraction with sandbox gateway implementation.
- Webhook idempotency, retries, duplicate detection and reconciliation.
- Refund/reversal/dispute references.
- Bank account register and bank reconciliation.
- Income/expense accounting.
- Vendor bills/payables and approval workflow.
- Configurable GST/TDS metadata where applicable.
- Budgets and budget-versus-actual reporting.
- Corpus/sinking/reserve funds.
- Trial balance, income/expenditure and balance-sheet outputs.
- Defaulter workflows and finance dashboards.
- Audit exports and Tally-compatible export baseline.

### Exit criteria
- Ledger invariants tested.
- Gateway sandbox reconciliation tested including duplicate/retry cases.
- Finance role segregation verified.
- Resident dues/receipts and Admin finance workflows operate end-to-end.

## Milestone V3.3 — Guard App 2.0

### Goal
Make gate operations fast, resilient and usable under real Indian apartment conditions.

### Scope
- Routine gate transactions targeted at <= 5 seconds and <= 3 taps.
- Offline-first queue and deterministic sync/recovery.
- Large, searchable unit/resident lookup.
- Repeat visitor and frequent-provider fast paths.
- Delivery-company quick actions.
- Overstay handling.
- Blacklist/greylist and watch flags with audited permissions.
- Material gate pass.
- Move-in/move-out gate handling.
- School-bus/transport event support where configured.
- Patrol checkpoints using QR/NFC abstraction.
- Incident capture with photo/audio references.
- Supervisor dashboard and shift handover.
- Regional-language UI baseline and optional voice prompts.

### Exit criteria
- Core guard workflows work during temporary API/network loss.
- Sync conflict and duplicate-action behavior tested.
- Performance/usability checks meet the high-frequency-flow targets.

## Milestone V3.4 — Services Marketplace 2.0

### Goal
Turn External Services into a differentiated commerce and access workflow for both society residents and independent-home users.

### Scope
- Verified provider profiles and trust signals.
- Premium provider categories and merchandising.
- Images/media.
- Offers and pricing.
- Availability and slot selection.
- Booking lifecycle and provider dispatch.
- Booking notifications.
- Service completion and evidence.
- Ratings/reviews.
- Payment-readiness abstraction.
- Warranty/service-history references.
- Property-aware booking for multi-property users.
- Independent-home compatibility.
- Society booking -> time-limited service-provider gate authorization.
- Gate entry/exit -> booking timeline update.

### Exit criteria
- Discovery -> booking -> authorization -> fulfilment -> completion -> rating works end-to-end.
- Independent-home users can complete the services journey without exposure to society-only features.

## Milestone V3.5 — Facility and Society Operations ERP

### Goal
Provide operational depth expected by professionally managed communities.

### Scope
- Asset register and QR identification.
- AMC/warranty/contract tracking.
- Preventive maintenance plans.
- Work orders and breakdown handling.
- Inspections/evidence/service history.
- Inventory/spares baseline.
- Society vendor master and contracts.
- Procurement requests, quotation comparison and approval matrix.
- Purchase order baseline.
- Vendor-invoice linkage to finance.
- Utility/meter master and reading import baseline.
- Housekeeping/patrol/staff roster extensions where useful.

### Exit criteria
- Asset -> maintenance -> vendor -> cost history operates end-to-end.
- Finance linkage is auditable and permission scoped.

## Milestone V3.6 — AI-assisted Operations 1.0

### Goal
Add useful, permission-aware AI actions rather than a generic chatbot.

### Resident use cases
- Explain current maintenance dues from authoritative data.
- Find receipts and payment status.
- Book amenities through normal booking APIs.
- Check external-service booking status.
- Start visitor pre-approval.
- Create a helpdesk complaint from natural language/voice input.
- Check domestic-help attendance where authorized.

### Admin/operations use cases
- Summarize overdue accounts.
- Surface helpdesk SLA breaches.
- Summarize incident timelines.
- Draft notices/communications for human approval.
- Explain operational dashboards from permission-filtered data.

### Safety/architecture rules
- AI never bypasses application authorization.
- Mutating actions call normal permission-checked APIs.
- High-impact actions require explicit confirmation.
- Tenant/property context is mandatory.
- Sensitive outputs are audit logged where appropriate.

### Exit criteria
- Permission/tenant negative tests pass for AI tools.
- No direct database mutation by AI.
- Core read-only and low-risk actions work end-to-end.

## Milestone V3.7 — Access Integration Platform

### Goal
Make Aaraagate hardware/vendor neutral without manufacturing hardware.

### Scope
- Stable access-device adapter contract.
- ANPR integration adapter.
- Boom-barrier adapter.
- RFID/FASTag adapter.
- Device/site mapping.
- Health/status monitoring.
- Idempotent access commands and event ingestion.
- Audit trail and safe fallback behavior.
- Sandbox/simulator implementation when hardware is unavailable.

### Later-compatible adapters
- Biometric devices.
- Smart locks.
- CCTV/intercom.
- Lift access.
- EV charging.

### Exit criteria
- At least three adapters pass simulator/contract tests.
- Device failure cannot break core manual gate operations.

## Milestone V3.8 — Governance and Community Administration

### Goal
Complete configurable governance workflows without assuming one nationwide legal model.

### Scope
- Committee roster/tenure/handover.
- AGM/SGM/committee meetings.
- Agenda and document packs.
- Minutes and resolutions.
- Resolution action items.
- Configurable quorum/approval evidence.
- Polls/surveys.
- Optional election workflow only where configured and appropriate.
- Bye-laws/rules repository references.
- Owner-only versus occupant-visible controls.

### Exit criteria
- Governance actions are configurable, auditable and access scoped.

## Milestone V3.9 — Analytics, Localization and WhatsApp Layer

### Goal
Improve adoption, operational visibility and Indian-market accessibility.

### Scope
- Finance and operations dashboards.
- Funnel/event analytics for critical resident/guard journeys.
- SLA/incident/facility dashboards.
- Regional-language expansion for high-frequency flows.
- Accessibility/font scaling and screen-reader review.
- WhatsApp notification/action architecture using approved providers and templates.
- Universal search and improved property-context discoverability.

### Exit criteria
- Analytics derives from authoritative events.
- Localization does not expose untranslated critical actions.
- WhatsApp remains an extension of authenticated workflows, not a bypass around authorization.

## Milestone V3.10 — Staging, Pilot and Production Readiness

### Goal
Validate realistic infrastructure behavior before production release.

### Scope
- Production-like staging environment.
- PostgreSQL migration/restore evidence.
- Redis/background-job reliability.
- Object-storage authorization and lifecycle behavior.
- Push-notification reliability.
- Payment webhook/reconciliation validation.
- Observability, alerts and error tracking.
- Backup/restore and rollback drills.
- Security/privacy review.
- Load/performance tests on high-risk paths.
- Role-by-role UAT.
- Controlled pilot society and independent-home pilot.
- Pilot issue triage and release-blocker closure.

### Exit criteria
- No unresolved release-blocking P0/P1 defect.
- Backup/restore and rollback evidence current.
- Pilot acceptance recorded.
- `main` promotion requested separately and performed only after explicit manual approval.

## Milestone execution protocol
When instructed to "proceed with next milestone":
1. Re-read current `develop` head, open PRs and relevant CI before changing code.
2. Create/reuse one milestone feature branch.
3. Inspect only the relevant bounded contexts first.
4. Batch related implementation changes.
5. Run targeted tests continuously.
6. Fix reviewer/CI failures narrowly.
7. Run milestone-level regression/contract checks.
8. Merge a green milestone PR into `develop` when appropriate.
9. Do not promote to `main` without explicit manual approval.
10. Report completed scope, evidence, deferred external dependencies and the next milestone.

## Speed strategy
Development speed should come from less coordination overhead and fewer context switches, not from reducing engineering quality:
- targeted repository reads instead of repeated whole-repo scans;
- one branch/PR per coherent milestone or substantial milestone slice;
- batched file changes;
- contract tests around bounded-context interfaces;
- selective tests first, full regression at milestone boundaries;
- simulators/sandboxes for unavailable providers/hardware;
- avoid staging deployments for code that can be validated locally/CI;
- avoid repeated `main` promotions;
- keep architecture decisions recorded so they are not repeatedly rediscovered.

## Known delivery constraints
Some completion depends on external inputs and cannot be made fully production-proven by repository work alone:
- real payment-gateway merchant credentials and webhook endpoints;
- FCM/APNs production credentials/device fleet behavior;
- SMS/WhatsApp provider approval and templates;
- real ANPR/RFID/boom-barrier vendor protocols and hardware;
- production DNS/TLS/cloud environment and secrets;
- representative pilot society policies/data/users;
- accounting/legal review for society-specific statutory treatment.

These dependencies must not block core implementation. V3 uses explicit interfaces, test adapters, fixtures and simulators so development can continue until the real dependency becomes necessary for acceptance.
