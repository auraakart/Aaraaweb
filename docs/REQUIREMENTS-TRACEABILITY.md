# Aaraagate Requirements Traceability

Updated: 2026-09-01

This document is the implementation guardrail for the Aaraagate build. Features are only complete when their requirement, UX intent, security model, tenant/permission model, acceptance criteria and release validation are defined.

## Product pillars
1. Security-first gated-community operations
2. Resident-first everyday experience
3. Guard-first speed, clarity and offline resilience
4. Admin-grade operational control
5. Privacy, auditability, tenant isolation and least-privilege access
6. Mobile-first, accessible and scalable UI
7. Tier-one competitive quality with maintainable, upgradeable technology choices
8. Multi-tier SaaS entitlements without product fragmentation

## Current implementation baseline
| Area | Status | Acceptance direction |
|---|---|---|
| Application foundation | Advanced foundation | Monorepo, reusable app shells, strict typing and modular architecture |
| Design system | In progress | Mobile-first cards, action-led navigation, accessible contrast and consistent states |
| Resident home | Functional foundation | Quick actions, community/gate information and real API integration |
| Authentication/session | Advanced foundation | OTP abstraction, access/refresh lifecycle, rotation/revocation and persistent sessions |
| RBAC/permissions | Advanced foundation | Society-scoped roles, typed permissions and server-side enforcement |
| Society structure | Advanced foundation | Society → building/block → floor → unit → household/membership |
| SaaS entitlements | In progress | Server-side tier resolution and feature overrides per society |
| Visitor management | Active vertical slice | Request, approval/rejection, QR/OTP credential, gate verify, transactional check-in/out and audit |
| Guard application | Functional foundation | Login/session, scanner, operational screen, offline queue and API integration |
| Household/domestic help | Hardened foundation | Ownership separated from time-bound occupancy; household data and workforce access follow active occupancy |
| Unified access | Foundation | Common access-request model for visitor/delivery/domestic-help style workflows |
| Services marketplace | Foundation | Categories, providers, society availability, offerings, bookings and ratings |
| Admin operations | Foundation | Operational modules exist; full production workflows remain incomplete |
| Notifications | Active vertical slice | Gate events route to configured active occupants, independent of ownership, with tenant-safe push/in-app delivery |
| Maintenance/billing | Planned | Bills, server-verified payments, receipts and ledger-ready records |
| Reports/analytics | Planned | Operational, audit and management reporting |
| Security/audit | Active hardening | Tenant isolation, permissions, atomic mutations, masked data and auditable events |
| CI/CD | Green baseline achieved | Full CI validates migrations, lint, typecheck, tests, builds, Flutter and dependency security |
| Staging release gate | Green baseline achieved | Clean DB migration, API production build/startup and health smoke validation |
| Production deployment | Not yet ready | Requires branch protection, staging E2E, observability, backups/restore, UAT and pilot |

## Current release evidence
- Full CI on `develop` has reached an all-green baseline including API build/tests, admin build, Flutter validation, clean PostgreSQL migrations and dependency audit.
- A `staging` branch and staging smoke workflow exist.
- Staging smoke has validated clean migration, API build, startup and `/api/v1/health` response.
- Branch protection/required checks are still an administrative gap and must be enabled before production governance is considered complete.

## Visitor vertical-slice acceptance criteria
Visitor Management is not complete until all of the following are verified end-to-end:
- Resident can create a visitor request only for an authorized unit.
- Resident can approve/reject/cancel only within the correct society and host scope.
- Approved visit issues a valid QR/OTP-compatible credential with expiry.
- Guard can verify only at an authorized active gate within the same society.
- Check-in and check-out are transactionally safe and concurrency-resistant.
- Visitor/pass states remain synchronized.
- Gate actions create auditable events where required.
- Resident notification is delivered for material gate events.
- Routine gate approval is delivered to active configured occupants, not to a non-resident owner by default.
- Any configured active occupant gate approver can decide the request; ownership alone cannot.
- Expired or ended occupancy cannot receive or approve new gate requests.
- Wrong society, wrong gate, expired, revoked, reused and concurrent credentials fail safely.
- Offline guard actions are idempotently synchronized when that workflow is enabled.
- UI includes loading, empty, error and recovery states.

## Definition of done
A feature is not production-ready until it has requirement mapping, responsive UI, loading/empty/error/offline states where relevant, tenant isolation, role/permission/entitlement checks, validation, audit implications reviewed, tests, documented acceptance criteria, green CI and staging validation appropriate to its risk.
