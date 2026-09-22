# Aaraagate Current Capability Index

**Current-state review baseline:** V4.42 society-workforce capability building on the V4.41 repository-simplification and maintainability closure.  
**Purpose:** reviewer entry point for what the repository currently implements. Older milestone documents remain historical evidence and can intentionally describe capabilities as deferred at that earlier point in time.

## Runtime surfaces

- **Admin / Operations:** Next.js and React.
- **Resident:** Flutter.
- **Guard / Security gate:** Flutter.
- **API:** NestJS modular monolith with REST under `/api/v1`.
- **Persistence:** PostgreSQL / Prisma, Redis coordination/cache boundaries, and S3-compatible object-storage boundaries.
- **Shared TypeScript contracts:** `packages/types`, `packages/api-client`, and `packages/config`. V4.36 moves Operations Control, Helpdesk, Finance and Governance onto these shared contracts.

## Implemented functional domains

The current API graph includes authentication, societies, residents, properties, households, household workforce, society workforce, helpdesk, integrations, AI operations, notices, parcels, parking, SOS, gates, Guard operations, visitors, access/access integrations, amenities, facilities, utilities, society vendors/procurement, documents, External Services marketplace, billing/accounting, governance, migration, privacy, reports, universal search, analytics, entitlements, notifications and scheduled work.

## External Services marketplace

Current repository behavior includes provider operator identity, onboarding application/evidence-reference review, catalogue self-service and history, provider/offering serviceability, weekly and date-specific availability, consumer booking, provider accept/decline, schedule counter-proposals, resident acceptance/rejection, dispatch/agents, gate-linked fulfilment, completion evidence, ratings, disputes, payment readiness/records, settlement evidence/foundations and provider-readiness visibility.

This does **not** claim live KYC-provider verification, real bank payout execution, payment-provider certification, GPS/masked calling, hosted production readiness or real-world provider acceptance.

## Resident experience

Persistent bottom navigation remains **Home, Gate, Services, Community, Profile**. Quick Actions remain **Staff, Billing, Amenities, Helpdesk**, avoiding duplication. The AI Assistant remains a contextual Home entry point rather than a navigation tab.

## Ownership and tenancy

- Routine gate notifications follow current occupancy rather than ownership alone.
- A non-resident owner and current tenant can both receive society dues/payment notifications.
- Either owner or tenant can pay.
- Society broadcast targeting can distinguish owner-only from owner-and-tenant audiences.

## Architecture and security invariants

Society-scoped authorization, RBAC/capabilities, segregation of duties, audit evidence, idempotency, Guard offline safety, privacy lifecycle controls and immutable financial/security evidence remain authoritative. UI visibility never substitutes for server authorization.

V4.36 adds shared Admin contract adoption, typed Resident Services and Guard unit boundaries, a CI-generated OpenAPI route inventory and client/controller root drift checking. V4.37 adds a repository-integrity CI gate, grouped Admin regression suites, an explicit Admin console growth ceiling and a canonical `feature → develop → staging → main` promotion contract. V4.38 reduces historical branch accumulation and hardens branch-hygiene automation. V4.39 removes ancestry-only staging reconciliation, triggers safe branch cleanup after merged develop PRs, extracts Admin authentication/session/API responsibilities from the console shell, and adds a typed Resident parcel boundary. The remaining legacy per-page Admin API helper count is explicitly capped so future work can only converge further. V4.40 then extracted Admin domain contracts, typed Guard parcel boundaries and aligned CI to Node 22 / pnpm 10. V4.41 continues that convergence by extracting the Admin overview/shared primitives, typing the Resident SOS boundary, and adding explicit post-main repository-health evidence. V4.42 adds society-scoped common-worker roster management, verification, shift/gate eligibility and dedicated gate attendance while preserving segregation from household domestic-help assignments.

## External evidence boundary

Productionization, hosted staging acceptance, live payment/KYC/provider integrations, physical hardware certification, signed store release and field-pilot/business acceptance remain external evidence and are not implied by repository completion.
