# Aaraagate Requirements Traceability

Updated: 2026-09-05

`PRODUCT_REQUIREMENTS.md` remains the product-scope source of truth. This document records implementation/acceptance state. `DEVELOPMENT-CONTROL.md` remains the execution-order source of truth.

## Current implementation baseline
| Area | Status | Current acceptance state |
|---|---|---|
| Foundation / monorepo | Validated | Modular API, Flutter Resident/Guard, Next.js Admin, strict CI |
| Design system | Validated V1 baseline | Logo-inspired teal/cyan Aaraagate theme; corporate name excluded from product UI by CI guard |
| Authentication/session | Advanced | OTP abstraction, Redis-backed auth state, token rotation/replay protection, session revocation |
| Tenancy / RBAC / SoD | Hardened | Society fail-closed isolation, permission gates, relationship roles separated from operational roles, tenant admins cannot grant platform roles |
| Platform administration | Gap-closure candidate | Super Admin society lifecycle, plans/feature overrides, Society Admin provisioning/deactivation |
| Society structure | Gap-closure candidate | Society → Building/Block → Floor → Unit → household; migration preserves existing unit IDs |
| SaaS entitlements | Gap-closure candidate | Tier/feature resolution plus supported platform management controls |
| Visitor / gate | Validated V1 | Occupant-based approval/routing, QR/OTP, audit, guard processing, idempotent offline recovery |
| Delivery / cab | Validated V1 | Dedicated access semantics and short-window operational flows |
| Household / owner / tenant | Validated V1 | Legal ownership and physical occupancy independent; stale relationships revoke authority |
| Vehicles / parking | Gap-closure candidate | Resident registration/deactivation; parking read-only to resident; Admin assignment UI/API |
| Workforce / domestic help | Validated V1 | Assignment, schedules, leave, rating, suspension and gate integration |
| Notices | Validated V1 | OWNER_ONLY / OWNER_AND_OCCUPANTS with current relationship filtering |
| Helpdesk / SOS | Validated V1 | Tenant-scoped resident and operations lifecycles |
| Marketplace | Gap-closure candidate | Multiple provider choice, platform verification, society lifecycle, provider reputation, booking conflict prevention, offering activation lifecycle |
| Billing / payments | Validated V1 | Owner/current-tenant dues, payer privacy, signed reconciliation, audit |
| Reports / audit | Validated V1 | Operational summaries and finance redaction for non-finance report readers |
| Notifications | Validated V1 | Occupant-based gate notifications, push/in-app routing |
| Health / runtime readiness | Gap-closure candidate | Liveness independent; readiness validates PostgreSQL and Redis/auth state |
| CI / release controls | Hardened | Frozen lockfile installs, API/Admin/Flutter validation, dependency audit, staging smoke, backup restore drill |
| Hosted production evidence | Pending external setup | Real provider deployment, managed backups/PITR, restore drill, monitoring, secrets and production integrations still require hosted evidence |

## Security findings closed in this remediation
- Society-scoped role administration explicitly forbids `SUPER_ADMIN`, `SOCIETY_ADMIN`, vendor and relationship-role grants.
- Operational role deactivation revokes active sessions for the affected user/society.
- Tenant resident creation no longer overwrites an existing user's global canonical name.
- Platform-only society/entitlement and provider-verification operations are separated from society-management permissions.

## Current release direction
The active milestone is **Commercial V1 gap closure and consolidated release validation**. No additional feature expansion should enter this candidate unless it fixes a blocker or regression.

Required sequence:
1. complete gap-closure implementation and targeted tests;
2. full protected CI on the consolidated branch;
3. merge to `develop`;
4. promote exact candidate to `staging`;
5. staging smoke + backup/restore on the exact SHA;
6. execute updated security/UAT acceptance, including platform-role boundary, floor/property setup, parking and marketplace provider lifecycle;
7. protected `staging → main` promotion with independent approval;
8. verify post-main CI and reconcile release history to `develop`.

## Production truth
A green repository release does not mean the product is live. Commercial production still requires:
- hosted API/Admin deployment from the approved `main` SHA;
- production PostgreSQL and Redis/Valkey;
- MSG91 OTP credentials;
- Firebase/FCM credentials;
- payment gateway/webhook credentials;
- production CORS/domains/TLS;
- managed backup retention/PITR and an isolated restore exercise;
- monitoring/logging/alert ownership;
- production preflight evidence and rollback target.

## Definition of done
A feature is production-ready only when requirement mapping, tenant/permission/entitlement controls, data validation, privacy/audit implications, UX states, targeted tests, full CI and staging validation appropriate to risk are complete. Cross-cutting authorization, payment or data-migration changes also require explicit regression/UAT evidence before `main`.
