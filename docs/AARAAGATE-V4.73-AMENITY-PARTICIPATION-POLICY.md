# Aaraagate V4.73 — Amenity Participation Policy

Date: 2026-09-28  
Baseline: `develop@e0db18a08c20f3a0d548ca0e4932461f6dfc9d46`

## Objective

V4.73 closes a remaining repository-only amenity gap: residents can include a bounded number of guests/companions in an amenity booking, and the same participation count survives waitlisting and promotion.

**Productionization remains explicitly excluded.** This cycle does not include hosted deployment, live payment/refund providers, field-pilot evidence, staging/main promotion or a production-readiness increase.

## 1. Guest/Companion Count Policy

Each amenity may configure `maxGuestsPerBooking` from 0 through 50.

- Missing or zero policy means residents only: guest count must be 0.
- A positive policy permits the resident to choose any count from 0 through the configured maximum.
- API DTO validation and service validation both bound submitted guest counts to 0–50.
- Database check constraints protect both bookings and waitlist entries from invalid stored counts.

Admin can configure and edit the maximum guest count alongside the existing advance-window, quota, cooldown, cancellation, check-in/no-show, conflict-group and pricing policies.

## 2. Privacy-minimal participation

V4.73 stores only the **number of guests** attached to a booking/waitlist entry.

Guest names, phone numbers, identifiers, documents, age, gender and other personal details are not collected by the amenity booking workflow. Resident UI states this directly at booking time.

This keeps the feature useful for capacity/policy enforcement without creating an unnecessary guest-identity dataset.

## 3. Waitlist continuity

Guest count is part of the direct-booking idempotency payload and is persisted on waitlist entries.

If a full slot is joined with guests:
- the exact guest count is shown in the resident waitlist;
- promotion copies that count into the resulting booking;
- promotion checks the amenity's current guest policy;
- a booking retry with the same idempotency key but a different guest count is rejected as a different payload.

Admin cannot reduce `maxGuestsPerBooking` below the guest count already required by future active bookings or future waiting entries. This avoids creating waitlist entries that can never become eligible after a policy change.

## 4. Resident and Admin visibility

Residents can:
- see whether an amenity allows guests;
- choose a guest count using bounded controls;
- see the guest count on their booking and waitlist cards.

Admin can:
- configure the per-booking guest maximum;
- see the policy in the amenity summary;
- see guest count while reviewing pending requests and recent booking activity.

## 5. Financial boundary

**Refundable deposits are explicitly deferred.**

The repository has payment and accounting domains, but V4.73 does not introduce a synthetic deposit balance or pretend that a refundable deposit is settled without a real authorization/capture/refund lifecycle. A future deposit feature must reuse authoritative payment/accounting truth and explicit refund evidence.

## Safety and authority boundaries

- Amenity policy remains server-authoritative.
- Guest count cannot exceed 50 or the amenity-specific maximum.
- Guest identities are not collected.
- Waitlist promotion preserves the original guest count.
- Policy reduction cannot invalidate existing future participation silently.
- No autonomous pricing, refund, payment or approval behavior is introduced.

## Verification

Focused coverage includes:
- guest-disabled rejection;
- configured guest-limit rejection;
- guest count as part of idempotent booking identity;
- Resident repository booking/waitlist payload continuity;
- database check constraints;
- semantic V4.73 CI contracts for Resident/Admin/server policy boundaries.

`scripts/check-v4.73-amenity-participation-policy.mjs` protects these behaviors without coupling regression safety to incidental UI wording beyond the privacy and financial boundaries.

## External exclusions

V4.73 does not claim:
- refundable-deposit execution;
- payment/refund provider acceptance;
- hosted staging or production acceptance;
- physical facility or human UAT evidence;
- real-society outcome improvements;
- staging or `main` promotion.

Those remain outside this repository-only cycle.
