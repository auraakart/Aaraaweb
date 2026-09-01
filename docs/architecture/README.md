# Aaraagate Architecture Baseline

Updated: 2026-09-01

## Product model
Aaraagate is a multi-tenant Society Operating System for gated communities, designed as a long-lived SaaS platform with society-level operational isolation and configurable product entitlements.

## Applications
- `apps/admin`: Next.js administration application for society management and platform operations.
- `apps/resident`: Flutter resident mobile application.
- `apps/guard`: Flutter security/gate mobile application.
- `apps/web`: existing web surface retained where applicable; new admin functionality should follow the current admin architecture rather than create duplicate product logic.

## Backend
- `services/api`: NestJS + TypeScript modular monolith.
- REST API under `/api/v1`.
- Authorization, tenancy, entitlement enforcement, validation and audit logic are centralized at the API/domain layer.

## Data
- PostgreSQL is the system of record.
- Redis may be introduced for cache, rate limiting, distributed coordination, temporary tokens and background jobs when justified; it is not required merely to satisfy architecture diagrams.
- S3-compatible object storage is preferred for photos and documents.
- Database changes use Prisma migrations and must be repeatable on a clean environment before promotion.

## Core domains
Auth, societies, memberships, buildings, units, households, residents, visitors, visitor passes, gates, unified access requests, domestic help, vehicles, deliveries, staff, vendors, household services, notices, complaints, maintenance, payments, notifications, reports, feature entitlements and audit logs.

## Tenancy
Society is the primary operational tenant boundary. Every tenant-owned domain record must be scoped to a society identifier where applicable, and authorization must be enforced server-side for both reads and writes.

User identity is separate from society membership. Roles and permissions are evaluated within membership/scope. A future organization/property-manager layer may own or administer multiple societies, but access remains explicitly delegated per society and does not weaken society-level isolation.

## Authorization
Use least-privilege RBAC plus capability permissions and resource scope. Business services should authorize permissions and ownership/scope rather than rely only on role-name conditionals.

Commercially gated features also require server-side entitlement checks. UI hiding is neither an authorization nor entitlement boundary.

## Security
- OTP rate limiting and provider abstraction
- Access/refresh sessions with expiry, rotation and revocation
- Society-scoped persistence filters
- Validation and sanitized errors
- Transactional/conditional mutations for concurrency-sensitive access flows
- Audit logging for privileged and gate-critical actions
- Secure file handling
- Secrets outside source control
- Separate development/staging/production environments
- Minimal PII exposure to guards and operational roles
- High/critical dependency vulnerability gate
- Backups, restore testing, observability and incident-ready logging before production

## Offline gate architecture
Guard workflows use durable local queueing plus idempotency keys/receipts and safe server synchronization. Offline replay must not create duplicate entry/exit transitions.

## SaaS entitlements
Societies may be assigned tiers such as Starter, Professional, Premium or Enterprise, with controlled feature overrides. The entitlement model is part of the platform architecture so commercial packaging does not require code forks.

## Household services
Household Services is a platform domain supporting service categories, verified providers, provider-to-society availability, offerings, bookings and ratings. This enables marketplace monetization later without requiring a dedicated provider app in the first release.

## Delivery strategy
Start as a modular monolith. Extract services only when scale, security or operational boundaries justify it. Prefer portable infrastructure and clear upgrade paths over premature distributed complexity.

## Release architecture
- `develop`: active integration branch; full CI gate.
- `staging`: release-validation branch; production-style migration/build/startup and critical workflow smoke/E2E/UAT.
- `main`: stable production-release branch.

Promotion path:
`develop` → green CI → `staging` → green staging validation + UAT/security approval → `main` → production.

Branch protection and required status checks must be enabled before commercial production. Successful compilation alone is not sufficient for release approval.

## Technology selection principle
Choose actively maintained, proven components with strong security posture, testability, scalability and documented upgrade paths. Avoid short-term hacks and unnecessary vendor lock-in, especially where they could compromise tenancy, authorization, portability or long-term maintainability.
