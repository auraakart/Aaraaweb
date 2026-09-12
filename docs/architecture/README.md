# Aaraagate Architecture Baseline

Updated: 2026-09-12  
Architecture generation: V2

## Product model
Aaraagate is a multi-tenant residential-community operating system for Indian gated communities, designed as a long-lived SaaS platform with society-level operational isolation, configurable product entitlements and policy-driven behavior where state law, association structure or bye-laws differ.

V2 retains the validated V1 gate/resident/services architecture and adds accounting, governance, occupancy lifecycle, facilities, society vendors/procurement, documents, privacy operations, deeper emergency handling and operational controls.

## Applications
- `apps/admin`: Next.js Admin/Operations application for society management, accounting, governance, facilities, procurement, privacy operations and platform administration.
- `apps/resident`: Flutter consumer application. Keep the primary experience centered on Home, Gate, Payments, Services, Community/Helpdesk and Amenities.
- `apps/guard`: Flutter security/gate application optimized for constrained gate workflows and intermittent connectivity.
- `apps/web`: existing web surface retained where applicable; new operational administration follows the current Admin architecture instead of duplicating domain logic.

Complex ERP-style functions must not be pushed into the Resident app merely because the backend supports them.

## Backend
- `services/api`: NestJS + TypeScript modular monolith.
- REST API under `/api/v1`.
- Authorization, tenancy, entitlement enforcement, validation and audit logic are centralized at API/domain boundaries.
- Keep the modular monolith until scale, independent failure domains, regulatory/security boundaries or operational evidence justify service extraction.

## Data and infrastructure
- PostgreSQL is the transactional system of record.
- Redis/Valkey is used where justified for auth state, rate limiting, background coordination, cache and short-lived workflow state.
- S3-compatible object storage is preferred for provider media, society documents and evidence.
- Document/object access must be authorized at request/download time; a private or hard-to-guess URL is not an authorization boundary.
- Prisma migrations are repeatable on a clean environment and validated on the supported upgrade path before promotion.
- Money is stored in integer minor units with explicit currency where a domain may evolve beyond INR assumptions.

## Tenant and relationship model
Society is the primary operational tenant boundary. Every society-owned domain record is society-scoped where applicable and all reads/writes authorize the target society.

User identity is separate from society membership. Roles/permissions are evaluated within scope. Multi-society users explicitly select an authorized context; the client-provided context never grants authority by itself.

Independent-home users are not given synthetic society membership. They may use External Services through the independent-home authorization path while society-only modules remain unavailable.

### Ownership and occupancy
- `UnitOwnership` models time-bound legal/property relationship.
- `UnitOccupancy` models time-bound physical household relationship and gate-contact preferences.
- Routine gate routing resolves active occupancy records; ownership is never used as a proxy for residence.
- Move-out disables occupant authority and reconciles derived membership/session access atomically.
- V2 introduces an explicit tenancy/move workflow around these primitives instead of replacing them.

## Authorization and segregation of duties
Use least-privilege RBAC plus capability permissions and resource scope. Business services authorize permissions and ownership/scope rather than role-name checks.

V2 establishes explicit domain capabilities before domain implementation:
- finance read/manage;
- governance read/manage;
- facilities read/manage;
- society-vendor read/manage;
- document read/manage;
- privacy-operations read/manage.

Society Admin is an operational coordinator, not an automatic universal financial mutation role. Accountant/Treasurer, Committee and Facility responsibilities remain deliberately separated. Future maker-checker/approval workflows build on these capabilities rather than bypassing them.

Commercially gated features also require server-side entitlement checks. UI hiding is neither an authorization nor entitlement boundary.

## Bounded contexts

### Existing V1 contexts retained
Auth, societies, memberships, property hierarchy, ownership/occupancy, households, visitors, access/gates, workforce, vehicles, notices, helpdesk, SOS, amenities, maintenance billing, payments, notifications, reports, entitlements, audit, External Services marketplace/providers/bookings/ratings/dispatch.

### V2 Finance / Accounting
Responsibilities:
- chart/account/fund primitives;
- unit/party ledger;
- charge/billing accounting linkage;
- journal/adjustment/reversal semantics;
- receivables/payables;
- bank reconciliation;
- budgets/funds;
- financial statements/exports/period close.

Architecture rules:
- payment-gateway transaction state is not the ledger;
- reconciliation links payment events to accounting allocations;
- accounting history is corrected with auditable adjusting/reversing entries, not destructive mutation;
- GST/TDS behavior is configuration-driven where applicable.

