# Consumer service fulfilment

## Objective

Extend the independent-home consumer booking foundation with a provider/operations fulfilment lifecycle without coupling consumer bookings to society, unit, gate, or society-payment concepts.

## Scope

This milestone covers the lifecycle after an independent-home consumer creates a `ConsumerServiceBooking`.

Initial state flow:

`REQUESTED -> CONFIRMED -> IN_PROGRESS -> COMPLETED`

Cancellation remains allowed only where explicitly permitted by the server-side transition policy.

## Architectural boundary

Consumer fulfilment is platform-scoped.

It must not create, require, or infer:

- `societyId`
- `unitId`
- `accessRequestId`
- society provider approval
- gate access records
- society maintenance/payment records

The existing society `ServiceBooking` workflow remains unchanged.

## Actor model

Every state mutation must be authorised from the authenticated principal and validated server-side. The API must never trust a client-supplied actor user id.

The first implementation may expose fulfilment actions through platform operations/admin capability already present in the services marketplace. Provider self-service identity is not introduced unless an existing provider-auth principal can be reused safely.

## Transition policy

The service layer owns allowed state transitions. Controllers must not update booking status directly.

Baseline transitions:

- `REQUESTED -> CONFIRMED`
- `REQUESTED -> CANCELLED`
- `CONFIRMED -> IN_PROGRESS`
- `CONFIRMED -> CANCELLED` where cancellation is still allowed
- `IN_PROGRESS -> COMPLETED`

Terminal states do not transition further in this milestone.

Invalid or stale transitions must be rejected even when the caller is otherwise authorised.

## Fulfilment events

Status changes should be recorded as append-only events containing at least:

- booking id
- actor user id
- action
- from status
- to status
- optional note
- occurred-at timestamp

Event history is audit information and must not be rewritten when catalogue or consumer-home data changes.

## API shape

The exact route names should follow the existing services-platform/admin conventions after code inspection. The implementation must support:

- operations/provider-facing consumer booking list
- consumer booking detail
- confirm
- start service
- complete service
- authorised cancellation
- fulfilment event history

Resident APIs remain user-scoped and may expose the current status/event timeline read-only.

## Security invariants

- Consumer bookings remain scoped to their consumer owner for resident reads and cancellation.
- Fulfilment mutations require a separately authorised operations/provider capability.
- Client-supplied booking status is never persisted directly.
- State transitions are validated against the current database status in the same mutation path.
- No consumer fulfilment action grants society access.
- No society marketplace, gate, Guard, or Admin access boundary is weakened.

## Concurrency and integrity

Status transitions should be implemented atomically so two actors cannot successfully apply conflicting transitions from the same prior status.

Where raw SQL is used, the `UPDATE` must include the expected current status in its predicate and return no row when the booking changed concurrently.

## Resident UX

The resident booking history should continue to show the immutable booking snapshots created at request time and add clear status progression. A detail/timeline view can be added without exposing operations-only controls.

## Tests

At minimum cover:

- valid transition sequence
- invalid transition rejection
- stale/concurrent transition rejection
- terminal state protection
- consumer cannot invoke operations fulfilment actions
- unrelated consumer cannot read/cancel another consumer booking
- existing society marketplace regression

## Deferred

The following remain outside this milestone:

- online payments
- provider payout/commission settlement
- geospatial service coverage
- coupons/promotions
- ratings/reviews
- provider calendar/capacity optimisation
- infrastructure/hosting decisions
