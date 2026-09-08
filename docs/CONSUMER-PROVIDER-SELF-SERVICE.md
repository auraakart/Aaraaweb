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

## Deliberately deferred

Provider onboarding application workflow, KYC/document upload, provider-side price edits, provider-side catalogue creation, agent login, booking acceptance, dispatch transitions, payout/settlement, tax configuration, live GPS, masked calling and production gateway integration remain separate milestones.
