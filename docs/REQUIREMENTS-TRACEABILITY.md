# Aaraagate Requirements Traceability

Updated: 2026-09-19

`PRODUCT_REQUIREMENTS.md` is the product-scope source of truth. `AARAAGATE-V2-PROGRAM.md` is the detailed V2 delivery baseline. This document records repository implementation and acceptance state. Hosted staging, real-device/human UAT and production operations are tracked separately and are never inferred from code presence or green CI alone.

## V1 implementation baseline
Dedicated Admin consolidation is tracked separately in [V4.22](AARAAGATE-V4.22-PROGRAM.md). Status: **V4.22.0 foundation implemented and validating; migrations pending**. The [shared design system](ADMIN-DESIGN-SYSTEM.md) records all 16 contracts and the route inventory. Full acceptance still requires sequentially validated migrations of Helpdesk, Privacy, Facilities, Documents, Occupancy and Finance/Governance. Domain acceptance below does not imply completion of this UI/UX milestone.

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
| Privacy UX / operations | Validated / hardened | Auditable privacy cases, typed operator workflows, retention/legal-hold controls, readiness/conflict evidence, registry/incident/grievance context and Resident self-service/export clarity; human privacy/legal review remains separate |
| CI / release controls | Hardened | API/Admin/Flutter validation, dependency audit and release-control contracts |
| Hosted production evidence | Pending external setup | Hosted infrastructure/provider/Play evidence remains operational work |

## V2 requirement traceability
Status values below describe repository implementation only. **Human acceptance pending** does not mean the code is incomplete; it means the corresponding role/device/policy evidence has not yet been executed.

| Requirement | Priority | Repository status | Current evidence / remaining non-production work |
|---|---|---|---|
| V2-RBAC Administrative segregation of duties | P0 | **Implemented; human acceptance pending** | Explicit V2 permissions are consumed by domain APIs; restricted-role negative contract is green. Scoped `READ_ONLY_AUDITOR` responsibility and dedicated read-only workspace are implemented on the functional-closure branch. Human role-session UAT remains. |
| V2-FIN Full society accounting | P0 | **Implemented / hardened** | `services/api/src/accounting`, finance permissions, immutable ledger/report/export/reconciliation controls and Admin finance surfaces are present. V4.11 adds reconciliation review health, read-only exact-movement candidates and export date presets. V4.14 adds tenant-scoped close readiness, race-safe irreversible period close with draft-journal blocking and actor evidence, an accountant period-close/reporting workspace reusing the existing reporting engine, and typed bounded operator controls replacing raw UUID/browser-prompt actions. Accountant/Treasurer human acceptance remains. |
| V2-OCC Move-in/move-out and tenancy lifecycle | P0 | **Implemented / hardened** | V4.17 adds tenant-scoped operator context, registered-mobile move-in, selector-based move-out, persistent review/checklist/document controls, descriptive readiness/handover evidence for checklist/documents/vehicles/workforce/parking/gate authority, and Resident property-aware status/next-action/timeline UX. Effective-date blocking, checklist readiness, ownership/occupancy separation and move-out gate-authority revocation remain server-authoritative. Real-society rental/police-verification/legal policy acceptance remains external. |
| V2-GOV Society governance | P0/P1 | **Implemented / hardened** | `services/api/src/governance`, committee/governance permissions and Admin workflows are present. V4.15 adds typed committee/meeting operations, descriptive readiness/closure evidence, configurable quorum/approval/bye-law references, auditable action status/owner/due-date follow-through and overdue visibility. Society-specific bye-law/legal acceptance remains external. |
| V2-EMR Emergency/incident operations | P0/P1 | **Implemented / hardened** | SOS routing, fallback delivery, broadcast/acknowledgement, assignment, evidence, timeline and closure are implemented. Real-device emergency-response UAT remains. |
| V2-PRV Privacy/data lifecycle | P0 | **Implemented / hardened** | V4.19 replaces raw UUID/browser-dialog case operations with privacy-scoped subject/assignee context and persistent typed controls; adds read-only assignment/overdue/retention/legal-hold readiness evidence with active data-category, processor, incident and grievance-contact context; and improves Resident self-service with status-specific next actions, operational targets, active grievance contact and server-authorized completed ACCESS exports. Erasure remains governed by server-generated blockers and fail-closed execution. Jurisdiction-specific legal/privacy acceptance remains external. |
| V2-PAY Payment exception hardening | P0 | **Implemented / hardened** | Gateway transaction truth remains separate from accounting; duplicate/idempotency/reconciliation/refund/exception controls and auditable events are implemented. Live provider E2E remains productionization. |
| V2-FAC Assets/AMCs/work orders | P1 | **Implemented / hardened** | V4.20 adds facilities-scoped active-assignee context, typed work-order/preventive-plan assignment, persistent completion/cancellation controls, append-only work-order history, read-only asset/work-order readiness and critical-work prioritization, contract-to-preventive-plan linkage/expiry clarity, plus plan-to-generated-work/contract/evidence drill-down. Existing controlled transitions, duplicate-safe preventive generation and tenant-scoped provider/evidence boundaries remain authoritative. Human facility-role UAT and physical/field maintenance outcomes remain external. |
| V2-VND Society vendors/procurement | P1 | **Implemented / hardened** | Society-vendor bounded context remains separate from consumer External Services. V4.16 exposes quotation comparison/selection, PO issuance, finance-scoped PO→expense-draft handoff with one-PO/one-expense protection, and tenant-scoped vendor contract/SLA/expiry lifecycle evidence with append-only events. Real vendor onboarding and society procurement-policy acceptance remain external. |
| V2-DOC Document repository | P1 | **Implemented / hardened** | V4.18 adds tenant-scoped property targeting for property-owner-only documents, friendly management context, append-only lifecycle history, controlled supersession/version lineage that preserves prior published evidence, and Resident access to the real server-authorized published repository with current version/audience/property context and bounded download intents. Upload metadata verification and safety scanning remain required. Hosted object-storage acceptance and statutory/legal document validity remain external. |
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



