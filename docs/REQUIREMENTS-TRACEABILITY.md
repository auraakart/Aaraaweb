# Aaraagate Requirements Traceability

Updated: 2026-09-12

`PRODUCT_REQUIREMENTS.md` is the product-scope source of truth. `AARAAGATE-V2-PROGRAM.md` is the detailed V2 delivery baseline. This document records implementation/acceptance state.

## V1 implementation baseline
| Area | Status | Current acceptance state |
|---|---|---|
| Foundation / monorepo | Validated | Modular API, Flutter Resident/Guard, Next.js Admin, strict CI |
| Authentication/session | Hardened | OTP abstraction, Redis-backed production auth state, rotation/revocation and suspended/inactive checks |
| Tenancy / RBAC | Hardened | Society isolation, typed permissions, platform/tenant boundary, owner/occupant separation, independent-home isolation |
| Society structure | Validated | Society → Building/Block → Floor → Unit → household |
| SaaS entitlements | Validated | Tier/feature resolution, overrides and client/server enforcement |
| Visitor / gate / delivery / cab | Validated / hardened | Occupant routing, QR/OTP, guard assignment, audit, idempotent offline recovery |
| Household / owner / tenant | Validated | Ownership and occupancy independent; stale relationships revoke authority |
| Vehicles / parking baseline | Validated | Resident vehicles and Admin parking assignment baseline |
| Workforce / domestic help | Validated | Assignment, leave, rating, suspension and gate integration |
| Notices | Validated | Owner-only / owner+occupant audience logic |
| Helpdesk / SOS | Validated baseline | Tenant-scoped resident and operations lifecycles |
| Amenities | Validated baseline | Booking baseline and entitlement controls |
| External Services marketplace | Validated / hardened | Provider lifecycle, multiple-provider comparison, media/offers/commercial controls, booking/rating/dispatch |
| Billing / payments | Validated baseline | Dues, eligible owner/tenant payment, signed reconciliation and audit |
| Reports / audit | Validated | Finance redaction, advanced-report entitlement, operational audit |
| Privacy UX | Validated disclosure baseline | Current data-use disclosure without unsupported compliance claims |
| CI / release controls | Hardened | API/Admin/Flutter validation, dependency audit, staging smoke and backup/restore drill |
| Hosted production evidence | Pending external setup | Hosted infrastructure/provider/Play evidence remains operational work |

## V2 requirement traceability
Status values: **Started**, **Planned P0**, **Planned P1**, **Planned P2**, **Conditional**.

| Requirement | Priority | Status | Initial implementation evidence / acceptance target |
|---|---|---|---|
| V2-RBAC Administrative segregation of duties | P0 | **Started** | V2 domain permissions added to `permission.types.ts`; negative SoD unit tests added. Controllers/services must consume permissions as each domain ships. |
| V2-FIN Full society accounting | P0 | Planned P0 | Ledger/journal/fund/bank/budget/payable model; immutable adjustments; finance authorization and reports. |
| V2-OCC Move-in/move-out and tenancy lifecycle | P0 | Planned P0 | Workflow around existing `UnitOwnership`/`UnitOccupancy`; configurable documents/approvals; atomic authority revocation. |
| V2-GOV Society governance | P0/P1 | Planned P0 | Committee tenure, meetings, minutes, resolutions/action items and configurable governance evidence. |
| V2-EMR Emergency/incident operations | P0/P1 | Planned P0 | Categorized incidents, control-room escalation, broadcast/ack, timeline/evidence/closure and fallback delivery semantics. |
| V2-PRV Privacy/data lifecycle | P0 | Planned P0 | Auditable privacy request cases, retention checks, processor/vendor hooks and personal-data incident workflow. |
| V2-PAY Payment exception hardening | P0 | Planned P0 | Debited-unconfirmed, duplicate, reversal/refund and dispute workflows; accounting allocation separate from gateway state. |
| V2-FAC Assets/AMCs/work orders | P1 | Planned P1 | Asset register, preventive maintenance, AMC/warranty, work orders, inspections/evidence/cost/escalation. |
| V2-VND Society vendors/procurement | P1 | Planned P1 | Separate bounded context from External Services; vendor/contracts/quotes/optional PR-PO/invoice/SLA. |
| V2-DOC Document repository | P1 | Planned P1 | Classified document metadata + server-authorized object access and domain associations. |
| V2-HLP Helpdesk SLA/escalation | P1 | Planned P1 | Severity/priority/SLA, assignment/escalation, internal/public notes, reopen, satisfaction and analytics. |
| V2-COM Communication governance | P1 | Planned P1 | Targeting, schedule/expiry, attachments, optional acknowledgement and metrics without unsupported legal-delivery claims. |
| V2-AMN Amenity policy engine | P1 | Planned P1 | Capacity/quotas/windows/cooling-off/guests/pricing/deposit/refund/blackout/approval rules. |
| V2-PRC Parcel desk | P1 | Planned P1 | Leave-at-gate custody, collection acknowledgement/OTP, escalation, history and overstay linkage. |
| V2-PRK Advanced parking | P1/P2 | Planned P2 | Allocations, visitor/temporary parking, additional-vehicle policy, credentials, violations and EV readiness. |
| V2-UTL Meter/utilities | P2 | Planned P2 | Optional meter/readings/tariffs/history/billing integration. |
| V2 digital statutory election | Conditional | Conditional | Implement only after target-society legal/bye-law policy confirms the permitted workflow; polls/surveys may ship independently. |

## V2 foundation acceptance state
Current branch: `feat/aaraagate-v2-foundation-20260912`.

Completed in this first slice:
- V2 product specification promoted from deferred comments into approved requirement domains.
- Phased V2 implementation roadmap created.
- Architecture expanded with Finance, Governance, Occupancy Lifecycle, Facilities, Society Vendors, Documents, Privacy, Emergency and Parcel bounded contexts.
- Explicit code permissions introduced for finance/governance/facilities/vendors/documents/privacy operations.
- Segregation-of-duties tests prevent Committee/Facility/Security/resident roles from inheriting inappropriate financial or administrative mutation rights.
- Society Admin receives finance read, not finance mutation, as the initial V2 baseline.
- Privacy mutation remains platform-only until a scoped privacy workflow defines safe delegation.

## Cross-cutting V2 acceptance requirements
Every V2 domain must prove:
1. society/resource scoping and cross-tenant negative tests;
2. capability authorization and segregation of duties;
3. feature entitlement where commercially gated;
4. repeatable clean + supported upgrade-path migrations;
5. audited privileged mutations;
6. safe PII/payment logging;
7. loading/empty/error/denied UI states;
8. failure/concurrency/idempotency behavior where relevant;
9. requirement/document updates;
10. full milestone-boundary regression and staging validation before production promotion.

Additional finance requirements:
- payment-gateway transaction truth is separate from accounting truth;
- financial corrections preserve audit history;
- applicable tax behavior is configurable rather than universally assumed.

Additional governance/legal-policy requirements:
- state/bye-law-dependent behavior is configurable;
- product/UI documentation avoids unsupported legal validity claims.

Additional privacy requirements:
- request decisions are auditable;
- destructive operations fail safely when retention/legal/security/accounting conflicts exist.

## Production truth
A green V2 repository release does not mean the product is operationally live. Production still requires hosted API/Admin, production PostgreSQL/Redis, provider credentials, domains/TLS, managed backup/PITR and restore evidence, monitoring/alert ownership, signed Android/Play evidence and real-society pilot acceptance.
