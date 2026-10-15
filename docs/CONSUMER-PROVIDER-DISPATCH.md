# Consumer provider assignment and dispatch

## Objective

Add an auditable operational assignment layer between an independent-home consumer booking and the provider person who will actually attend the job, without coupling the flow to society staff, gate access or provider self-service authentication.

## Architecture boundary

`User -> ConsumerServiceBooking -> ServiceProvider -> ConsumerProviderAgent -> ConsumerServiceAssignment`

This remains outside society/unit/gate concepts. Provider agents are marketplace-operational identities, not Aaraagate login principals in this milestone.

## Provider agent roster

A verified platform provider may have active field agents with a display name and optional operational phone/external reference. Platform operations manages this roster until provider authentication is introduced.

Agent phone is platform-operational data and is not returned by the consumer dispatch endpoint in this milestone.

## Assignment lifecycle

`ASSIGNED -> ACCEPTED -> EN_ROUTE -> ARRIVED`

Exit branches:

- `ASSIGNED -> REJECTED`
- `ASSIGNED|ACCEPTED|EN_ROUTE|ARRIVED -> RELEASED`

Rejected/released assignments stop being active and allow a new assignment to be created. Only one active assignment may exist for a booking at a time.

## Assignment rules

- booking must belong to the same provider as the selected agent;
- provider must be active and VERIFIED;
- agent must be active;
- booking must be `CONFIRMED` when a new assignment is created;
- assignment and transitions are serialized with row locking;
- stale expected-state updates are rejected;
- every mutation appends an assignment event;
- consumer cannot assign, accept, reject or dispatch an agent.

## Privacy

Consumer read access is ownership-scoped through Bearer authentication and returns only the active assignment's safe status information: agent display name, provider/business identity, dispatch status and timestamps. Agent phone, external references and platform actor IDs remain hidden.

## Platform API

Platform operations receives dedicated dispatch permissions rather than society permissions:

- `PLATFORM_CONSUMER_DISPATCH_READ`
- `PLATFORM_CONSUMER_DISPATCH_MANAGE`

Planned endpoints:

- list/create/update provider agents;
- list booking assignments;
- assign an agent to a confirmed booking;
- transition assignment dispatch state;
- inspect assignment events.

## Consumer API

`GET /api/v1/consumer/services/bookings/:bookingId/dispatch`

The endpoint is read-only and verifies booking ownership server-side.

## Deliberate separation from fulfilment

Booking fulfilment remains the service outcome state machine (`REQUESTED/CONFIRMED/IN_PROGRESS/COMPLETED/CANCELLED`). Dispatch describes who is attending and where they are operationally. This milestone does not automatically mutate booking fulfilment from assignment transitions; the two state machines remain explicit and auditable.

## Tests

Required coverage:

- agent provider must match booking provider;
- inactive agent/provider rejected;
- unverified provider rejected;
- only confirmed booking can receive a new assignment;
- only one active assignment per booking;
- invalid dispatch transitions rejected;
- transition concurrency protected;
- consumer read is booking-owner scoped;
- consumer response does not expose agent phone/external reference/actor IDs;
- society/resident/guard/vendor roles do not inherit platform dispatch permissions;
- no society/unit/gate identifiers introduced.

## Deferred

- provider/agent login and self-service acceptance;
- live GPS/location sharing;
- consumer-to-agent calling or masked telephony;
- automatic ETA/routing;
- gate-entry linkage;
- workforce payroll/attendance;
- provider payout/settlement;
- infrastructure decisions.