### V2 Occupancy Lifecycle
Orchestrates tenancy onboarding/move-in/move-out over the existing ownership/occupancy models. It owns workflow status, required configurable documents, approvals/slots/charges references and coordinated revocation/migration of unit-bound access.

### V2 Governance
Owns committee roster/tenure, meetings, agendas, minutes, resolutions and action items. Polls/surveys may live here. Statutory election behavior remains policy-gated and is not assumed valid for every society.

### V2 Facilities
Owns common assets, preventive maintenance, inspections, AMC/warranty metadata, work orders, evidence, service history and critical maintenance escalation.

### V2 Society Vendors / Procurement
Owns society-appointed vendor master, contracts, quotations, optional purchase workflow, SLA/expiry and invoice references. It is separate from the consumer **External Services Marketplace** bounded context.

An entity may be both a marketplace provider and a society contractor, but authorization, contracts, pricing, operational records and reporting remain separate.

### V2 Documents
Owns metadata, classification, retention reference, association with finance/governance/facility/vendor records and authorized access to object storage. Documents do not become visible merely because a user can guess an object identifier.

### V2 Privacy Operations
Owns privacy/data-principal request cases, purpose/data-category inventory references, retention/legal-hold checks, processor/vendor records and personal-data incident workflow. It must not perform silent destructive deletion that conflicts with accounting, security, dispute or required retention policies.

### V2 Emergency / Incident Operations
Extends SOS into categorized incidents, control-room escalation, emergency broadcast/acknowledgement, assignments, timeline/evidence and closure. Critical escalation must not rely exclusively on ordinary push notification delivery or active property-screen state.

### V2 Parcel Desk
Owns leave-at-gate custody, parcel state, resident collection acknowledgement/OTP where enabled, uncollected escalation and courier history. Gate access remains in the Access context; parcel custody remains in Parcel Desk.

## Policy/configuration architecture
Aaraagate must not hard-code one national interpretation of society bye-laws or state procedures.

Introduce a society-policy/configuration layer for rules such as:
- tenancy document/approval requirements;
- move-in/out slots and charges;
- amenity booking rules;
- late-payment interest/waiver policy;
- governance quorum/evidence settings;
- communication acknowledgement requirements;
- parcel handling;
- parking/vehicle rules;
- applicable finance/tax configuration.

Policy changes are audited and versionable where historical interpretation matters.

## Audit architecture
Privileged V2 actions must produce auditable actor/action/resource/society metadata without logging sensitive payloads unnecessarily. Audit coverage includes financial posting/adjustment, governance resolutions, role/permission changes, facility critical actions, vendor approvals, document classification/access where appropriate and privacy-case decisions.

## Security and privacy
- OTP rate limiting/provider abstraction.
- Access/refresh sessions with expiry, rotation and revocation.
- Society-scoped persistence filters.
- Validation and sanitized errors.
- Transactional/conditional mutations for concurrency-sensitive flows.
- Minimal PII exposure by audience.
- Secure file handling and server-authorized object access.
- Secrets outside source control.
- Separate development/staging/production environments.
- Dependency vulnerability gates.
- Backups/restore testing/observability and incident-ready logging.
- Aaraagate does not store raw customer card credentials; gateway/tokenized payment mechanisms are used through supported providers.
- Privacy automation is designed for auditable requests and safe retention conflict handling rather than unsupported blanket deletion claims.

## Offline gate architecture
Guard workflows use durable local queueing plus idempotency keys/receipts and safe server synchronization. Offline replay must not create duplicate state transitions. V2 operational ERP workflows are not made offline-capable merely for consistency with Guard; offline support is domain-specific.

## SaaS entitlements
Societies may use Starter/Professional/Premium/Enterprise-style tiers with controlled overrides. V2 modules should be independently entitlement-ready where commercially useful, without code forks.

## External Services architecture
External Services remains a platform domain supporting consumer-facing categories, provider verification, society/home availability, media, offers, commercial placement/tier, offerings, bookings, ratings and dispatch. Commercial placement is never treated as verification/trust.

## Release architecture
- `develop`: active integration; full CI gate.
- `staging`: exact-candidate release validation, migration/build/startup/smoke/UAT.
- `main`: stable production-release branch.

Promotion path:
`feature/hotfix → develop → staging → main`.

V2 is intentionally delivered as bounded migrations/PRs; an all-at-once accounting+governance+facility schema change is prohibited.

## Technology selection principle
Choose actively maintained, proven components with strong security posture, testability, scalability and documented upgrade paths. Avoid short-term hacks and unnecessary vendor lock-in, especially where they compromise tenancy, authorization, accounting integrity, privacy safety or long-term maintainability.
