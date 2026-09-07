# Consumer serviceability and availability

## Objective

Prevent independent-home consumers from requesting services that a provider cannot actually serve at the selected home or requested time, without introducing expensive geospatial infrastructure or coupling independent bookings to society/gate concepts.

## Product decision

The first production-safe serviceability model is PIN-code based, with provider-level service areas and offering-level weekly availability windows.

This is intentionally simpler than radius/polygon geospatial matching, but remains explicit, auditable, and cheap to operate. Latitude/longitude remain available on `ConsumerHome` for a later geospatial upgrade without changing the booking ownership model.

## Architecture boundary

The independent-home path remains:

`User -> ConsumerHome -> ServiceOffering -> Provider service area -> Offering availability -> ConsumerServiceBooking`

It must not require or infer `societyId`, `unitId`, society provider approval, gate access, or society payment records.

## Service areas

A provider may serve one or more Indian postal codes.

`ConsumerProviderServiceArea` fields:

- id
- providerId
- postalCode
- active
- createdAt
- updatedAt

Rules:

- uniqueness on provider + postalCode;
- only active areas are serviceable;
- provider must also be active and VERIFIED;
- postal code is normalized before persistence/comparison;
- an offering is serviceable only when its provider covers the selected ConsumerHome postal code.

Provider-level coverage is used in this milestone so multiple offerings from the same provider do not duplicate coverage rows. Offering-specific coverage can be added later only if a real product need appears.

## Weekly availability

`ConsumerOfferingAvailabilityWindow` defines recurring weekly windows for an offering:

- id
- offeringId
- dayOfWeek (`0` Sunday through `6` Saturday)
- startMinute (minutes after local midnight)
- endMinute
- slotCapacity
- active
- createdAt
- updatedAt

Rules:

- `startMinute < endMinute`;
- values remain within one local calendar day;
- `slotCapacity >= 1`;
- booking start/end must fit fully inside one active availability window;
- booking duration continues to come from the selected offering/client request contract already validated by the booking service;
- booking capacity is calculated from non-cancelled consumer bookings overlapping the requested interval;
- `CANCELLED` bookings do not consume capacity.

The first implementation uses the home's local India time assumption for PIN-code serviceability (`Asia/Kolkata`). Multi-country timezone support is deferred until the product expands outside India.

## Booking eligibility

Booking creation must validate, in this order:

1. authenticated user owns the active ConsumerHome;
2. offering is active;
3. provider is active and VERIFIED;
4. provider has an active service-area row for the home's postal code;
5. requested interval is in the future and structurally valid;
6. requested interval fits an active weekly availability window;
7. overlapping active bookings are below that window's slot capacity;
8. provider/offering/price/address snapshots are then persisted server-side.

The client cannot override provider identity, price, coverage, capacity, or availability.

## Consumer API

The catalogue may remain broadly browsable, but before booking the Resident app should be able to check eligibility for the selected home and date/time.

Planned endpoints:

- `GET /api/v1/consumer/services/offerings/:offeringId/availability?homeId=...&date=YYYY-MM-DD`
- booking creation continues through `POST /api/v1/consumer/services/bookings` and repeats all eligibility checks server-side.

The availability endpoint is advisory UX. The booking mutation is authoritative and must revalidate to prevent stale availability/race conditions.

## Platform operations API

Provider coverage and availability configuration are platform operations in this milestone and reuse platform authentication/permissions. Provider self-service configuration remains deferred until provider authentication exists.

Planned endpoints:

- list/add/deactivate provider service-area postal codes;
- list/add/update/deactivate offering availability windows.

## Concurrency

Availability display can become stale. Capacity enforcement must therefore occur inside the booking creation transaction. The implementation should lock the selected availability window while counting overlapping bookings and inserting the booking so two simultaneous requests cannot exceed `slotCapacity`.

## Resident UX

Flow:

`Service -> Home -> available date/time -> review -> request`

UX requirements:

- clearly state when the provider does not serve the selected PIN code;
- show only eligible time windows for the chosen date;
- if a slot becomes unavailable during submission, return a clear refresh/select-another-time message;
- do not expose platform configuration controls in the Resident app.

## Tests

Required regression coverage:

- serviceable postal code accepted;
- uncovered postal code rejected;
- inactive service area rejected;
- inactive/unverified provider rejected;
- request outside weekly window rejected;
- request crossing window boundary rejected;
- slot capacity enforced;
- cancelled bookings excluded from capacity;
- authenticated ConsumerHome ownership still enforced;
- no society identifiers introduced;
- platform configuration permissions do not leak to society/resident/guard/vendor roles.

## Deferred

- radius/polygon geospatial matching;
- travel-time routing;
- provider-specific timezone support outside India;
- exceptional-date/holiday blackout rules;
- provider self-service authentication;
- dynamic pricing;
- payments/payouts;
- coupons/promotions;
- ratings/reviews;
- infrastructure/hosting decisions.
