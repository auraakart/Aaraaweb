# Aaraagate Requirements Traceability

Updated: 2026-09-18

`PRODUCT_REQUIREMENTS.md` is the product-scope source of truth. `AARAAGATE-V2-PROGRAM.md` is the detailed V2 delivery baseline. This document records repository implementation and acceptance state. Hosted staging, real-device/human UAT and production operations are tracked separately and are never inferred from code presence or green CI alone.

## V1 implementation baseline
| Area | Status | Current acceptance state |
|---|---|---|
| Foundation / monorepo | Validated | Modular API, Flutter Resident/Guard, Next.js Admin, strict CI |
| Authentication/session | Hardened | OTP abstraction, Redis-backed production auth state, rotation/revocation and suspended/inactive checks |
| Tenancy / RBAC | Hardened | Society isolation, typed permissions, platform/tenant boundary, owner/occupant separation, independent-home isolation |
| Society structure | Validated | Society → Building/Block → Floor → Unit → household |
| SaaS entitlements | Validated | Tier/feature resolution, overrides and client/server enforcement |
| Visitor / gate / delivery / cab | Validated / hardened | Occupant routing, QR/OTP, guard assignment, audit, idempotent offline recovery, eight-language Guard cues and review-before-submit voice quick-fill |
| Household / owner / tenant | Validated | Ownership and occupancy independent; stale relationships revoke authority |
| Vehicles / parking baseline | Validated / hardened | Resident vehicles, parking allocations, visitor/temporary permits, configurable allocation policy, credentials, violations, EV-readiness metadata and Admin operations |
| Workforce / domestic help | Validated | Assignment, leave, rating, suspension and gate integration |
| Notices | Validated | Audience policy plus V2 targeting/scheduling/attachment/observability extensions |
| Helpdesk / SOS | Validated / hardened | Tenant-scoped lifecycles plus SLA/escalation and emergency incident hardening |
| Amenities | Validated / hardened | Booking/policy controls plus attendance check-in/completion/no-show, deterministic FIFO waitlist/promotion, property-scoped Resident queue UX and read-only operations analytics |
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
| V2-FIN Full society accounting | P0 | **Implemented / hardened** | `services/api/src/accounting`, finance permissions, immutable ledger/report/export/reconciliation controls and Admin finance surfaces are present. V4.11 adds reconciliation review health, read-only exact-movement candidates and export date presets. V4.14 adds tenant-scoped close readiness, race-safe irreversible period close with draft-journal blocking and actor evidence, an accountant period-close/reporting workspace reusing the existing reporting engine, and typed bounded operator controls replacing raw UUID/browser-prompt actions. Accountant/Treasurer human acceptance remains. |
| V2-OCC Move-in/move-out and tenancy lifecycle | P0 | **Implemented baseline / hardened** | Occupancy lifecycle APIs/Admin flow, owner-versus-occupant authority separation and revocation behavior are present. Real-society policy configuration remains pilot evidence. |
| V2-GOV Society governance | P0/P1 | **Implemented / hardened** | `services/api/src/governance`, committee/governance permissions and Admin workflows are present. V4.15 adds typed committee/meeting operations, descriptive readiness/closure evidence, configurable quorum/approval/bye-law references, auditable action status/owner/due-date follow-through and overdue visibility. Society-specific bye-law/legal acceptance remains external. |
| V2-EMR Emergency/incident operations | P0/P1 | **Implemented / hardened** | SOS routing, fallback delivery, broadcast/acknowledgement, assignment, evidence, timeline and closure are implemented. Real-device emergency-response UAT remains. |
| V2-PRV Privacy/data lifecycle | P0 | **Implemented baseline / hardened** | Privacy operations, retention/conflict controls, processor/vendor hooks and audit requirements are represented in the V2 implementation. Human policy/security review remains. |
| V2-PAY Payment exception hardening | P0 | **Implemented / hardened** | Gateway transaction truth remains separate from accounting; duplicate/idempotency/reconciliation/refund/exception controls and auditable events are implemented. Live provider E2E remains productionization. |
| V2-FAC Assets/AMCs/work orders | P1 | **Implemented baseline / hardened** | `services/api/src/facilities` and Admin facilities, preventive maintenance, contracts/evidence and health/alert surfaces are present. Human facility-role UAT remains. |
| V2-VND Society vendors/procurement | P1 | **Implemented / hardened** | Society-vendor bounded context remains separate from consumer External Services. V4.16 exposes request drill-down, quotation comparison/selection, PO issuance and append-only procurement history; adds finance-scoped PO handoff with FINANCE_READ/FINANCE_MANAGE segregation and one-PO/one-expense linkage; and adds tenant-scoped vendor contract/SLA/expiry records with descriptive lifecycle state and visible append-only event history. Real vendor onboarding, procurement-policy acceptance, contract/legal review and vendor-staff gate identity linkage remain external/deferred. |
| V2-DOC Document repository | P1 | **Implemented baseline / hardened** | `services/api/src/documents`, classified access and server-authorized document flow are present. Hosted object-storage evidence is productionization. |
| V2-HLP Helpdesk SLA/escalation | P1 | **Implemented / hardened** | SLA/TAT, assignment/escalation, notes/evidence/reopen/analytics support is present in `services/api/src/helpdesk`. Human helpdesk acceptance remains. |
| V2-COM Communication governance | P1 | **Implemented / hardened** | Notice targeting, schedule/expiry, attachments, acknowledgement/delivery observability and metrics are implemented. Legal-delivery claims remain intentionally excluded. |
| V2-AMN Amenity policy engine | P1 | **Implemented / hardened** | Capacity/booking rules, approval controls, attendance lifecycle, configurable check-in/no-show timing, society/property-scoped FIFO waitlist with deterministic promotion, explicit Resident waitlist consent/position/history, and tenant-scoped descriptive operations analytics are present. No-show penalties, physical check-in hardware, predictive allocation and real-society policy outcomes remain external/conditional. |
| V2-PRC Parcel desk | P1 | **Implemented / hardened** | Custody, recipient/collection handling, reminders/escalation and history are implemented in `services/api/src/parcels`. Real guard/resident flow UAT remains. |
| V2-PRK Advanced parking | P1/P2 | **Implemented repository closure / hardened** | Allocations, visitor/temporary permits, history, EV-ready metadata, configurable active-vehicle allocation limits, optional credential-required policy, parking credential lifecycle and auditable incorrect-parking/violation reporting are implemented with tenant-scoped RBAC and Admin operations. Physical ANPR/RFID/EV hardware and real access providers remain explicitly external. |
| V2-UTL Meter/utilities | P2 | **Optional / advanced** | Optional V2.3 scope; not a launch blocker unless explicitly promoted into release scope. |
| V2 digital statutory election | Conditional | **Conditional / policy-gated** | Statutory election behavior remains disabled unless a target society's governing framework permits it; non-statutory polls/surveys may operate separately. |

