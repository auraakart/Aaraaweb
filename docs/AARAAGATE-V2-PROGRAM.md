# Aaraagate V2 Program

Version: 2.0 planning baseline  
Date: 2026-09-12  
Status: Approved direction / implementation started

## Purpose
Aaraagate V2 expands the validated V1 gated-community platform into a broader Indian residential-community operating system while preserving the simple resident and guard experience. V2 is driven by the Indian apartment-society gap review and must not weaken existing tenant isolation, owner/occupant separation, payment integrity, gate safety or release governance.

There is no single nationwide operating model for every Indian apartment association. State law, association/co-operative structure, registered bye-laws, local practice and professional advice may differ. Therefore legal/procedural behavior that can vary by jurisdiction or society must be configurable rather than hard-coded as a universal rule.

## Product experience rule
The Resident app remains consumer-focused:
- Home
- Gate
- Payments
- Services
- Community / Helpdesk
- Amenities

Accounting ERP, procurement, committee administration, facility asset management, privacy operations and audit-heavy workflows belong primarily in the Admin/Operations web application. Guard workflows remain deliberately task-focused.

## V2 target personas
Existing personas remain supported, with V2 operational responsibilities made explicit:
- Resident owner
- Tenant resident
- Family member
- Non-resident owner
- Multi-society / multi-property owner
- Independent-home user
- Security Guard
- Security Supervisor
- Society Admin / RWA administrator
- Committee Member / Committee Admin
- Facility / Estate Manager
- Accountant / Treasurer
- Helpdesk operator responsibility
- Read-only audit responsibility
- Society-appointed vendor/contractor
- External Services marketplace provider
- Super Admin / platform operations / support

V2 should prefer permission bundles and scoped responsibilities over multiplying permanent role enums unless a distinct persisted role is necessary.

## Scope priorities

### P0 — Core society operating requirements

#### V2-FIN — Full society accounting and finance
- Charge and maintenance-bill rule configuration.
- Unit/party ledger with auditable debit, credit and adjustment entries.
- Arrears, configurable late interest/penalty policy and waiver approval.
- Advance payments and unapplied credits.
- Receipts and payment allocation.
- Income and expense accounting.
- Bank-account register and reconciliation.
- Budget versus actual reporting.
- Corpus, sinking/reserve and other configurable funds.
- Vendor bills/payables and controlled payment approval.
- Financial statements, exports and audit-period/year-close support.
- GST/TDS fields and reports only where configured/applicable; Aaraagate must not assume universal tax treatment.
- Accounting truth is distinct from payment-gateway transaction truth. Gateway reconciliation must never directly rewrite historical ledger entries without an auditable accounting event.

#### V2-OCC — Move-in, move-out and tenancy lifecycle
- Owner initiates or admin records prospective tenancy.
- Tenancy/occupancy effective dates.
- Configurable document requirements and approvals.
- Move-in/out request and slot controls.
- Vehicle/workforce/access migration or revocation.
- Configurable deposits/charges where society policy requires them.
- Tenant exit atomically ends occupancy authority and gate/app privileges.
- Ownership remains separate from occupancy.
- Rental-agreement/police-verification requirements are configurable rather than nationally assumed.

#### V2-GOV — Society governance core
- Committee roster, office/tenure and handover history.
- AGM/SGM/committee meeting records.
- Agenda, attachments, minutes and resolutions.
- Resolution action items and accountable owners.
- Configurable quorum/approval evidence.
- Bye-laws/rules/document references.
- Polls/surveys may be supported; statutory/digital election behavior is optional and enabled only where the society's governing framework allows it.

#### V2-EMR — Emergency and incident management
- Emergency categories such as medical, fire and security.
- Security/control-room escalation independent of ordinary social notification flows.
- Configurable emergency contacts and selected household/family contacts.
- Mass emergency broadcast with acknowledgement where appropriate.
- Incident timeline, assignments, status, evidence and closure.
- Critical SOS delivery must have fallback/escalation semantics and must not depend only on the currently selected property screen.

