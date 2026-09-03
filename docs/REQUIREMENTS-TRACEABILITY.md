# Aaraagate Requirements Traceability

Updated: 2026-09-03

This document is the implementation guardrail for the Aaraagate build. Features are only complete when their requirement, UX intent, security model, tenant/permission model, acceptance criteria and release validation are defined.

`PRODUCT_REQUIREMENTS.md` is the product-scope source of truth. This document is the feature-status and acceptance source of truth. `DEVELOPMENT-CONTROL.md` is the current execution-order source of truth.

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
| Visitor management | Validated release baseline | Request, approval/rejection, QR/OTP credential, gate verify, transactional check-in/out, session-scoped offline recovery and audit |
| Guard application | Advanced vertical slices | Login/session, scanner, visitor and workforce operations, offline recovery and API integration |
| Household/domestic help | Current active vertical slice | Occupancy-scoped assignments, review, schedules, leave, ratings, gate attendance and suspension controls; final E2E/recovery gaps are being closed |
| Unified access | Foundation | Common access-request model for visitor/delivery/domestic-help style workflows |
| Services marketplace | Foundation | Categories, providers, society availability, offerings, bookings and ratings |
| Admin operations | Active vertical slices | Helpdesk/notices and billing operations are live foundations; remaining V1 workflows still need completion |
| Notifications | Active vertical slice | Gate events route to configured active occupants, independent of ownership, with tenant-safe push/in-app delivery |
| Maintenance/billing | Validated release baseline | Owner/current-tenant unit-scoped dues and payments, society invoice operations, server-verified reconciliation, receipts/history, audience controls and auditable events |
| Reports/analytics | Planned / minimal foundation | Essential V1 operational and audit views remain to be completed |
| Security/audit | Active hardening | Tenant isolation, permissions, atomic mutations, masked data and auditable events |
| CI/CD | Green baseline achieved | Full CI validates migrations, lint, typecheck, tests, builds, Flutter and dependency security |
| Staging release gate | Green baseline achieved | Clean DB migration, API production build/startup and health smoke validation |
| Production deployment | Not yet ready | Requires branch protection, staging E2E, observability, backups/restore, UAT and pilot |

## Current execution focus
The active milestone is **Domestic-help/workforce user journeys and operational UX completion**. Current work closes Resident/Admin/Guard E2E behavior, attendance concurrency, session-scoped offline recovery, schedule and occupancy boundaries, notifications and auditability. After workforce closure, proceed to remaining Admin operations, essential reports, marketplace completion, UX consistency, consolidated regression/security review and production-readiness work.

Maintenance/Billing is now treated as a validated release baseline. Live payment-gateway activation remains environment/configuration dependent and does not reopen the gateway-independent milestone unless a defect or requirement change requires it.

The detailed execution sequence and usage-efficient working rules live in `DEVELOPMENT-CONTROL.md` so this traceability document can stay focused on requirement status and acceptance.

## Current release evidence
- Full CI on `develop` has reached an all-green baseline including API build/tests, admin build, Flutter validation, clean PostgreSQL migrations and dependency audit.
- A `staging` branch and staging smoke workflow exist.
- Staging smoke has validated clean migration, API build, startup and `/api/v1/health` response.
- Owner/occupant authorization, occupant-based gate routing and guard offline-recovery work have been promoted through the validated release path.
- Society Admin maintenance billing operations, owner/current-tenant dues/payment access, verified receipts/history, reconciliation visibility and configurable notification audiences have been promoted through the validated release path.
- Visitor credential lifecycle and session-scoped Guard offline recovery hardening have passed staging and production promotion and are synchronized back into `develop`.
- Branch protection/required checks remain an administrative production-governance requirement even when repository rules enforce PR/check workflows.

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
- Matching concurrent retries recover idempotently without creating duplicate gate actions; conflicting/reused credentials fail closed.
- Offline guard actions are idempotently synchronized when that workflow is enabled.
- UI includes loading, empty, error and recovery states.

### Guard offline recovery evidence
- Transport failures queue gate check-in/out actions in secure local storage with stable idempotency keys.
- Every queued action is bound to its society and guard identity; another session cannot see its count or replay it, and unsafe legacy records are purged.
- Guards can manually retry safe synchronization and see a privacy-safe outcome without visitor credentials being displayed.
- Successfully synchronized actions are removed; transport-pending and server-rejected actions remain available for retry or supervisor review.
- Controller tests cover queueing, successful retry/idempotency preservation and rejected-action retention.

## Maintenance/Billing validated baseline
The gateway-independent Billing milestone is considered validated when the following remain true:
- Society Admin/Accountant can create and manage tenant-scoped maintenance invoices under least-privilege permissions.
- Verified owners and current tenants can view and pay dues only for units they own or currently occupy; tenant history/receipts remain limited to payments they made.
- Broader property-finance data remains owner-only, and former/cross-unit occupants fail closed.
- New dues notify both verified owners and current tenants, including when the owner is non-resident, without granting gate authority through ownership.
- General Admin broadcasts persist an explicit `OWNER_ONLY` or `OWNER_AND_OCCUPANTS` audience and are filtered server-side before feed/push delivery.
- Payment-order preparation is idempotent and does not present false success before signed gateway reconciliation.
- Gateway callbacks are authenticated, deduplicated and reconcile capture/refund outcomes safely.
- Payment and reconciliation events are auditable without exposing unnecessary payment data.
- Resident/Admin clients include loading, empty, denied, failure and retry/recovery states.
- Targeted authorization/service/widget tests pass, followed by protected CI and staging validation appropriate to payment risk.

## Usage-efficient validation rule
During normal milestone development, inspect and test the affected modules plus direct dependencies. Run full-repository review/regression only at major release boundaries or when a cross-cutting architecture/security change warrants it. CI failures should be diagnosed from the failing job first rather than triggering an unconditional repository-wide audit.

## Definition of done
A feature is not production-ready until it has requirement mapping, responsive UI, loading/empty/error/offline states where relevant, tenant isolation, role/permission/entitlement checks, validation, audit implications reviewed, tests, documented acceptance criteria, green CI and staging validation appropriate to its risk.