## Current non-production functional closure

After the 2026-09-18 repository reconciliation, the requested repository-only closure batch is complete:

1. Advanced parking depth is implemented and validated: policy limits, credentials, visitor/temporary controls and violation handling.
2. Guard localization is app-wide for the critical gate vocabulary across English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi and Bengali.
3. Guard voice assistance provides persistent, opt-out, on-device spoken access-status cues; it does not depend on a cloud speech provider.
4. Requirements, roadmap and score evidence are reconciled to the merged implementation state.
5. Negative tenant/RBAC, cross-role E2E and application regression gates remain required for subsequent changes.

The following are **not** repository feature gaps and remain separate acceptance/release gates:
- human role UAT for Accountant/Treasurer, Committee, Facility, Security Supervisor and Auditor;
- Resident/Guard real-device pilot acceptance;
- real-society policy/bye-law configuration acceptance;
- hosted staging acceptance and real provider E2E;
- physical ANPR/RFID/boom-barrier/EV/access hardware validation;
- real payment/OTP/push/SMS/WhatsApp or other external-provider credentials and callbacks;
- backup/restore/rollback, monitoring/alerts, signed Android/Play and production operations.

## V4.11 competitive-depth closure

The V4.11 repository cycle is complete on `develop`:

1. Guard field UX: short-phrase device speech can draft delivery/cab quick arrivals in the active Guard language. Provider/type and destination are filled only when deterministic; ambiguous destinations require manual selection and voice never submits or approves access.
2. Finance depth: bank reconciliation now exposes review health and tenant-scoped read-only matching candidates, while the existing validated match mutation remains the only reconciliation write path. Admin exports add practical period presets including the Indian financial year.
3. AI Action Centre: authorized Admin roles receive read-only, severity-ordered operational cards grounded in finance, helpdesk, security and facilities sources. Cards prepare grounded queries only; existing mutation allow-lists and explicit confirmations remain unchanged.
4. Resident experience: the existing Updates timeline is reused, while Home adds active-property next actions for unsettled maintenance, active service bookings and current notices; settled/completed items are excluded.
5. Pilot readiness: `docs/v4.11-pilot-readiness.json` plus `scripts/check-v4.11-pilot-readiness.mjs` define machine-checked KPI/evidence rules and `docs/AARAAGATE-V4.11-PILOT-PLAYBOOK.md` defines Guard, Accountant and Admin/support training and escalation.

