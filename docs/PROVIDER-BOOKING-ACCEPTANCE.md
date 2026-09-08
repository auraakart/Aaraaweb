# Provider booking queue and acceptance

## Goal

Allow an authenticated, verified external-service provider operator to see bookings for that provider and accept or decline new consumer requests without receiving platform-admin or society permissions.

## Authorization boundary

Provider scope is always derived server-side:

`authenticated User -> active ConsumerProviderOperator -> active VERIFIED ServiceProvider -> provider booking`

The provider client never supplies a trusted provider ID. Booking response queries require both the booking ID and the resolved provider ID before any fulfilment transition is attempted.

## Provider booking queue

`GET /api/v1/provider/services/bookings`

Returns only bookings whose `providerId` matches the authenticated provider. The response intentionally excludes consumer user IDs and platform-only operational fields. It includes the immutable booking delivery-address snapshot because the provider needs the service location to fulfil the booking.

Requested bookings are sorted first, followed by scheduled time.

## Accept or decline

`POST /api/v1/provider/services/bookings/:bookingId/respond`

Body:

- `decision`: `ACCEPT` or `DECLINE`
- `note`: optional provider note

Only `REQUESTED` bookings can be acted on through this endpoint.

- `ACCEPT` -> booking `CONFIRMED`; audit event action `PROVIDER_ACCEPTED`
- `DECLINE` -> booking `CANCELLED`; audit event action `PROVIDER_DECLINED`

The existing transactional fulfilment state machine remains authoritative, including row locking and concurrent-change protection.

## Society-unit compatibility

Provider booking handling remains booking-centric and does not depend on `ConsumerHome`. External-service bookings delivered to a society unit remain ordinary consumer-service bookings; this endpoint grants no gate-entry, society, maintenance, helpdesk, billing or household authority.

The platform fulfilment listing also uses an optional home join so society-unit bookings are not dropped from platform operations.

## Deferred

- provider booking reschedule/counter-offer;
- structured decline/cancellation reason codes;
- provider-agent login;
- provider portal/mobile UX;
- automatic gate-entry creation;
- payout/settlement;
- production payment gateway;
- live GPS and masked calling.