## V4.16 Society Vendor, Resident & Operations Depth closure

The V4.16 repository cycle is complete on `develop`:

1. **Procurement operator depth:** Admin exposes request drill-down, quotation entry/comparison, explicit quote selection, PO issuance and append-only procurement request evidence with sequencing guidance.
2. **Procurement/accounting handoff:** Finance users can inspect issued POs, distinguish pending versus linked accounting state and create the existing exact-amount SocietyExpense draft under FINANCE_MANAGE; one PO cannot create multiple linked expense drafts.
3. **Vendor lifecycle evidence:** society-vendor contracts record type, dates, renewal notice, SLA/document references and ACTIVE/EXPIRED/TERMINATED state with append-only tenant-scoped lifecycle evidence and explicit no-legal-validity wording.
4. **Resident daily brief:** property-scoped Home prioritization now includes active helpdesk work alongside billing, services and notices, with high/critical helpdesk work surfaced ahead of routine updates.
5. **Facilities operator ergonomics:** inventory stock movements use persistent typed controls rather than browser prompts, preserve optional work-order linkage and keep stock-integrity guidance visible.
6. **Resident Community hub:** Resident navigation includes a live Community surface backed by governance/community meetings, documents, notices/helpdesk context and existing community-poll capabilities rather than static placeholders.
7. **Integration readiness boundaries:** automated contract tests verify payment, WhatsApp, smart-gate and object-storage provider ports stay vendor-neutral/fail-closed; this is repository readiness evidence, not real-provider acceptance.
8. **External boundary:** real vendor onboarding, procurement-policy acceptance, contract legal review, hosted infrastructure, live provider credentials/callbacks, physical device validation and representative-device/human UAT remain external.

V4.16 repository completion does **not** increase Production/field readiness without external evidence.


## V4.17 Occupancy Lifecycle & Property Operations Depth closure

The V4.17 repository cycle is complete on `develop` after the closure branch merges:

