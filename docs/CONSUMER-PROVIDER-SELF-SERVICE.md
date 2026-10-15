> **Current-state notice (2026-09-21):** Superseded for current-state review by V4.35 Services Marketplace Completion. This document is retained as historical milestone evidence. Use [CURRENT-CAPABILITY-INDEX.md](CURRENT-CAPABILITY-INDEX.md) for the current implementation state.

# Consumer Provider Self-Service Foundation

## Objective

Allow a verified external-service provider to maintain its own service coverage using the existing Aaraagate OTP identity, without granting society or platform-administration permissions.

## Identity model

`User -> ConsumerProviderOperator -> ServiceProvider`

A platform administrator links an existing Aaraagate user to a provider. Provider endpoints resolve the provider exclusively from the authenticated Bearer user. Provider IDs supplied by the client are not trusted for self-service mutations.

A provider operator mapping is usable only when:
- the mapping is active;
- exactly one active mapping exists for the user in this V1 foundation;
- the ServiceProvider is active;
- the ServiceProvider verification status is VERIFIED.

Users may also hold society memberships. Provider access does not derive from, modify, or bypass society roles, TenantGuard scope, gate permissions, maintenance access, helpdesk access, or household relationships.

## V1 self-service capabilities

Provider operators can:
- view their provider identity;
- list/add/activate/deactivate provider-level PIN-code service areas;
- list their own service offerings;
- list/add/activate/deactivate offering-specific PIN-code overrides.

Offering mutations first prove that the offering belongs to the authenticated provider.

## Platform control

Only a caller with `PLATFORM_PROVIDER_VERIFY` may link an Aaraagate user to a provider. Verification and provider activation remain platform-controlled.

## API surface

Provider:
- `GET /api/v1/provider/services/me`
- `GET /api/v1/provider/services/areas`
- `POST /api/v1/provider/services/areas`
- `PATCH /api/v1/provider/services/areas/:areaId`
- `GET /api/v1/provider/services/offerings`
- `GET /api/v1/provider/services/offerings/:offeringId/areas`
- `POST /api/v1/provider/services/offerings/:offeringId/areas`
- `PATCH /api/v1/provider/services/offerings/:offeringId/areas/:areaId`

Platform:
- `POST /api/v1/platform/services/providers/:providerId/operators`

## V4.35 extension

V4.35 extends this foundation with:
- authenticated provider onboarding draft/submission using non-sensitive evidence references;
- platform review under `PLATFORM_PROVIDER_VERIFY` before provider verification;
- provider-created and provider-updated catalogue offerings with category validation and append-only offering events;
- provider booking acceptance plus schedule counter-proposals requiring explicit consumer acceptance;
- date-specific closure/capacity exceptions layered onto weekly availability;
- provider readiness across catalogue, coverage, availability and active agents;
- existing agent login/dispatch and settlement-readiness capabilities retained.

Provider verification remains a distinct platform decision. Application approval creates the provider/operator relationship but does not itself claim live KYC certification.

## Still external / deferred

Live KYC/document-verification providers, production payment gateway behavior, bank payout execution, tax-filing/compliance integrations, live GPS and masked calling remain outside repository completion.
