# Aaraagate V4.86 — Adoption & Competitive Readiness

## Goal

Close high-value adoption gaps identified in the Indian society-app comparison without duplicating capabilities already delivered in V4.51–V4.85.

Hosting/provider deployment work is explicitly **on hold** in this milestone. V4.86 does not change Host.co.in, E2E, AIC, DigitalOcean or production infrastructure.

## Delivered slices

### 1. Resident Easy Mode
- Adds a device-local Easy mode preference in Resident Profile.
- Easy mode increases text scale and navigation-control size while retaining every existing feature.
- The preference is stored on the device and never changes authorization, entitlements or property scope.
- Existing eight-language voice drafting remains the voice/vernacular foundation; V4.86 does not create a second localization engine.

### 2. Gate fallback readiness evidence
- Existing push → IVR simulator/manual fallback remains authoritative.
- Society reports now expose aggregate queued-push, simulated-IVR, manual-fallback and missing-phone counts for the selected period.
- The metric is delivery/readiness evidence only and cannot approve access, infer identity or claim a live telephony integration.

### 3. Finance interoperability
- Accounting exports add `TALLY_CSV`, a deterministic Tally-friendly journal mapping.
- The export preserves the immutable accounting export job/artifact/audit pipeline and remains society scoped.
- Tally-friendly CSV is an accountant/import-mapping aid. It does not connect to, post into or rewrite Tally data automatically.

### 4. Resident activation onboarding
- Society onboarding now derives an eligible activation cohort from current occupants plus active verified owners.
- Readiness distinguishes no cohort, no activation yet and an activated pilot cohort.
- Activation is proven by normal society-scoped sessions; Aaraagate never creates shared/default resident credentials.
- Reports remain the aggregate adoption evidence surface.

### 5. Trust transparency
- Resident Privacy & data use explicitly separates commercial Featured/Sponsored placement from verification, Society Trusted evidence, society approval and resident ratings.
- It also states that server-scoped/audited controls are product controls rather than an external certification claim.

### 6. Pilot KPI evidence
- Existing operational outcomes remain the single KPI source.
- V4.86 adds gate-fallback readiness alongside visitor processing, Guard offline recovery, helpdesk SLA, collection, amenities, service conversion and resident activation.
- No individual resident behavioral trace or ranking is introduced.

## Boundaries

V4.86 does not:
- activate a live IVR provider;
- add a second booking, payment, accounting, migration, analytics or trust engine;
- claim automatic Tally import/posting;
- create shared/default resident credentials;
- claim external security/privacy certification;
- change hosting or productionization;
- change owner/current-occupant gate or payment authority.

## Release identity

- Root/API/Admin: 4.86.0
- Resident/Guard: 4.86.0+48600
