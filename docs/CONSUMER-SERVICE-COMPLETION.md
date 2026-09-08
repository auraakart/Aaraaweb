# Consumer service completion handoff

## Objective

Close the external-service operational loop without conflating provider dispatch state, booking fulfilment state, payment state or society access.

## Flow

1. Provider agent accepts the assignment and progresses through dispatch until `ARRIVED`.
2. The authenticated linked agent starts service. This moves the booking from `CONFIRMED` to `IN_PROGRESS` and writes `AGENT_STARTED_SERVICE` to the booking audit trail.
3. After the work is done, the same authenticated agent requests completion. The assignment remains `ARRIVED`; an append-only `COMPLETION_REQUESTED` assignment event records the handoff.
4. The booking owner reads the completion state and explicitly confirms completion.
5. Customer confirmation atomically moves the booking from `IN_PROGRESS` to `COMPLETED`, releases the arrived assignment, and writes both booking and assignment audit events with `CUSTOMER_CONFIRMED_COMPLETION`.

## Authorization

Agent-side scope is derived only from:

`authenticated user -> active ConsumerProviderAgentIdentity -> active ConsumerProviderAgent -> active VERIFIED ServiceProvider -> owned assignment`

Consumer-side scope is derived only from `ConsumerServiceBooking.userId`.

No provider ID, agent ID, society ID or tenant scope is trusted from the client for authorization.

## API

Provider agent:

- `POST /provider-agent/services/assignments/:assignmentId/start-service`
- `POST /provider-agent/services/assignments/:assignmentId/request-completion`

Consumer:

- `GET /consumer/services/bookings/:id/completion`
- `POST /consumer/services/bookings/:id/completion/confirm`

All UUID route parameters are validated with `ParseUUIDPipe`.

## State boundaries

Dispatch and booking fulfilment remain separate state machines. `ARRIVED` does not itself complete a booking. Starting work changes the booking to `IN_PROGRESS`. Requesting completion does not mutate booking status. Only explicit booking-owner confirmation changes the booking to `COMPLETED`.

Customer confirmation also releases the arrived assignment in the same database transaction, preventing a completed booking from retaining an active field-agent assignment.

Payment state is intentionally unchanged. This milestone does not invent payment capture, payout, settlement, cancellation charges, disputes, refunds, commissions or taxes.

## Society isolation

The completion path is Bearer-authenticated external-marketplace functionality. It does not use `TenantGuard`, does not grant society or gate permissions, and works identically whether the service delivery location is an independent home or a society unit.

## Deferred

Completion rejection/dispute workflow, proof-of-work media, OTP/signature confirmation, ratings/reviews, push notifications, GPS/ETA, masked calling, automatic society gate-entry linkage, provider payouts and production payment-gateway behavior remain separate milestones.