#### V2-PRV — Privacy and data lifecycle
- Clear privacy notice and purpose mapping.
- Data-category inventory and retention policy hooks.
- Privacy/grievance contact configuration.
- Request workflow for access/correction/erasure or other applicable data-principal requests.
- Consent/withdrawal records only where consent is the applicable basis/workflow.
- Processor/vendor register and privacy/security obligations.
- Personal-data incident/breach workflow.
- Children/minor-data protections where applicable.
- Auditable decisions; destructive privacy actions must not silently bypass statutory, accounting, security or dispute-retention obligations.
- Product documentation must avoid unsupported claims of universal statutory compliance.

#### V2-PAY — Payment exception hardening
- Never store raw customer card credentials.
- Gateway/server reconciliation is authoritative for payment transaction state.
- Debited-but-not-confirmed state.
- Duplicate detection.
- Reversals and refunds.
- Dispute/escalation references.
- Immutable/auditable payment events and accounting allocations.

#### V2-RBAC — Society operations segregation of duties
Capability boundaries must exist for:
- Finance read/manage
- Governance read/manage
- Facilities read/manage
- Society vendors read/manage
- Documents read/manage
- Privacy operations read/manage

Committee, Facility, Accountant and Society Admin responsibilities must not collapse into one unrestricted administrative role. Read-only audit access should be introduced as a scoped permission bundle/workflow before production V2.

### P1 — Operational depth

#### V2-FAC — Assets, AMCs and facility operations
- Asset register for lifts, DG, pumps, STP/WTP, fire systems, CCTV/access-control, clubhouse/pool, electrical/plumbing and other common assets.
- Asset criticality, location and ownership.
- AMC/contract/warranty dates and expiry reminders.
- Preventive maintenance plans.
- Breakdown/service work orders.
- Inspections, evidence, service history and cost history.
- Spare/inventory references where useful.
- Escalation for overdue critical/statutory maintenance.

#### V2-VND — Society vendors and procurement
This domain is separate from the consumer External Services marketplace.
- Vendor master and contacts.
- Contracts/AMCs.
- Quotation comparison.
- Purchase request/order where society policy uses them.
- Vendor invoice linkage and approval workflow.
- SLA/expiry tracking.
- Vendor workforce/gate linkage where required.

#### V2-DOC — Society document repository
- Bye-laws and registration documents.
- Insurance and statutory certificates.
- AMC/vendor contracts.
- Audit reports and financial attachments.
- Meeting minutes/resolutions.
- Circular archive.
- Audience/access classification: committee-only, admin-only, finance, owner-only, resident-visible or public/community as configured.
- Object storage with authorization at download time; obscurity/private URLs alone are insufficient.

#### V2-HLP — Helpdesk SLA and escalation
- Category, priority/severity and configurable SLA/TAT.
- Assignment/reassignment.
- Resident comments/photos/evidence.
- Internal versus resident-visible notes.
- Escalation rules.
- Reopen and closure reason.
- Satisfaction/rating and operational analytics.

#### V2-COM — Notice and communication governance
- Targeting by society/building/unit/owner/occupant/audience policy.
- Scheduled and expiring notices.
- Attachments.
- Optional acknowledgement-required communication.
- Delivery/open/acknowledgement metrics where technically available.
- The UI must not describe app delivery/open data as legally effective service unless a valid policy/legal basis says so.

#### V2-AMN — Amenity policy engine
- Capacity and booking quotas.
- Advance-booking windows and slot duration.
- Cooling-off rules.
- Resident/guest/companion limits.
- Free/paid pricing and deposits where configured.
- Cancellation/refund rules.
- Blackouts/maintenance closures.
- Approval-required amenities.
- Check-in/check-out where useful.

#### V2-PRC — Parcel desk / delivery operations
- Short-duration courier/delivery access.
- Leave-at-gate workflow.
- Parcel inventory/chain of custody.
- Resident collection OTP/acknowledgement where enabled.
- Uncollected escalation and courier history.
- Delivery overstay handling.

### P2 — Optional / advanced modules

#### V2-PRK — Advanced parking
- Allocations, visitor/temporary parking and configurable second-car rules.
- Sticker/RFID credential references where integrated.
- Incorrect-parking reports.
- EV charging integration/readiness.

