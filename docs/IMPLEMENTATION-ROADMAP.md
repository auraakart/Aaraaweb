# Aaraagate Implementation Roadmap

Updated: 2026-09-05

## Current execution status
The active milestone is **Commercial V1 gap closure and release consolidation**. Core V1 features are already implemented; current work is focused on closing security/operational gaps discovered by the full product audit and producing one coherent release candidate.

## Phase 1 — Foundation — COMPLETE
- Modular monorepo
- Flutter Resident and Guard apps
- Next.js Admin
- NestJS/PostgreSQL API
- strict CI, design system and requirement controls

## Phase 2 — Identity, tenancy and access — V1 COMPLETE / HARDENED
- OTP/session lifecycle
- Redis-backed auth state
- society tenant isolation
- typed permissions and least privilege
- ownership/occupancy separation
- operational-role lifecycle
- platform-role boundary preventing tenant-to-platform privilege escalation

## Phase 3 — Society and SaaS model — GAP-CLOSURE CANDIDATE
- Society → Building/Block → Floor → Unit → household
- society lifecycle
- product tiers and feature overrides
- Super Admin platform controls
- Society Admin provisioning/deactivation

## Phase 4 — Gate, visitor, delivery and cab — V1 COMPLETE
- Visitor request/approval/QR-OTP
- Guard verification/check-in/out
- occupant-based routing
- audit and idempotency
- secure offline Guard queue
- delivery/cab flows

Deferred beyond V1 unless separately approved:
- ANPR/RFID
- advanced blacklist/overstay automation
- broad visitor-photo retention workflows

## Phase 5 — Resident experience — V1 COMPLETE / UX ITERATIVE
- Home action centre
- visitor approvals
- notices
- helpdesk/SOS
- household/family
- vehicles/basic parking visibility
- household services
- billing/payments
- updated Aaraagate visual system

## Phase 6 — Operations and marketplace — GAP-CLOSURE CANDIDATE
- People & Roles administration
- property/floor setup
- society-managed parking UI
- provider onboarding and platform verification
- society provider approval/suspension/rejection
- multiple-provider resident comparison
- rating/completed-job reputation signals
- provider time-slot conflict prevention
- offering lifecycle controls

## Phase 7 — Finance, reports and community — V1 COMPLETE
- Maintenance billing
- owner/current-tenant payment access
- signed reconciliation and audit
- dues notifications to owner + current tenant
- notice audience controls
- essential reports with finance redaction for non-finance roles

## Phase 8 — Release and production — ACTIVE
Repository controls:
- frozen-lockfile Node installs
- API lint/typecheck/tests/build
- Admin access regression/typecheck/build
- Resident/Guard analyze/tests
- dependency audit
- staging smoke
- backup/restore CI drill
- release-readiness evidence

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
3. exact-SHA staging smoke and backup/restore;
4. UAT/security approval;
5. independent approval on `staging → main`;
6. post-main CI;
7. reconcile release history back to `develop`.

## Phase 9 — Post-V1 roadmap
Only after Commercial V1 release/pilot evidence is stable:
- advanced parking
- amenities
- advanced accounting
- separate provider experience/app
- analytics/polls
- EV workflows
- WhatsApp automation
- AI features
- ANPR/RFID and other hardware integrations

## Quality rule
Do not trade tenant isolation, authorization, payment integrity or operational recoverability for speed. Major cross-cutting changes require explicit regression and release evidence even when compilation and unit tests pass.