Repository completion does **not** claim field completion. The V4.11 manifest remains `REPOSITORY_READY_EXTERNAL_PENDING`, `fieldEvidenceStatus` is `NOT_STARTED`, and all field KPIs remain `PENDING_EXTERNAL`.

## V4.12 Smart Amenities closure

The V4.12 repository cycle is complete on `develop`:

1. **Attendance truth:** confirmed amenity bookings can be checked in, completed or marked no-show by authorized amenity managers. Check-in opening and no-show grace periods are configurable, with actor/note/timestamp evidence.
2. **Deterministic waitlist:** residents may join an exact amenity/time waitlist only when server-side capacity is full. Entries are society/property/user scoped, duplicate active entries are blocked, and future capacity release may promote the oldest currently eligible waiter under locking and fresh eligibility checks.
3. **Operations insight:** authorized Admin users receive a tenant-scoped 30-day descriptive snapshot of bookings, finalized attendance, no-shows, cancellations, waiting/promoted entries and per-amenity demand signals. The contract is explicitly non-predictive.
4. **Resident UX:** the active property's waitlist position/history is visible; only active WAITING entries can be left. A booking capacity conflict presents an explicit choice to join the waitlist, and no automatic enrollment occurs.
5. **Boundaries:** physical amenity access hardware, external messaging, automated no-show penalties, AI queue ranking and predictive demand/allocation remain excluded.

Repository completion does **not** constitute real-society amenity policy acceptance, representative-device acceptance or proof of utilization/waitlist outcomes.

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


## V4.13 Reliability, Accessibility & Product Polish closure

The V4.13 repository cycle is complete on `develop`:

1. **SOS property isolation and accessibility:** Resident SOS state is derived only from the active property, cross-property cancellation is blocked client-side, backend/internal error details are not surfaced raw, and emergency actions have semantic/large-text regression coverage.
2. **Parcel property isolation:** Resident parcel data and pickup/collection actions are restricted to the selected unit; stale cross-property actions fail closed and demo fixtures remain unit-scoped.
3. **Guard realtime resilience:** reconnect scheduling uses one cancellable timer, duplicate reconnects are avoided, and reconnect cannot restart after sign-out or controller disposal.
4. **Resident safe errors and premium states:** a shared safe error mapper replaces raw exception text in high-frequency Gate and Community Poll flows; Poll loading/error/empty/status states use shared premium components with large-text/error-leak regression coverage.
5. **Validation:** the latest functional feature head passed CI, Cross-role E2E, Security/Privacy, Role UAT, Policy Pilot, Pilot Acceptance, Staging Pilot and V4.11 Pilot Readiness contracts.

V4.13 repository completion does **not** constitute representative-device accessibility acceptance, real low-bandwidth field acceptance, hosted staging acceptance, real-society role/policy acceptance, production-provider acceptance or customer-outcome evidence. Those remain external.


