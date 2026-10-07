# Aaraagate V4.85 — Community Services 3.0

Date: 2026-10-07

## Objective

Turn Services/Insta Services into a stronger gated-community differentiator without creating another marketplace, payment ledger, booking engine or gate-authority path.

V4.85 builds on the existing verified-provider, offers, availability, booking, dispatch, payment-readiness, service-history, warranty/revisit and gate-linked fulfilment foundations.

## Delivery sequence

### 1. Society Trusted

A provider can earn **Society Trusted** from local operational evidence. It is never purchasable and remains separate from Featured/Sponsored promotion.

Initial fail-closed threshold:

- at least 5 completed jobs in the society;
- at least 3 resident ratings;
- average local rating at least 4.2;
- terminal-job cancellation rate no greater than 15%;
- once at least 3 gate-arrival observations exist, at least 80% must be within 30 minutes after the scheduled start.

The UI must show the underlying local completed-job/rating evidence rather than presenting the badge as a generic endorsement.

### 2. Transparent service promise

ServiceOfferingExperiencePolicy adds provider-controlled, offering-scoped disclosure for:

- work included in the listed price;
- parts/material policy;
- whether extra work requires explicit resident approval;
- quick-service eligibility and a bounded target-arrival duration;
- supported recurring cadences.

The current immutable booking price snapshot remains authoritative. V4.85 does not add an unapproved post-booking price mutation path.

### 3. Service guarantee

Existing ServiceOfferingContinuityPolicy, completion evidence, immutable warranty snapshot and revisit metadata remain the source of truth. Resident storefronts surface these more prominently alongside the V4.85 service promise.

### 4. Recurring service plans

Residents can save an active/paused/cancelled recurring preference for a service/location using provider-enabled weekly, fortnightly, monthly or quarterly cadence.

A recurring plan is **not an automatic booking, payment mandate or payroll record**. It is a resident-owned continuity preference for reminders/rebooking orchestration. Every future booking and payment continues to require the existing authoritative workflow.

### 5. Community deals / Society Service Day

Society operators can publish an offering-specific campaign with:

- join deadline and service date;
- minimum-home threshold;
- optional maximum homes;
- society resident price not higher than the normal offering price.

A society home can contribute at most one active interest record to a campaign. Joining a deal does not create a service booking or gate credential; booking fulfilment remains separate and explicit.

### 6. Quick-service readiness

Providers can mark an offering Quick-eligible with a 15–240 minute target. This is a provider-configured service target, **not GPS/live-tracking evidence and not a guaranteed arrival claim**. Existing availability, provider acceptance, dispatch and gate evidence remain authoritative.

## Architecture invariants

- No parallel provider catalogue, booking ledger, payment record or gate access model.
- Society/consumer location authorization remains server-side.
- Society Trusted is derived only from society-scoped booking, rating and gate evidence.
- Featured/Sponsored commercial placement never changes Society Trusted.
- Community-deal participation is household-unit scoped and validated against current ownership/occupancy access.
- Recurring preferences never autonomously book or charge.
- No GPS, masked calling, real payment settlement, live KYC, insurance underwriting or field/provider certification is claimed by this milestone.

## Release identity

- Root/API/Admin: 4.85.0
- Resident/Guard: 4.85.0+48500

Staging and main promotion remain separate release actions.
