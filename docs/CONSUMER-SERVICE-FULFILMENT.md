# Consumer service fulfilment

## Objective

Extend the independent-home consumer booking foundation with a safe platform-operations fulfilment lifecycle without coupling consumer bookings to society, unit, gate, or society-payment concepts.

## Scope

This milestone covers the lifecycle after an independent-home consumer creates a `ConsumerServiceBooking`.

Supported state flow:

`REQUESTED -> CONFIRMED -> IN_PROGRESS -> COMPLETED`

Cancellation is permitted only from `REQUESTED` or `CONFIRMED`.

## Architectural boundary

Consumer fulfilment is platform-scoped. It must not create, require, or infer `societyId`, `unitId`, `accessRequestId`, society provider approval, gate access records, or society maintenance/payment records. The existing society `ServiceBooking` workflow remains unchanged.

## Actor model

Every fulfilment mutation derives the actor from the authenticated bearer principal. The API never accepts a client-supplied actor user id.

The first implementation is intentionally platform-operations only. It introduces dedicated permissions:

- `PLATFORM_CONSUMER_BOOKING_READ`
- `PLATFORM_CONSUMER_BOOKING_FULFIL`

Only `SUPER_ADMIN` inherits these permissions today. Society-admin, resident, guard, staff and vendor roles do not receive them. Provider self-service identity remains deferred until a safe provider-auth principal exists.

## Transition policy

The service layer owns allowed state transitions. Controllers never update booking status directly.

Allowed transitions:

- `REQUESTED -> CONFIRMED`
- `REQUESTED -> CANCELLED`
- `CONFIRMED -> IN_PROGRESS`
- `CONFIRMED -> CANCELLED`
- `IN_PROGRESS -> COMPLETED`

Terminal states do not transition further.

Every operations transition executes inside a database transaction, locks the booking row, validates the current state, performs a conditional status update, and appends an event. A stale conditional update is rejected rather than silently overwriting concurrent work.

## Fulfilment events

`ConsumerServiceBookingEvent` is an append-only audit table containing:

- booking id
- authenticated actor user id
- action
- from status
- to status
- optional note
- occurred-at timestamp

Consumer-initiated cancellation is also recorded as a fulfilment event, so the audit trail does not have an unexplained terminal state.

## Platform API

All routes below require bearer authentication plus the dedicated platform permission:

- `GET /api/v1/platform/services/consumer-bookings`
- `GET /api/v1/platform/services/consumer-bookings/:bookingId`
- `GET /api/v1/platform/services/consumer-bookings/:bookingId/events`
- `POST /api/v1/platform/services/consumer-bookings/:bookingId/status`

The status mutation accepts a target status and optional note, but only the server transition policy determines whether the requested transition is legal.

## Resident API and UX

Resident access remains authenticated-user scoped:

- `GET /api/v1/consumer/services/bookings`
- `GET /api/v1/consumer/services/bookings/:id/events`
- `POST /api/v1/consumer/services/bookings/:id/cancel`

The event query joins through `ConsumerServiceBooking.userId`, preventing a consumer from reading another consumer's timeline by changing a booking id.

The Resident **My Bookings** screen supports a read-only status timeline. Operations controls are never rendered in the Resident app.

## Security invariants

- Consumer bookings remain scoped to their consumer owner for resident reads and cancellation.
- Fulfilment mutations require a separate platform-only permission.
- Client-supplied actor ids are never trusted.
- Client-supplied booking status is never persisted without server transition validation.
- State transition validation and update occur in one transaction.
- Consumer fulfilment does not grant society access.
- No society marketplace, gate, Guard, or Admin access boundary is weakened.
- Existing immutable booking snapshots remain the source for historical service/provider/address details.

## Tests

Coverage includes:

- valid confirmation and event creation
- invalid transition rejection
- terminal-state protection
- stale/concurrent update rejection
- unknown booking rejection
- platform-only permission boundaries
- consumer event-history ownership scoping
- cross-user cancellation rejection
- consumer cancellation event creation
- existing consumer booking snapshot and price protections

Full repository regression CI remains the merge gate.

## Deferred

The following remain outside this milestone:

- provider self-service authentication and provider-specific booking queues
- online payments
- provider payout/commission settlement
- geospatial service coverage
- coupons/promotions
- ratings/reviews
- provider calendar/capacity optimisation
- infrastructure/hosting decisions
