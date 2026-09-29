# Aaraagate V4.71 — Operational Depth & Usability Convergence

Date: 2026-09-28  
Baseline: `develop@abab54c9bf26087fcaebe0fb500607cd84fe452d`

## Objective

V4.71 continues repository-only product development after V4.70 while productionization is intentionally deferred. The cycle closes operator-workflow gaps where backend capabilities already existed but were not yet fully usable from Admin, and adds one bounded helpdesk/facilities relationship that improves operational diagnosis.

**Productionization is explicitly excluded from this cycle.** No hosted-environment, live-provider, physical-hardware, app-store, field-pilot or `main` promotion evidence is claimed, and Production/field readiness is not increased by V4.71.

## 1. Finance Intake Workflow

V4.70 introduced deterministic expense duplicate/conflict assessment. V4.71 places that assessment into the actual Finance Operations expense-draft workflow.

Before a draft is created, Admin sends vendor, optional invoice/reference, expense date and amount to the existing assessment endpoint. When the server returns exact-duplicate, reference-conflict or similar-expense evidence, the operator sees the matching records and must explicitly confirm that the draft should still be created. The assessment is rerun at submission time; if the matching evidence changes, the prior confirmation is invalidated and a fresh review is required.

The assessment remains non-mutating. Expense approval and posting remain separate permissioned controls; V4.71 does not auto-create journals, payables, approvals or postings.

## 2. Amenity Policy Administration

The Amenity service already enforced advance windows, unit quotas, cooldowns, cancellation cutoffs, check-in/no-show windows, conflict groups and time-band pricing. V4.71 exposes those existing controls in Admin instead of leaving them hidden behind API/default configuration.

Create now supports:
- minimum booking advance;
- maximum advance days;
- maximum future bookings per unit;
- daily bookings per unit;
- cooldown;
- cancellation cutoff;
- check-in-open window;
- no-show grace;
- conflict group;
- one operator-friendly peak time band with either all-days or weekdays-only scope.

Edit exposes the same rule set. The backend remains authoritative and still validates the complete booking-rules contract. V4.71 does not introduce opaque demand pricing or autonomous price optimisation.

## 3. Helpdesk Asset-linked Recurrence

Helpdesk tickets can now optionally link to a non-retired Facility Asset after the resident has raised the complaint.

The link is reviewer-controlled, requires both Helpdesk review and Facilities read permission, and is society-scoped through a composite database foreign key. Asset changes write append-only HelpdeskActivity evidence. Residents are not required to know an internal asset identifier when creating a complaint.

Triage recurrence now prefers same-asset evidence across the society over the prior 90 days when an asset is linked. When no asset is linked, the previous same-unit/category/title evidence remains the fallback.

This is deterministic descriptive evidence only. V4.71 does not infer physical asset condition, auto-create a work order, auto-assign a technician or certify maintenance quality.

## 4. Portfolio Attention Guidance

The V4.70 Portfolio Command Centre already surfaced deterministic society-level attention reasons. V4.71 makes those reasons understandable and operationally actionable.

Each society row shows why attention is elevated. The selected-society view maps those reasons to the owning operational domain—for example Emergency Operations, Facilities, Helpdesk, Finance or Gate.

The platform page deliberately does not deep-link into another society's tenant-scoped workflow. An operator must first switch the active society context, preserving tenant boundaries and normal domain authorization.

## Safety and authority boundaries

- Finance assessment never posts or approves accounting.
- Amenity rules remain server-authoritative.
- Helpdesk asset linkage is optional, reviewer-controlled and tenant-scoped.
- Asset recurrence is descriptive, not predictive.
- Portfolio guidance never mutates tenant operations.
- Existing RBAC, tenant isolation, audit and domain transaction boundaries remain authoritative.

## Verification

V4.71 adds focused coverage for helpdesk asset-linked recurrence and cross-society/retired-asset rejection. Admin migration fixtures include the new Helpdesk asset context so UI migration/accessibility tests fail fast if route contracts drift.

`scripts/check-v4.71-operational-depth-usability.mjs` protects the semantic repository contracts for finance intake review, amenity policy coverage, helpdesk asset linkage and portfolio guidance without coupling regression safety to presentation copy beyond essential operator boundaries.

## External exclusions

V4.71 does not claim:
- hosted staging/production acceptance;
- live payment, telephony, WhatsApp, OCR or hardware certification;
- representative-device human UAT;
- real-society field outcomes;
- legal/statutory acceptance;
- production `GO`;
- `main` promotion.

Those remain outside this repository-only development cycle.
