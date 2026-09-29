# Aaraagate V4.77 — Amenity No-Show Fair-Use Policy

Date: 2026-09-28  
Baseline: `develop@0d5930fad764f8485324e101c421560634a15edf`

## Objective

V4.77 closes the remaining software-only amenity no-show consequence gap without introducing deposits, refunds or financial penalties.

**Productionization remains explicitly excluded.**

## Policy model

The existing `Amenity.bookingRules` authority gains three optional fields:

- `noShowRestrictionCount` — qualifying no-shows required before a pause;
- `noShowLookbackDays` — history window;
- `noShowBlockDays` — pause duration measured from the latest qualifying no-show.

All three fields must be configured together. Bounds are 1–10 no-shows, 1–365 lookback days and 1–365 pause days.

**Disabled by default:** if the three fields are absent, booking behavior is unchanged.

## Resident-specific, not household-wide

The rule evaluates authoritative `NO_SHOW` bookings for the same society, amenity and resident user.

A tenant/owner/household member is not blocked merely because another resident of the same unit missed a booking. This preserves household fairness while still making the resident who created repeated no-shows accountable.

## Direct booking, waitlist and promotion parity

The same eligibility rule applies to:

1. new direct bookings;
2. new waitlist joins;
3. FIFO waitlist promotion.

Promotion remains deterministic FIFO among **currently eligible** residents. A temporarily restricted waiter is skipped while the pause is active and remains in the waiting state; once the pause expires, that entry may become eligible again.

Exact idempotent retries of an already-created booking still return the existing booking before new eligibility is evaluated.

## Race and database safety

Booking and waitlist flows already serialize on the amenity advisory lock. V4.77 also places no-show finalization under that same amenity lock so a newly authoritative no-show and a new booking request cannot cross without deterministic ordering.

PostgreSQL trigger guards provide defense in depth for new `AmenityBooking` and `AmenityWaitlistEntry` inserts based on the same configured rule.

## No financial penalty

V4.77 never:

- posts a fee;
- changes a ledger;
- captures/refunds a payment;
- cancels an existing booking;
- removes an existing waitlist entry.

It only pauses **new** booking/waitlist eligibility while the configured period is active.

Financial no-show charges, amenity deposits and refund execution remain separate future work that must reuse authoritative payment/accounting truth.

## Admin and Resident UX

Admin can configure the threshold, lookback and pause duration alongside existing amenity policy controls. Partial policy configuration is rejected.

Resident amenity cards and the booking sheet disclose the configured fair-use rule before booking. The UI does not claim the resident is currently restricted; the server remains authoritative at submit/promotion time.

## Verification

Focused tests cover:

- partial-policy rejection;
- active resident-specific booking pause;
- booking after the pause expires.

The V4.77 semantic CI contract additionally protects waitlist-promotion filtering, database trigger guards, Admin policy controls, Resident disclosure and non-financial boundaries.

## External exclusions

No real-society policy acceptance, payment/refund execution, physical check-in evidence, hosted production acceptance, staging/main promotion or production-readiness increase is claimed.
