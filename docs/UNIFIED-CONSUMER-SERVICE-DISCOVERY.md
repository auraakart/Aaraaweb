# Unified consumer service delivery locations and discovery

## Goal

External services are available to both society-linked users and independent-home users through one consumer marketplace. Society membership unlocks society features, but it does not exclude the user from the external-services flow.

## Delivery-location model

A consumer service booking uses exactly one delivery-location source:

- `HOME` — an authenticated user's active `ConsumerHome`;
- `SOCIETY_UNIT` — a unit for which the authenticated user has a current active occupancy or ownership relationship.

`ConsumerServiceBooking` keeps the immutable address snapshot used at booking time. The source relationship is retained through either `homeId` or `societyUnitId`, with a database check requiring exactly one.

A society unit is service-ready only after the society has a configured `SocietyServiceAddress`. The unit/building/society labels are combined with that shared physical society address. This prevents society residents from creating fake independent homes merely to book external services.

## Service areas

Provider coverage remains the authoritative V1 serviceability boundary and is PIN-code based.

`ConsumerProviderServiceArea` defines the provider's broad coverage.

`ConsumerOfferingServiceArea` is an optional offering-specific override:

- if an offering has no override rows, it inherits all active provider PIN-code coverage;
- once any override row exists for an offering, only active matching override PIN codes are serviceable;
- inactive rows remain meaningful and keep override mode engaged, allowing an offering to be disabled for all provider areas without falling back to provider-wide coverage.

This supports cases such as a provider covering ten PIN codes for plumbing but only five for AC service.

## Consumer discovery

`GET /api/v1/consumer/services/locations` returns service delivery locations available to the authenticated user.

`GET /api/v1/consumer/services/offerings?locationType=...&locationId=...` resolves the selected location server-side and returns only verified, active provider offerings that are serviceable at its PIN code. `categoryId` remains optional.

The legacy unscoped offerings call remains temporarily compatible for existing clients, but new Resident UX should select a delivery location before provider discovery.

`GET /api/v1/consumer/services/availability` accepts either the legacy `homeId` or the unified `locationType` + `locationId`. The authenticated user must own or occupy the supplied location relationship.

Booking creation similarly accepts either legacy `homeId` or unified location parameters. The authoritative booking transaction re-resolves the location, derives its PIN code server-side, enforces provider coverage, offering override coverage, time-window availability and capacity, then snapshots the address.

## Society and security boundary

- independent consumer APIs remain Bearer-scoped and do not use `TenantGuard`;
- society-unit access is not trusted from a client-provided society ID: the server proves the user's current `UnitOccupancy` or `UnitOwnership` relation to the supplied unit;
- changing a unit identifier cannot cross into an unrelated society property;
- society-only gate, notices, maintenance, helpdesk and workforce authorization is unchanged;
- external-service bookings do not gain gate-entry privileges merely because their delivery location is a society unit.

## Configuration

Platform service-catalog operations can configure a society service address and offering-specific service-area overrides. Provider-wide service areas continue to use the existing provider service-area endpoints.

Provider self-service onboarding/authentication remains deferred until a safe provider identity model is introduced. The eventual provider dashboard should expose these controls as **Areas I serve** and per-offering coverage.

## Deferred

- GPS/radius or polygon serviceability;
- distance-based ranking and ETA;
- provider self-service authentication;
- locality master-data/geocoding enrichment;
- masked calling and live agent tracking;
- automatic society gate-entry creation for an external-service assignment;
- production payment gateway and settlement integration.

PIN-code eligibility remains authoritative in V1. Latitude/longitude can later rank already-serviceable providers by proximity; physical distance alone must not make a provider bookable outside its declared coverage.
