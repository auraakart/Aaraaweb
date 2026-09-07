# Provider Dispatch Self-Service

## Objective

Allow an authenticated verified external-service provider operator to manage its operational agent roster and dispatch confirmed consumer bookings without receiving platform-admin or society permissions.

## Authorization boundary

Provider identity is never accepted from provider-client input. Every action resolves:

`authenticated User -> active ConsumerProviderOperator -> active VERIFIED ServiceProvider`

Booking and assignment operations then prove that the target row belongs to that resolved provider before invoking the shared dispatch engine.

A user may simultaneously be a society resident and a provider operator. These are independent authorization domains; provider dispatch endpoints do not use TenantGuard and do not grant access to society gate, maintenance, household, helpdesk or administrative data.

## Provider operations

Provider operators can:

- list their provider's operational agents;
- add operational agents;
- activate/deactivate their agents, subject to the existing active-assignment guard;
- view assignment history for their own bookings;
- assign an active provider agent to a confirmed booking;
- record dispatch transitions through the existing assignment state machine.

The operational agent remains a roster identity, not an authenticated Aaraagate principal. Agent login/self-service is intentionally deferred.

## Dispatch state machine

The existing shared state machine remains authoritative:

- `ASSIGNED -> ACCEPTED | REJECTED | RELEASED`
- `ACCEPTED -> EN_ROUTE | RELEASED`
- `EN_ROUTE -> ARRIVED | RELEASED`
- `ARRIVED -> RELEASED`
- `REJECTED` and `RELEASED` are terminal.

All transitions retain transactional row locking, conditional updates and append-only assignment events.

## Consumer privacy

The existing consumer dispatch endpoint remains unchanged and returns only safe fields such as assignment status, timestamps, agent display name and provider name. Agent phone, external references and internal operator identifiers remain excluded from the consumer response.

## Society-unit delivery

External-service bookings delivered to a society unit follow the same provider dispatch flow as independent-home bookings. Dispatch does not create gate-entry authority or expose society-only information.

## Deferred

- authenticated provider-agent accounts;
- per-agent permissions;
- live GPS tracking;
- masked calling;
- automatic society gate-entry creation;
- payroll/attendance for external-service agents;
- payout/settlement and production payment gateway integration.