1. **Operator ergonomics:** Admin move-in/move-out workflows use tenant-scoped unit/occupancy selectors, registered-mobile resident resolution, and persistent typed review/checklist/document controls instead of raw UUID entry or browser prompts.
2. **Readiness and handover evidence:** authorized operators can inspect mandatory checklist completion, document verification, active vehicle/workforce/parking counts and current gate-authority state as descriptive handover signals. These signals do not independently determine legal or police-verification validity.
3. **Resident move experience:** Resident self-service now shows property labels, status-aware next-action guidance, required-vs-total readiness and an event timeline while preserving server-side ownership/occupancy checks.
4. **Lifecycle safety:** effective-date enforcement, required-checklist blocking and move-out revocation of primary gate contact, approval and notification authority remain unchanged and covered by regression tests.
5. **External boundary:** real-society rental/police-verification policy acceptance, representative-device human UAT, hosted production behavior and field move outcomes remain external.

V4.17 repository completion does **not** increase Production/field readiness without external evidence.


## V4.18 Document Repository & Records Governance Depth closure

The V4.18 repository cycle is complete on `develop` after the closure branch merges:

1. **Operator depth:** Admin property-owner-only document publishing now requires a tenant-scoped property selector and supplies the server-required `unitId`; management rows expose friendly property context and append-only lifecycle history.
2. **Controlled version lineage:** published documents can create at most one active replacement draft. Replacement drafts inherit classification/audience/property scope, increment version automatically, and publishing the replacement atomically publishes the new record, archives the prior published record and appends `VERSION_REPLACED` evidence. Prior document records are preserved rather than destructively overwritten.
3. **Resident repository access:** Resident Community consumes the real server-authorized `/documents/published` repository, shows current version/audience/property context and obtains downloads only through authorized server-issued download intents. Governance document references remain a separate surface rather than being conflated with the society document repository.
4. **Storage/security boundaries:** private object-storage prefixes, upload metadata verification, safety scanning, tenant scoping and audience/property authorization remain enforced server-side.
5. **External boundary:** hosted object-storage acceptance, statutory/legal document validity, retention-law interpretation, representative-device UAT and field document outcomes remain external.

V4.18 repository completion does **not** increase Production/field readiness without external evidence.


## V4.19 Privacy Operations & Data Lifecycle Depth closure

The V4.19 repository cycle is complete on `develop` after the closure branch merges:

1. **Privacy operator depth:** society privacy operations use privacy-scoped subject and assignee selectors, due dates and persistent typed controls for case status, legal hold and retention review; browser prompt/alert/confirm flows and raw subject UUID entry are removed.
2. **Readiness/conflict evidence:** authorized operators can inspect descriptive assignment/overdue state, legal-hold and retention blockers, active data-category/processor counts, open privacy incidents, grievance-contact state and server erasure blockers without changing the underlying execution rules.
3. **Resident self-service clarity:** authenticated subjects see status-specific next actions, operational target dates, retention-hold context, configured active grievance contact and completed ACCESS export availability. Export access remains self-only and server-authorized.
4. **Safety boundaries:** tenant/resource permissions, subject ownership, append-only case evidence, retention/legal-hold blocking and governed erasure/minimisation remain server-authoritative.
5. **External boundary:** jurisdiction-specific rights interpretation, qualified privacy/legal review, real-society policy acceptance, representative-device UAT, hosted production behavior and field privacy outcomes remain external.

V4.19 repository completion does **not** increase Production/field readiness without external evidence.


## V4.20 Facilities, Assets & Work-Order Depth closure

The V4.20 repository cycle is complete on `develop` after the closure branch merges:

1. **Operator depth:** facilities work orders and preventive plans use tenant-scoped active-assignee selectors; work-order completion/cancellation uses persistent typed controls; append-only work-order history includes actor evidence.
2. **Readiness evidence:** Admin exposes descriptive overdue, assignment, asset-state, evidence and critical-work signals with next-action guidance while preserving existing lifecycle transitions.
3. **Contract/preventive depth:** service contracts expose linked preventive-plan title/state/next-due context; preventive-plan drill-down shows generated work orders, linked contracts and related maintenance evidence without changing generation or contract mutation rules.
4. **Safety boundaries:** FACILITIES_READ/FACILITIES_MANAGE, tenant scoping, active-assignee validation, duplicate-safe preventive generation and controlled work-order transitions remain server-authoritative.
5. **External boundary:** facility-team human UAT, physical inspection outcomes, provider/AMC legal validity, hosted production behavior and field maintenance outcomes remain external.

V4.20 repository completion does **not** increase Production/field readiness without external evidence.
