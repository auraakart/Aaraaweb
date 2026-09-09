# Aaraagate Implementation Roadmap

Updated: 2026-09-09

## Current execution status
The active milestone is **Commercial V1 release consolidation**. Core V1 implementation and the identified security/operational gap-closure work are complete on `develop`; current work is focused on reconciling release branches, validating the consolidated candidate on `staging`, and collecting the remaining UAT/hosted production evidence.

## Phase 1 — Foundation — COMPLETE
- Modular monorepo
- Flutter Resident and Guard apps
- Next.js Admin
- NestJS/PostgreSQL API
- strict CI, design system and requirement controls

## Phase 2 — Identity, tenancy and access — V1 COMPLETE / HARDENED
- OTP/session lifecycle
- Redis-backed production auth state
- society tenant isolation
- typed permissions and least privilege
- ownership/occupancy separation
- operational-role lifecycle
- platform-role boundary preventing tenant-to-platform privilege escalation
- suspended-society and inactive-user refresh rejection
- independent-home sessions isolated from society roles

## Phase 3 — Society and SaaS model — V1 COMPLETE / HARDENED
- Society → Building/Block → Floor → Unit → household hierarchy and Admin setup surface
- society lifecycle controls
- product tiers and feature overrides
- effective entitlement resolution and client navigation gating
- Super Admin platform controls
- Society Admin provisioning/deactivation with final-active-admin protection

UX/operations enhancements that are not V1 blockers:
- broader edit/deactivation workflows for already-created property hierarchy entities, where product policy permits them

## Phase 4 — Gate, visitor, delivery and cab — V1 COMPLETE / HARDENED
- Visitor request/approval/QR-OTP
- native visitor-pass sharing through installed apps
- Guard verification/check-in/out
- occupant-based routing
- explicit guard-to-gate assignment
- audit and idempotency
- secure durable offline Guard queue with safe replay
- workforce offline attendance replay/status UX
- delivery/cab flows

Deferred beyond V1 unless separately approved:
- ANPR/RFID
- advanced blacklist/overstay automation
- broad visitor-photo retention workflows
- offline authorization for new visitor approvals or credential verification

## Phase 5 — Resident experience — V1 COMPLETE / UX ITERATIVE
- Home action centre
- property-aware multi-society/multi-unit context and secure switching
- membership-only society mode that fails closed for unit-bound features
- independent-home service-only mode
- entitlement-aware navigation
- visitor approvals
- notices
- unified domain-backed Updates timeline
- helpdesk/SOS
- household/family
- vehicles/basic parking visibility
- household services
- resident-friendly service lifecycle model
- billing/payments
- privacy and data-use disclosure
- updated Aaraagate visual system

Remaining UX enhancements are not current release blockers unless UAT identifies a usability failure:
- full lifecycle-stepper integration into every legacy service-booking card
- persisted notification read/unread semantics after a backend inbox contract is defined

## Phase 6 — Operations and marketplace — V1 COMPLETE / UX ITERATIVE
- People & Roles administration with operational-role boundaries
- property/floor/unit setup
- society-managed parking assignment UI
- provider onboarding and platform verification
- society provider approval/suspension/rejection/re-approval
- controlled Admin provider lifecycle actions and commission validation
- multiple-provider resident comparison
- rating/completed-job reputation signals
- provider time-slot conflict prevention
- atomic booking confirmation/terminal transitions/rating retries
- offering lifecycle controls
- provider field-agent roster, coverage, schedule and dispatch operations

Remaining UX polish such as replacing residual browser confirmations/prompts can continue without reopening the V1 functional scope.

## Phase 7 — Finance, reports and community — V1 COMPLETE / HARDENED
- Maintenance billing
- owner/current-tenant payment access
- signed reconciliation and audit
- dues notifications to owner + current tenant
- notice audience controls
- essential reports with finance redaction for non-finance roles
- advanced-report entitlement enforcement

UPI-first presentation remains dependent on an explicit payment-gateway method/intent contract and must not be advertised before the backend provides it.

## Phase 8 — Release and production — ACTIVE
Repository controls:
- frozen-lockfile Node installs
- API lint/typecheck/tests/build
- Admin access regression/typecheck/build
- Resident/Guard analyze/tests
- dependency audit
- dependency-aware `/health/ready` for PostgreSQL + production Redis/auth state
- staging smoke
- backup/restore CI drill
- release-readiness evidence

Current repository task:
- reconcile the small staging-only release-history delta without force-reset/rebase
- promote the consolidated exact candidate from `develop` to `staging`
- run milestone-boundary full regression, staging smoke and backup/restore evidence

Hosted environment exit criteria:
- hosted staging API/Admin from exact staging SHA
- PostgreSQL + Redis/Valkey healthy
- OTP/push/payment integrations configured
- managed backup retention/PITR enabled
- isolated hosted restore evidenced
- external monitoring and alert owner assigned
- full UAT with real roles/devices
- no open critical/high security blocker

## Promotion governance
`feature/hotfix → develop → staging → main`

For release promotion:
1. targeted tests during implementation;
2. full CI before merge to `develop`;
3. reconcile release history and promote the exact candidate to `staging`;
4. exact-SHA staging smoke and backup/restore;
5. UAT/security approval;
6. independent approval on `staging → main`;
7. post-main CI;
8. reconcile release history back to `develop`.

## Phase 9 — Post-V1 roadmap
Only after Commercial V1 release/pilot evidence is stable:
- advanced parking workflows
- advanced amenity scheduling/rules and payment integration (amenities baseline is already implemented and entitlement controlled)
- advanced accounting
- further provider-experience refinement
- persisted notification inbox/read state
- recurring visitor and parcel-at-gate enhancements
- move-in/move-out workflow
- emergency-contact and masked-communication enhancements
- analytics/polls
- EV workflows
- WhatsApp automation beyond native pass sharing
- AI features
- ANPR/RFID and other hardware integrations

Regional-language Guard UI is intentionally not part of the current scope.

## Quality rule
Do not trade tenant isolation, authorization, payment integrity or operational recoverability for speed. Major cross-cutting changes require explicit regression and release evidence even when compilation and unit tests pass.
