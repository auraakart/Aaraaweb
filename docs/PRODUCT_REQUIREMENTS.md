# Aaraagate Product Requirements

Version: 1.1  
Date: 2026-09-01

## Product position

Aaraagate is a multi-society SaaS operating system for Indian gated communities. It must be designed to compete with tier-one products in reliability, security, usability and operational depth, while remaining affordable for smaller societies.

V1 prioritizes Security, Residents, Domestic Help, Deliveries, Vehicles, Services, Notifications, Complaints and Payments. The platform must support configurable SaaS feature entitlements so societies can be offered lower-, mid- and premium-tier plans without separate codebases.

## Product principles
- Security before feature count.
- No cross-society data leakage. Every tenant-owned operation must be society-scoped and authorization must be enforced server-side.
- Least-privilege RBAC plus explicit permissions are mandatory for privileged and operational actions.
- Privacy by design; collect and expose only necessary information.
- Resident experience must be simple, fast and understandable to users with varied digital literacy.
- Guard workflows must work in real gate conditions, low bandwidth and intermittent connectivity.
- Admin workflows must be auditable and operationally safe.
- Payments must be server-verified and auditable.
- Technology and component choices must favor proven, maintainable, scalable technologies with clear upgrade paths rather than short-term hacks.
- Avoid unnecessary vendor lock-in; keep the API, PostgreSQL data model, object storage and integrations portable where practical.
- Hardware is optional for V1, but integration boundaries must allow future RFID/ANPR/boom-barrier support.
- AI, when introduced, must be permission-aware, tenant-aware and action-safe.

## V1 roles
- Super Admin
- Society Admin / RWA
- Committee Member
- Facility Manager / Operations
- Accountant
- Owner
- Tenant
- Family Member
- Security Supervisor
- Security Guard
- Staff
- Vendor / Service Provider where applicable

## Property relationship, occupancy and privacy rules
- Legal ownership, physical occupancy and society roles are independent relationships. An owner is not assumed to reside in the unit.
- `UnitOwnership` grants only explicitly defined property capabilities. It does not grant household-private access, routine gate notifications or gate approval authority.
- `UnitOccupancy` is time-bound and identifies the owner-occupant, tenant or authorized family member who currently lives in the unit.
- Routine visitor, delivery, cab and domestic-help gate notifications are routed to active occupants configured as gate contacts, regardless of whether they own the unit.
- A non-resident owner does not receive routine gate activity by default. Property/security-critical notifications may include the owner only through an explicit, audited policy.
- Every occupied unit must have a primary gate contact. Additional adult occupants may be approval recipients, notification-only recipients or ordered fallback contacts.
- Move-out or occupancy termination immediately removes gate approval, notification and household-operational authority. Historical tenancy must not be exposed to a later occupant.
- Household APIs return explicit response DTOs and minimum necessary fields; another occupant's phone/email is not returned by default.
- Owner-only property finance, documents, voting and tenancy management use separate permissions from occupant day-to-day operations.
- Delegation, where introduced, must be explicit, scoped, time-bound, revocable and audited.

## V1 modules
1. Authentication, OTP abstraction, session lifecycle and role/permission-based access
2. Society > Building/Block > Floor > Unit/Flat hierarchy
3. Resident, family, owner, tenant and membership management
4. Resident Flutter app
5. Guard Flutter app
6. Visitor management with pre-invite, approval/rejection and QR/OTP passes
7. Gate verification, transactional check-in/check-out and immutable audit trail
8. Domestic-help management and entry/exit workflows
9. Delivery and cab workflows
10. Vehicle registration and basic parking data
11. Notices, announcements and push notifications
12. Complaints / ticketing / helpdesk
13. Household services directory, provider onboarding, service requests/bookings and ratings
14. Maintenance bills, receipts and online payments
15. Society Admin dashboard
16. Super Admin dashboard
17. Audit logs, backups, monitoring, observability and production security controls
18. SaaS product tiers, society feature entitlements and controlled feature overrides
19. Offline guard action queue with idempotent synchronization
20. Reporting and operational audit views required for pilot and commercial operations

## Household services commercial direction
Household Services is a core commercial differentiator, not merely a static directory. The architecture must support categories, verified providers, society availability, offerings, bookings, ratings and future monetization/commission models. A separate provider application may be deferred, but the marketplace/service-booking domain is part of the platform foundation.

## SaaS entitlement model
The product must support feature tiers such as Starter, Professional, Premium and Enterprise (names may evolve commercially). Entitlements are resolved server-side per society, with optional controlled overrides. UI visibility must never replace server-side entitlement enforcement.

## Multi-society and future organization hierarchy
Society remains the primary operational data boundary. The architecture must allow future organization/property-manager ownership of multiple societies without weakening society-level isolation. Organization-level users must receive only explicitly delegated scopes.

## Explicitly deferred
Phase 2: advanced amenities, advanced parking allocation, full accounting suite, dedicated service-provider app, advanced analytics/reports, polls/AGM, EV charging and WhatsApp integrations.

Phase 3: AI assistant, smart gates, ANPR, RFID/access-control integrations, parcel lockers, predictive analytics and broader property-management integrations.

## Release and quality model
Source of truth is GitHub. `develop` is the active integration branch, `staging` is the release-validation branch and `main` is the stable release branch.

Promotion path:
`develop` → full CI → `staging` → migrations/build/startup/smoke validation → UAT/security approval → `main` → production.

No large direct merge from `develop` to `main` is considered production-ready merely because code compiles.

## Definition of done
A requirement is complete only when:
- It matches this approved specification and traceability document.
- Authorization, tenant isolation and feature entitlement checks are verified.
- Happy path, failure path and concurrency-sensitive behavior are implemented where relevant.
- Database migrations are repeatable on a clean database and have a safe deployment procedure for existing environments.
- API validation and sanitized error handling are present.
- Automated tests pass and required CI gates are green.
- No high/critical dependency vulnerability gate is failing.
- No secrets are committed.
- Logs do not expose unnecessary personal/payment information.
- Mobile UI includes loading, empty, error and offline states where relevant.
- Privileged/admin/gate mutations are auditable.
- Staging smoke validation passes before production promotion.
- Documentation and acceptance criteria are updated.
- Relationship-sensitive features prove by negative tests that ownership alone does not grant occupancy-private access and that active occupants receive gate notifications/approval authority.
