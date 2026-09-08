# Independent-home service booking

## Objective

Allow an authenticated Aaraagate user who does not belong to a society to book external household services without weakening or reusing society/gate semantics.

## Architectural boundary

Society marketplace bookings currently require `societyId`, `unitId`, and may create gate access requests. Independent homes have none of those concepts. The independent-home path therefore uses a separate consumer booking aggregate instead of making society fields nullable on `ServiceBooking`.

This separation is deliberate:

- society bookings retain tenant isolation and gate integration;
- independent-home bookings remain platform scoped;
- no fake society, unit, or gate records are created;
- provider/offering catalogue data can be shared by both flows;
- future consumer payments can attach to the consumer booking without changing society maintenance/payment logic.

## Domain model

### ConsumerHome

Owned by one Aaraagate user and represents an address used for external services.

Required fields:

- `id`
- `userId`
- `label` (for example Home, Parents' Home)
- `addressLine1`
- optional `addressLine2`
- `locality`
- `city`
- `state`
- `postalCode`
- optional latitude/longitude
- `active`
- timestamps

A user may maintain multiple consumer homes. Address ownership never grants society access.

### ConsumerServiceBooking

Platform-scoped service booking with:

- `id`
- `userId`
- `homeId`
- `providerId`
- `offeringId`
- booking status
- scheduled start/end
- snapshotted service price
- optional notes
- timestamps

It must not contain `societyId`, `unitId`, or `accessRequestId`.

The existing `ServiceBookingStatus` lifecycle may be reused initially: `REQUESTED`, `CONFIRMED`, `CANCELLED`, `IN_PROGRESS`, `COMPLETED`.

## API contract

All endpoints require a valid bearer session but do not require `TenantGuard`.

- `GET /api/v1/consumer/homes`
- `POST /api/v1/consumer/homes`
- `PATCH /api/v1/consumer/homes/:id`
- `GET /api/v1/consumer/services/bookings`
- `POST /api/v1/consumer/services/bookings`
- `POST /api/v1/consumer/services/bookings/:id/cancel`

Every home and booking query is scoped by authenticated `userId` from the bearer session. A client-supplied user id is never accepted.

## Booking validation

Creation must verify all of the following server-side:

1. the selected home belongs to the authenticated user and is active;
2. the offering is active;
3. the provider is active and verified;
4. scheduled start is in the future;
5. scheduled end is after scheduled start;
6. the booking price is copied from the offering on creation rather than trusted from the client.

## Provider availability

Provider scheduling/capacity is intentionally not introduced in this slice. The first version creates a request that providers/operations can confirm. Availability rules can be added later without changing the identity boundary.

## Mobile UX

Independent-home navigation remains intentionally small:

1. External Services catalogue
2. Select service
3. Select/add Home address
4. Choose schedule
5. Review and request booking
6. My Bookings

No society navigation is rendered in this context.

## Security invariants

- Independent-home endpoints never infer or accept a society context.
- Society endpoints continue to require their existing tenant guards.
- Consumer homes/bookings are always filtered by the authenticated user.
- Provider and offering IDs are revalidated on every booking mutation.
- Switching between society contexts does not expose independent consumer data through society APIs.

## Deferred items

The following are deliberately outside this milestone:

- infrastructure/provider hosting decisions;
- online payment gateway integration;
- provider payout/commission settlement;
- geospatial provider coverage/radius matching;
- consumer ratings/reviews;
- coupons/promotions;
- provider calendar/capacity optimisation.
