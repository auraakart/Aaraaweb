# Aaraagate Requirements Traceability

Updated: 2026-09-16

`PRODUCT_REQUIREMENTS.md` is the product-scope source of truth. `AARAAGATE-V2-PROGRAM.md` is the detailed V2 delivery baseline. This document records repository implementation and acceptance state. Hosted staging, real-device/human UAT and production operations are tracked separately and are never inferred from code presence or green CI alone.

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
| Notices | Validated | Audience policy plus V2 targeting/scheduling/attachment/observability extensions |
| Helpdesk / SOS | Validated / hardened | Tenant-scoped lifecycles plus SLA/escalation and emergency incident hardening |
| Amenities | Validated / hardened | Booking baseline plus V2 policy controls |
| External Services marketplace | Validated / hardened | Provider lifecycle, multiple-provider comparison, media/offers/commercial controls, booking/rating/dispatch |
| Billing / payments | Validated / hardened | Dues, eligible owner/tenant payment, signed reconciliation, exception handling and audit |
| Reports / audit | Validated | Finance redaction, advanced-report entitlement, operational audit and controlled exports |
| Privacy UX / operations | Implemented baseline | Disclosure baseline plus V2 auditable privacy operations; human policy review remains separate |
| CI / release controls | Hardened | API/Admin/Flutter validation, dependency audit and release-control contracts |
| Hosted production evidence | Pending external setup | Hosted infrastructure/provider/Play evidence remains operational work |

## V2 requirement traceability
Status values below describe repository implementation only. **Human acceptance pending** does not mean the code is incomplete; it means the corresponding role/device/policy evidence has not yet been executed.

| Requirement | Priority | Repository status | Current evidence / remaining non-production work |
|---|---|---|---|
| V2-RBAC Administrative segregation of duties | P0 | **Implemented; human acceptance pending** | Explicit V2 permissions are consumed by domain APIs; restricted-role negative contract is green. Scoped `READ_ONLY_AUDITOR` responsibility and dedicated read-only workspace are implemented on the functional-closure branch. Human role-session UAT remains. |
| V2-FIN Full society accounting | P0 | **Implemented baseline / hardened** | `services/api/src/accounting`, finance permissions, ledger/report/export/reconciliation controls and Admin finance surfaces are present. Accountant/Treasurer human acceptance remains. |
| V2-OCC Move-in/move-out and tenancy lifecycle | P0 | **Implemented baseline / hardened** | Occupancy lifecycle APIs/Admin flow, owner-versus-occupant authority separation and revocation behavior are present. Real-society policy configuration remains pilot evidence. |
| V2-GOV Society governance | P0/P1 | **Implemented baseline / hardened** | `services/api/src/governance`, committee/governance permissions and Admin governance workflows are present. Bye-law-dependent configuration remains pilot evidence. |
| V2-EMR Emergency/incident operations | P0/P1 | **Implemented / hardened** | SOS routing, fallback delivery, broadcast/acknowledgement, assignment, evidence, timeline and closure are implemented. Real-device emergency-response UAT remains. |
| V2-PRV Privacy/data lifecycle | P0 | **Implemented baseline / hardened** | Privacy operations, retention/conflict controls, processor/vendor hooks and audit requirements are represented in the V2 implementation. Human policy/security review remains. |
| V2-PAY Payment exception hardening | P0 | **Implemented / hardened** | Gateway transaction truth remains separate from accounting; duplicate/idempotency/reconciliation/refund/exception controls and auditable events are implemented. Live provider E2E remains productionization. |
| V2-FAC Assets/AMCs/work orders | P1 | **Implemented baseline / hardened** | `services/api/src/facilities` and Admin facilities, preventive maintenance, contracts/evidence and health/alert surfaces are present. Human facility-role UAT remains. |
| V2-VND Society vendors/procurement | P1 | **Implemented baseline** | Society-vendor bounded context and capability permissions are separate from consumer External Services. Pilot workflow evidence remains. |
| V2-DOC Document repository | P1 | **Implemented baseline / hardened** | `services/api/src/documents`, classified access and server-authorized document flow are present. Hosted object-storage evidence is productionization. |
| V2-HLP Helpdesk SLA/escalation | P1 | **Implemented / hardened** | SLA/TAT, assignment/escalation, notes/evidence/reopen/analytics support is present in `services/api/src/helpdesk`. Human helpdesk acceptance remains. |
| V2-COM Communication governance | P1 | **Implemented / hardened** | Notice targeting, schedule/expiry, attachments, acknowledgement/delivery observability and metrics are implemented. Legal-delivery claims remain intentionally excluded. |
| V2-AMN Amenity policy engine | P1 | **Implemented baseline / hardened** | Capacity/booking rules, approval and booking policy controls are present. Real-society policy acceptance remains. |
| V2-PRC Parcel desk | P1 | **Implemented / hardened** | Custody, recipient/collection handling, reminders/escalation and history are implemented in `services/api/src/parcels`. Real guard/resident flow UAT remains. |
| V2-PRK Advanced parking | P1/P2 | **Partial; non-blocking P2 remainder** | Allocations, visitor/temporary permits, history and EV-ready slot metadata are implemented. Configurable second-car policy, external credential references and incorrect-parking reports remain optional P2 depth. |
| V2-UTL Meter/utilities | P2 | **Optional / advanced** | Optional V2.3 scope; not a launch blocker unless explicitly promoted into release scope. |
| V2 digital statutory election | Conditional | **Conditional / policy-gated** | Statutory election behavior remains disabled unless a target society's governing framework permits it; non-statutory polls/surveys may operate separately. |

## Current non-production functional closure

After the 2026-09-16 live-code reconciliation, the mandatory repository-side closure items are:

1. Complete the scoped read-only Auditor responsibility workflow and automated authorization checks.
2. Keep requirements/traceability synchronized with live implementation.
3. Preserve negative tenant/RBAC regression coverage as new domain work is added.

The following are **not** repository feature gaps and remain separate acceptance/release gates:
- human role UAT for Accountant/Treasurer, Committee, Facility, Security Supervisor and Auditor;
- Resident/Guard real-device pilot acceptance;
- real-society policy/bye-law configuration acceptance;
- hosted staging acceptance and provider E2E;
- backup/restore/rollback, monitoring/alerts, signed Android/Play and production operations.

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