## V4.14 Finance Close & Operator Workflow closure

The V4.14 repository cycle is complete on `develop`:

1. **Period-close integrity:** authorized finance users can inspect tenant-scoped close readiness and close an OPEN accounting period only when draft journals are resolved and posted/reversed ledger totals balance. The close mutation locks the period, records actor/time evidence and preserves the existing irreversible closed-period invariant.
2. **Close/reporting workspace:** Admin Finance exposes the selected period's close blockers and existing trial balance, income/expense, balance sheet and fund statement outputs in one accountant workflow. The reporting engine is reused rather than duplicated, and closing remains an explicit operator action.
3. **Finance operator ergonomics:** high-frequency finance actions no longer depend on browser prompts or raw UUID entry where repository data is already available. Expense approval selects active liability accounts, payable settlement selects posted journals and is bounded by outstanding value, allocation reversal uses an explicit bounded amount/reason form, and reconciliation refund/resolution use persistent typed controls.
4. **Regression protection:** Admin regression contracts fail if prompt-driven finance actions return or the typed close/operator contracts disappear. Functional heads passed the full source-change CI path plus cross-role, security/privacy and pilot contracts.
5. **Accounting boundaries:** gateway truth remains separate from accounting truth; no automatic journal posting, matching, refund execution or financial adjustment was introduced.

Repository completion does **not** constitute Accountant/Treasurer human acceptance, live-provider reconciliation/refund evidence, real-society accounting-policy acceptance, hosted-production evidence or field financial-outcome validation. Those remain external.


## V4.15 Governance Operations & Committee Workflow Depth closure

The V4.15 repository cycle closes the documented governance operator-depth gap:

1. **Operator ergonomics:** browser-prompt governance actions are replaced with persistent typed controls for committee tenure, agenda, resolutions, action items and meeting outcome/minutes.
2. **Readiness/closure evidence:** Admin can inspect descriptive meeting outcome, minutes, configured/recorded quorum values, rule/bye-law references, resolution approval evidence, unresolved proposed resolutions, action ownership gaps and append-only evidence events.
3. **Action follow-through:** governance actions support tenant-scoped OPEN / IN_PROGRESS / COMPLETED / CANCELLED transitions, owner and due-date updates, backend completion timestamps, overdue visibility and append-only ACTION_UPDATED evidence.
4. **Legal boundary:** the repository does not determine statutory quorum, resolution validity, legal compliance or society-specific bye-law interpretation.
5. **External acceptance remains:** committee human UAT, real-society bye-law/policy acceptance, representative browser/device acceptance and hosted production evidence remain outside repository completion.



## V4.16 Society Vendor & Procurement Operations Depth closure

The V4.16 repository cycle is complete on `develop`:

1. **Procurement operator depth:** Admin exposes request drill-down, quotation entry/comparison, explicit quote selection, purchase-order issuance and append-only procurement event history. The UI makes the existing quote-selection-before-approval sequence explicit for PO-bound requests.
2. **Finance handoff:** finance roles can inspect issued POs and accounting-link status through a FINANCE_READ-scoped view without gaining vendor-management permission. FINANCE_MANAGE users can create the existing SocietyExpense draft for the exact PO amount; the one-PO/one-expense invariant remains enforced.
3. **Vendor lifecycle evidence:** society-vendor contracts record configurable type, dates, renewal-notice window, SLA/document references and operator status. Descriptive CURRENT / EXPIRING_SOON / EXPIRED / TERMINATED lifecycle state is exposed with tenant-scoped append-only event history.
4. **Authorization and tenancy:** vendor lifecycle uses SOCIETY_VENDORS_READ/MANAGE, finance handoff uses FINANCE_READ/MANAGE, and service tests fail closed for cross-tenant vendor/contract access.
5. **Boundaries:** the repository does not determine contract legal validity, statutory procurement compliance, renewal obligations or vendor suitability. Vendor-staff gate linkage remains deferred until workforce/gate identity is re-audited.

Repository completion does **not** constitute real vendor onboarding, society procurement-policy acceptance, contract/legal acceptance, hosted-production evidence or field procurement outcomes.