#### V2-UTL — Meter and utility management
- Meter master.
- Periodic readings/imports.
- Water/electricity/DG/gas or society-defined meter types.
- Tariffs and consumption history.
- Billing integration where configured.

#### V2-ANL — Advanced analytics and integrations
- Finance/operations dashboards.
- Audit/export packs.
- Accounting exports/integrations.
- Access-control/IoT integrations only where commercially justified.
- AI remains permission-aware, tenant-aware and action-safe.

## Delivery plan

### Phase V2.0 — Foundation and controls
1. Introduce explicit v2 domain permissions and segregation-of-duties tests.
2. Define bounded contexts and API ownership.
3. Define configurable society-policy registry for jurisdiction/bye-law-specific rules.
4. Define common document/media authorization model.
5. Define money, ledger and immutable financial-event primitives.
6. Extend audit taxonomy for v2 privileged actions.
7. Define privacy request/retention primitives before destructive workflows.

Exit criteria: permissions, architecture and domain contracts approved; no new domain depends on broad role-only checks.

### Phase V2.1 — P0 operational core
1. Accounting/ledger foundation and finance operations.
2. Move-in/move-out and tenancy workflow.
3. Governance core.
4. Emergency/incident hardening.
5. Payment exception/reconciliation model.
6. Privacy/data-principal operations.

Exit criteria: targeted API/Admin tests, tenant/SoD negative tests, migration validation and pilot-ready finance/occupancy/governance workflows.

### Phase V2.2 — Facilities and society operations
1. Assets/AMCs/work orders.
2. Society vendor/procurement domain.
3. Helpdesk SLA/escalation.
4. Document repository.
5. Communication acknowledgement/scheduling.
6. Amenity policy engine.
7. Parcel desk.

### Phase V2.3 — Optional/advanced modules
1. Advanced parking.
2. Meter/utilities.
3. Optional polls/election workflow where legally/policy appropriate.
4. Advanced analytics/exports/integrations.

### Phase V2.4 — Validation and release
- Role-by-role UAT including Accountant/Treasurer, Committee, Facility, Security Supervisor and Auditor responsibilities.
- Real-society policy/bye-law configuration pilot.
- Clean and upgrade-path migration tests.
- Backup/restore and rollback evidence.
- Security/privacy review.
- Accountant/committee pilot acceptance.
- `develop → staging → main` release governance unchanged.

## Architecture decisions
1. **Resident UX versus operations ERP:** consumer surfaces remain simple; complex operational administration is web-first.
2. **Marketplace versus society vendors:** External Services marketplace providers and society-appointed contractual vendors are separate bounded contexts even if a legal entity participates in both.
3. **Accounting versus payments:** a payment is a transaction event; the society ledger is the accounting record. Reconciliation links them but does not collapse them.
4. **Configurable governance:** state/bye-law-dependent requirements are policy/configuration, not universal constants.
5. **Least privilege:** new v2 APIs authorize capability + society/resource scope; UI hiding and role names alone are insufficient.
6. **Auditability:** financial, governance, privacy, vendor, document and facility mutations emit actor/action/resource metadata appropriate for investigation.
7. **Modular monolith first:** V2 remains inside the NestJS modular monolith unless scale/security/operational evidence justifies extraction.

## V2 Definition of Done
In addition to the existing Aaraagate Definition of Done:
- V2 requirement ID is mapped in traceability.
- New admin APIs use v2 capability permissions and society/resource scope.
- Segregation-of-duties negative tests exist for sensitive operations.
- Finance changes are append-only/auditable where accounting integrity requires it.
- Gateway transaction truth is separated from accounting adjustments.
- Legal/policy-variable behavior is configurable and documentation avoids unsupported legal claims.
- Privacy operations are auditable and retention/legal-hold conflicts fail safely.
- Object/document access is authorization-checked at request/download time.
- Migration has clean-database and upgrade-path evidence.
- Admin UI has loading/empty/error/denied states and records privileged mutations.
- Full regression occurs at milestone/release boundaries.
