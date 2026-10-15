# Provider dispatch management

## Purpose

Verified external-service provider operators can manage their own field-agent roster and dispatch confirmed consumer bookings without receiving platform-admin or society permissions.

## Authorization boundary

Provider scope is always resolved server-side:

`authenticated Aaraagate user -> active ConsumerProviderOperator -> active VERIFIED ServiceProvider`

Provider-facing dispatch endpoints do not accept a trusted provider ID. Every booking and assignment action is checked against the resolved provider before the shared dispatch service is invoked.

This authorization domain remains separate from society tenancy, gate access, maintenance, helpdesk, household and other society features.

## Provider operations

A provider operator can:

- list its field agents;
- create a field-agent roster entry;
- activate or deactivate its own roster entries, subject to the existing active-assignment guard;
- list assignments for one of its own bookings;
- assign an active field agent to one of its own CONFIRMED bookings;
- view events for one of its own assignments;
- record dispatch transitions for one of its own assignments.

The existing dispatch state machine remains authoritative:

`ASSIGNED -> ACCEPTED | REJECTED | RELEASED`

`ACCEPTED -> EN_ROUTE | RELEASED`

`EN_ROUTE -> ARRIVED | RELEASED`

`ARRIVED -> RELEASED`

Rejected and released assignments are terminal. A later reassignment may be created using the existing active-assignment uniqueness rules.

## Actor semantics

In this milestone the authenticated provider operator is the audit actor for roster, assignment and dispatch actions. A `ConsumerProviderAgent` is still an operational roster identity, not an authenticated Aaraagate principal. The API therefore does not pretend that the field agent personally logged in or performed a transition.

A dedicated field-agent identity/login model is intentionally deferred until it can be introduced with explicit identity mapping and least-privilege authorization.

## Consumer privacy

Consumer-facing dispatch remains unchanged and continues to expose only safe status/timestamp fields, provider name and agent display name. Provider dispatch operations do not grant any society or gate authority.

## Deferred

- field-agent login/self-service identity;
- live GPS tracking;
- masked calling;
- automatic society gate-entry linkage;
- dispatch push notifications;
- provider portal UI;
- route optimization.
