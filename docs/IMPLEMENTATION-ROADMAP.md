# Aaraagate Implementation Roadmap

Updated: 2026-09-03

## Execution status
The current active vertical slice is **Maintenance/Billing**. Gate/Visitor Management has reached an advanced vertical-slice baseline and returns to active priority for final E2E/edge-case closure after Billing. The detailed current execution order is maintained in `DEVELOPMENT-CONTROL.md`; this roadmap describes the durable phase sequence rather than serving as a frequently changing task list.

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
Advanced vertical slice; final E2E and edge-case completion follows the active Billing milestone.

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
Active across completed and in-progress vertical slices.

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
In progress; follows closure of Billing and final Visitor/Guard gaps.

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
**Current active vertical slice: Maintenance/Billing.**

- Maintenance billing
- Server-verified payments and receipts
- Owner-only property-finance visibility and tenant fail-closed behavior
- Society Admin and Accountant billing operations
- Resident owner dues, paid history and payment preparation
- Basic operational reporting
- Community announcements/events
- Facility/amenity booking where commercially prioritized

Billing release gate: owner/tenant authorization tests, reconciliation/audit tests, Resident/Admin UX states, green protected CI and staging validation appropriate to the payment risk.

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

## Usage-efficient milestone execution
For each milestone, use the smallest safe reasoning scope:
1. Read the current execution state and affected acceptance criteria.
2. Inspect affected modules and their direct authorization/data dependencies only.
3. Implement related changes as one coherent vertical slice.
4. Run targeted tests during development.
5. Run full protected CI at integration/release boundaries.
6. Update traceability and execution state after material completion.

Full-repository audits are reserved for major release boundaries or cross-cutting architectural/security changes.

## Release governance
Promotion path:
`develop` → green CI → `staging` → migration/build/startup + functional smoke/E2E → UAT/security approval → `main` → production.

Branch protection and required checks must be enabled for protected release branches before commercial production. No direct promotion based only on commit count or compilation status.

## Quality bar
Aaraagate is being built as a long-lived SaaS product. Technology choices must favor proven ecosystems, maintainability, portability, security, measurable testability and clear upgrade paths. Short-term hacks that create tenant/security or operational debt are not acceptable release shortcuts.
