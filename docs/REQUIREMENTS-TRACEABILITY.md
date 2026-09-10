# Aaraagate Requirements Traceability

Updated: 2026-09-09

`PRODUCT_REQUIREMENTS.md` remains the product-scope source of truth. This document records implementation/acceptance state. `DEVELOPMENT-CONTROL.md` remains the execution-order source of truth.

## Current implementation baseline
| Area | Status | Current acceptance state |
|---|---|---|
| Foundation / monorepo | Validated | Modular API, Flutter Resident/Guard, Next.js Admin, strict CI |
| Design system | Validated V1 baseline | Logo-inspired teal/cyan Aaraagate theme; corporate name excluded from product UI by CI guard |
| Authentication/session | Hardened V1 | OTP abstraction, Redis-backed production auth state, token rotation/replay protection, session revocation, suspended-society/inactive-user refresh rejection |
| Tenancy / RBAC / SoD | Hardened | Society fail-closed isolation, permission gates, relationship roles separated from operational roles, tenant admins cannot grant platform roles, independent-home sessions do not inherit society roles |
| Platform administration | Validated V1 | Super Admin society lifecycle, plans/feature overrides, Society Admin provisioning/deactivation and final-active-admin protection |
| Society structure | Validated V1 baseline | Society → Building/Block → Floor → Unit → household with Admin creation/setup surface; existing unit IDs remain preserved by migrations |
| SaaS entitlements | Validated V1 | Tier/feature resolution, per-society overrides, current-entitlement API and entitlement-aware Resident/Admin navigation |
| Visitor / gate | Validated V1 / hardened | Occupant-based approval/routing, QR/OTP, native pass sharing, guard assignment enforcement, audit and idempotent offline recovery |
| Delivery / cab | Validated V1 | Dedicated access semantics and short-window operational flows |
| Household / owner / tenant | Validated V1 | Legal ownership and physical occupancy independent; stale relationships revoke authority; property context remains explicit |
| Vehicles / parking | Validated V1 | Resident registration/deactivation; parking read-only to resident; Admin assignment/change/clear UI and API |
| Workforce / domestic help | Validated V1 | Assignment, schedules, leave, rating, suspension and gate integration; durable offline attendance queue and retry/status UX |
| Notices | Validated V1 | OWNER_ONLY / OWNER_AND_OCCUPANTS with current relationship filtering |
| Helpdesk / SOS | Validated V1 | Tenant-scoped resident and operations lifecycles |
| Marketplace | Validated V1 / hardened | Multiple-provider choice, platform verification, society lifecycle, provider reputation, booking conflict prevention, atomic booking transitions/rating retries, offering lifecycle and provider dispatch operations |
| Billing / payments | Validated V1 | Owner/current-tenant dues, payer privacy, signed reconciliation and audit; payment-method-specific/UPI UX deferred until gateway contract exposes it |
| Reports / audit | Validated V1 | Operational summaries, finance redaction for non-finance report readers and advanced-report entitlement enforcement |
| Notifications / updates | Validated V1 baseline | Occupant-based gate notifications, push/in-app routing and domain-backed Resident Updates timeline; persisted read/unread inbox semantics are not yet defined |
| Privacy UX | Validated V1 disclosure | Resident privacy/data-use screen describes current processing without unsupported retention, rights-automation or regulatory-compliance claims |
| Health / runtime readiness | Validated V1 | Liveness independent; readiness validates PostgreSQL and auth state; production auth state requires Redis/Valkey via `REDIS_URL` |
| CI / release controls | Hardened | Frozen lockfile installs, API/Admin/Flutter validation, dependency audit, staging smoke and backup/restore drill |
| Hosted production evidence | Pending external setup | Real provider deployment, managed backups/PITR, hosted restore, monitoring, secrets and production integrations still require hosted evidence |

## Security findings closed in this remediation
- Society-scoped role administration explicitly forbids `SUPER_ADMIN`, `SOCIETY_ADMIN`, vendor and relationship-role grants.
- Operational role deactivation revokes active sessions for the affected user/society.
- Tenant resident creation no longer overwrites an existing user's global canonical name.
- Platform-only society/entitlement and provider-verification operations are separated from society-management permissions.
- Physical gate execution requires an active guard-to-gate assignment and is not inherited by Super Admin.
- Independent-home sessions remain outside society-role inheritance.
- Marketplace owner/occupant authorization, confirmation, terminal transitions and rating retries are concurrency-safe and idempotent where required.

## Current release direction
The active milestone is **Commercial V1 consolidated release validation**. The repository-level V1 implementation gaps identified in the prior audit are now closed or reclassified as non-blocking UX enhancements. No additional feature expansion should enter this candidate unless it fixes a blocker or regression.

Required sequence:
1. merge the remaining validated V1 polish/documentation changes to `develop`;
2. reconcile the small staging-only release-history delta without force-reset/rebase;
3. promote the exact consolidated candidate to `staging`;
4. run full protected CI, staging smoke and backup/restore evidence on the exact candidate;
5. execute updated security/UAT acceptance, including platform-role boundary, property setup, parking, marketplace provider lifecycle, multi-property/independent-home behavior and real-device Guard flows;
6. collect hosted staging/production dependency evidence separately;
7. protected `staging → main` promotion with independent approval;
8. verify post-main CI and reconcile release history to `develop`.

## Non-blocking / explicitly deferred work
- Regional-language Guard UI is intentionally excluded from the current scope.
- UPI-first Resident UI waits for an explicit gateway payment-method/intent contract.
- Persisted notification read/unread state waits for an inbox persistence/retention contract.
- Advanced amenity scheduling/rules/payment integration remains post-V1; the entitlement-controlled amenity baseline already exists.
- Recurring visitors, parcel-at-gate, move-in/move-out, masked communication, advanced parking and hardware/ANPR integrations remain post-V1 unless pilot/UAT elevates them.

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
