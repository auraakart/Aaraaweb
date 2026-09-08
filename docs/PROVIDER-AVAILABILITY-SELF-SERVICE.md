# Provider Availability Self-Service

## Goal

Allow a verified external-service provider operator to maintain weekly availability and capacity for offerings owned by that provider, without receiving society or platform-administrator privileges.

## Authorization boundary

Provider identity is resolved from the authenticated Aaraagate user through `ConsumerProviderOperator`. Provider-facing APIs never accept a trusted provider ID from the client. Every availability read or mutation first proves that the requested offering belongs to the authenticated operator's active, VERIFIED provider.

A user may simultaneously be a society resident and a provider operator. These authorization domains remain independent; provider self-service does not grant TenantGuard access, society permissions, gate authority, maintenance access, or household access.

## API

Provider routes are under `/api/v1/provider/services` and require Bearer authentication.

- `GET /offerings/:offeringId/availability-windows`
- `POST /offerings/:offeringId/availability-windows`
- `PATCH /offerings/:offeringId/availability-windows/:windowId`

The existing availability engine remains authoritative for validation, overlap checks, active windows, slot capacity, and booking-time capacity enforcement. Provider self-service reuses that engine instead of introducing a second scheduling model.

## Window model

A recurring weekly window contains:

- `dayOfWeek` from 0 to 6;
- `startMinute` and `endMinute` in the local service day;
- `slotCapacity` of at least 1;
- `active` flag.

Overlapping active windows for the same offering remain rejected by the shared availability service.

## Security invariants

- an unmapped user cannot access provider operations;
- inactive or unverified providers cannot access provider operations;
- a provider cannot read or mutate availability for another provider's offering;
- consumer booking still rechecks location serviceability, availability and capacity server-side;
- society authorization remains unchanged.

## Deferred

Date-specific closures, holidays, one-off capacity overrides, employee-level rosters, provider booking acceptance, agent self-service, live dispatch, payout/settlement, production payment gateway and provider mobile/web portal UX are separate milestones.
