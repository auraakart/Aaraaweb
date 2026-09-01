# Aaraagate Implementation Roadmap

Updated: 2026-09-01

## Phase 1 — Foundation
- Application shells and shared design principles
- Strict TypeScript and modular monorepo structure
- Requirement traceability
- Responsive/mobile-first layout
- Portable PostgreSQL/API-first architecture

## Phase 2 — Identity, tenancy and access
- OTP authentication abstraction
- Persistent session lifecycle with rotation/revocation
- Resident, family, guard, society admin and operations roles
- Typed permission matrix and server-side authorization
- Society-level tenant isolation on all operational records
- Audit events for privileged actions
- Future organization/property-manager hierarchy without weakening society isolation

## Phase 3 — Society and SaaS model
- Society, gate, tower/block, floor, unit/flat and household
- Resident membership
- Staff/vendor relationships
- Product tiers and per-society feature entitlements
- Controlled feature overrides
- Entitlement enforcement server-side and reflected in clients

## Phase 4 — Gate and visitor management
Current active vertical slice.

- Resident visitor request
- Approval/rejection/cancellation
- QR/OTP passes
- Gate-scoped credential verification
- Transactional check-in/check-out
- Entry/exit audit records
- Resident notifications
- Wrong-tenant/wrong-gate/expired/revoked/reused credential rejection
- Concurrency/race-condition safety
- Guard offline queue and idempotent synchronization
- Delivery and cab workflows
- Domestic help/frequent visitor workflows
- Photo capture where policy permits
- Overstay/blacklist rules

Release gate: full visitor journey validated in staging, including tenant-isolation and failure-path smoke/E2E tests.

## Phase 5 — Resident experience
- Home action center
- Visitor approvals
- Deliveries
- Notices/announcements
- Helpdesk/complaints
- Emergency/SOS
- Household and profile management
- Vehicles
- Service bookings
- Payment/bill views
- Consistent loading, empty, error and offline/recovery states

## Phase 6 — Household services and operations
- Admin dashboard
- Resident verification
- Gate monitoring
- Complaints/helpdesk
- Staff/vendor management
- Domestic help operations
- Service categories/providers/offerings
- Provider verification and society availability
- Service booking lifecycle
- Ratings/reviews
- Reports and audit trail

## Phase 7 — Finance and community
- Maintenance billing
- Server-verified payments and receipts
- Basic operational reporting
- Community announcements/events
- Facility/amenity booking where commercially prioritized

## Phase 8 — Quality, release and production
This phase begins early and runs continuously; it is not deferred until feature completion.

- CI on `develop`: repository structure, clean DB migrations, API lint/typecheck/tests/build, admin typecheck/build, Flutter analysis/tests and high/critical dependency audit
- `staging` release branch and production-style smoke validation
- Visitor and critical-workflow E2E tests
- Accessibility checks
- Performance budgets
- Security/tenant-isolation review
- Dependency and secret scanning
- Observability and alerting
- Backups, point-in-time recovery and restore testing
- Staging deployment
- UAT
- Pilot society rollout
- Production deployment and rollback procedure
- Play Store closed testing and release readiness

## Release governance
Promotion path:
`develop` → green CI → `staging` → migration/build/startup + functional smoke/E2E → UAT/security approval → `main` → production.

Branch protection and required checks must be enabled for protected release branches before commercial production. No direct promotion based only on commit count or compilation status.

## Quality bar
Aaraagate is being built as a long-lived SaaS product. Technology choices must favor proven ecosystems, maintainability, portability, security, measurable testability and clear upgrade paths. Short-term hacks that create tenant/security or operational debt are not acceptable release shortcuts.
