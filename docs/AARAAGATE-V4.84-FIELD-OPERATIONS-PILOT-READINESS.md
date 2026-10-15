# Aaraagate V4.84 — Field Operations & Pilot Readiness

Date: 2026-10-07

## Objective

V4.84 converts Aaraagate's broad repository capability into a tighter, pilot-oriented operating system without creating parallel domain engines. Repository completion does not claim hosted production readiness, live-provider certification, physical gate-device acceptance, signed-store release or field-pilot acceptance.

The six slices are:

1. Gate Operations Closure
2. Finance Exception Completion
3. Copilot Controlled Actions 2.0
4. Resident Adoption Closure
5. Admin Operational Command Centre
6. Pilot/Test Evidence Closure

## Slice 1 — Gate Operations Closure

Status: implemented; protected develop validation remains the integration gate.

- Guard command summary exposes active checked-in volume, oldest active-entry age, oldest open-handover age and oldest critical-incident age.
- Waiting resident approvals older than ten minutes become explicit follow-up attention.
- Guard Field Operations surfaces the new continuity evidence alongside existing overstays, watchlists, patrol and incidents.
- Ten-minute approval ageing is an attention signal only; it never approves, denies, expires or otherwise mutates access.
- The existing four-hour overstay threshold remains the safety escalation threshold and is not relaxed by historical behaviour.
- Resident approval, Guard permissions, supervisor controls and audit trails remain authoritative.

## Slice 2 — Finance Exception Completion

Status: implemented; protected API/Admin validation remains the integration gate.

The existing accounting foundation already supports partial payable settlement, payment allocation, reversals, refunds, reconciliation, debit/credit notes, maker-checker waivers and explicit period close. V4.84 therefore deepens exception evidence rather than duplicating accounting logic.

- Canonical unapplied-cash evidence distinguishes partially allocated captured payments from fully unallocated captured payments.
- Treasurer evidence exposes the age of the oldest unresolved unapplied captured payment.
- Resolution guidance reports the exception mix before directing an operator into the existing allocation/reversal/refund workflow.
- Existing reversal/refund-aware availability remains authoritative.
- No automatic allocation, refund, journal posting, waiver, correction or period close is introduced.
- Existing owner/current-tenant payable authority and payer-private payment evidence boundaries remain unchanged.

## Slice 3 — Copilot Controlled Actions 2.0

Status: implemented; protected API/Admin validation remains the integration gate.

V4.84 adds a second Admin controlled action without widening generic AI mutation authority.

- Helpdesk → Facilities handoff uses a domain-owned FacilitiesHelpdeskHandoffService.
- Preparation reads the current ticket, linked asset, active work-order evidence and expected Helpdesk update timestamp.
- Confirmation requires HELPDESK_REVIEW plus FACILITIES_MANAGE.
- Confirmation fails closed if the Helpdesk ticket changed after preview.
- Duplicate active Facilities work for the same Helpdesk source is blocked.
- Successful confirmation uses the normal Facilities work-order path and records Facilities and Helpdesk activity evidence.
- Aaraa AI stores only the allow-listed proposal and invokes the domain service after explicit confirmation; it does not write Facilities state directly.
- Existing Helpdesk assignment, Resident amenity booking and Visitor pass proposal paths remain unchanged.

## Slice 4 — Resident Adoption Closure

Status: implemented; protected Flutter validation remains the integration gate.

- Home Action Inbox distinguishes actionable attention from informational activity. INFO-only service/notice activity can remain visible but no longer inflates “needs attention”.
- When informational activity exists without urgent follow-up, Home says that recent activity is shown rather than claiming an attention item.
- The five persistent destinations remain Home, Gate, Services, Community and Profile.
- Home quick actions remain Staff, Billing, Amenities and Helpdesk.
- Community brings Updates, Polls, Events, Resident Requests, Community Circles and Resident Directory into the top discovery surface.
- Insta Services remains inside Services and Utilities remain inside Billing; no duplicate feature route or data engine is introduced.
- Existing privacy and property-scope boundaries for Directory, Circles, Requests and Utilities remain authoritative.

## Slice 5 — Admin Operational Command Centre

Status: implemented; protected Admin validation remains the integration gate.

The existing Operations Command Centre remains the single cross-domain morning operating surface.

- A morning operating picture reports high-priority, medium-priority, open-recommendation and authorized-domain counts.
- Recommendation cards preserve “why now” and “next step” evidence where available.
- Cards use the Action Centre's permission-safe owning-workspace intent rather than reconstructing a second mutation path.
- Recommendation outcomes marked RESOLVED or DISMISSED are excluded from the open-recommendation count; unrecorded, REVIEWED and ACTED recommendations remain open.
- Existing finance, gate, facilities, helpdesk, governance, vendor and security services remain authoritative.
- The Command Centre remains read-only; mutations occur only inside the owning domain workflow.

## Slice 6 — Pilot/Test Evidence Closure

Status: repository evidence implemented; protected CI and external acceptance remain separate gates.

- scripts/check-v4.84-field-operations-pilot-readiness.mjs locks the Gate, Finance, controlled-action, Resident and Command Centre safety contracts together.
- Protected CI requires the V4.84 invariant in addition to existing repository structure, API, Admin, Flutter and dependency-security gates.
- Focused regression coverage includes Gate continuity, Finance exception classification, stale Facilities handoff prevention, AI action permission/confirmation, Resident attention semantics and Community discovery.
- Existing cross-role, tenant-isolation, recovery, security/privacy and performance suites remain in the repository release program and are not replaced by the milestone invariant.
- Android physical-device evidence, live notification/provider behaviour, hosted staging evidence and human field-pilot acceptance cannot be manufactured by repository tests and remain external.

## Release identity

Root/API/Admin identify as **4.84.0**. Resident and Guard identify as **4.84.0+48400**.

## Release policy

The V4.84 candidate remains on its feature branch until protected validation is green. Integration to develop should use one squash merge. Staging must receive the validated exact develop tree. Main remains behind independent review, required checks and fresh owner approval.

## External evidence boundary

V4.84 repository completion must not be represented as production or field acceptance. Hosted infrastructure, live payment/KYC/provider credentials and callbacks, physical gate hardware, representative Android-device execution, notification delivery under real carrier/network conditions, signed store distribution and a named society pilot require separately captured external evidence.
