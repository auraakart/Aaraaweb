# Aaraagate Product Requirements

Version: 2.0  
Date: 2026-09-12

## Product position
Aaraagate is a multi-society SaaS operating system for Indian gated communities and residential associations. It must compete with tier-one products in reliability, security, usability and operational depth while remaining usable by smaller societies and ordinary residents with varied digital literacy.

V1 established the core gated-community platform: identity, tenancy, residents, security, domestic help, visitors/deliveries, vehicles, External Services, complaints, notices, amenities baseline, payments, notifications, audit and SaaS administration.

V2 expands Aaraagate into a broader Indian residential-community operating platform with accounting, governance, tenancy lifecycle, facilities, society vendors, documents, stronger emergency/privacy operations and deeper administrative segregation of duties. The detailed v2 delivery baseline is `AARAAGATE-V2-PROGRAM.md`.

## Product principles
- Security before feature count.
- No cross-society data leakage. Every tenant-owned operation must be society-scoped and authorization must be enforced server-side.
- Least-privilege RBAC plus explicit permissions are mandatory for privileged and operational actions.
- Privacy by design; collect and expose only necessary information.
- Resident experience must remain simple, fast and understandable to users with varied digital literacy.
- Complex accounting, procurement, committee and facility ERP workflows belong primarily in Admin/Operations web, not the resident navigation core.
- Guard workflows must work in real gate conditions, low bandwidth and intermittent connectivity.
- Admin workflows must be auditable and operationally safe.
- Payments must be server-verified and auditable; raw customer card credentials must not be stored by Aaraagate.
- Payment-gateway transaction state and society accounting state are distinct but reconcilable records.
- State-, association- and bye-law-dependent procedures must be configurable rather than presented as one universal Indian rule.
- Technology and component choices must favor proven, maintainable, scalable technologies with clear upgrade paths rather than short-term hacks.
- Avoid unnecessary vendor lock-in; keep the API, PostgreSQL data model, object storage and integrations portable where practical.
- Hardware is optional, but integration boundaries must allow future RFID/ANPR/boom-barrier/access-control support.
- AI, when introduced, must be permission-aware, tenant-aware and action-safe.

## Roles and responsibility families
- Super Admin / platform operations
- Society Admin / RWA administrator
- Committee Member / Committee Admin responsibility
- Facility Manager / Estate Operations
- Accountant / Treasurer
- Helpdesk operator responsibility
- Read-only audit responsibility
- Owner
- Tenant
- Family Member
- Security Supervisor
- Security Guard
- Staff
- Society-appointed vendor/contractor
- External Services marketplace provider where applicable

Role enums and persisted memberships should not be multiplied unnecessarily. Prefer explicit capability permissions and scoped responsibility bundles. Distinct persisted roles are introduced only when lifecycle, assignment or audit requirements justify them.

## Property relationship, occupancy and privacy rules
- Legal ownership, physical occupancy and society roles are independent relationships. An owner is not assumed to reside in the unit.
- `UnitOwnership` grants only explicitly defined property capabilities. It does not grant household-private access, routine gate notifications or gate approval authority.
- `UnitOccupancy` is time-bound and identifies the owner-occupant, tenant or authorized family member who currently lives in the unit.
- Routine visitor, delivery, cab and domestic-help gate notifications are routed to active occupants configured as gate contacts, regardless of whether they own the unit.
- A non-resident owner does not receive routine gate activity by default. Property/security-critical notifications may include the owner only through an explicit, audited policy.
- Every occupied unit must have a primary gate contact. Additional adult occupants may be approval recipients, notification-only recipients or ordered fallback contacts.
- Move-out or occupancy termination immediately removes gate approval, notification and household-operational authority. Historical tenancy must not be exposed to a later occupant.
- V2 adds explicit move-in/move-out workflow, effective tenancy dates, configurable approvals/documents, access revocation and migration of vehicle/workforce relationships.
- Household APIs return explicit response DTOs and minimum necessary fields; another occupant's phone/email is not returned by default.
- Owner-only property finance, documents, voting and tenancy management use separate permissions from occupant day-to-day operations.
- Delegation, where introduced, must be explicit, scoped, time-bound, revocable and audited.

## Resident experience baseline
The resident experience remains centered on:
1. Home / action centre
2. Gate and visitor access
3. Payments
4. External/household services
5. Community, notices and helpdesk
6. Amenities

Multi-property owners select or switch an authorized property context. Independent-home users receive the External Services experience without society-only functions. Server-side membership/context validation remains authoritative.

## V1 foundation modules retained in V2
1. Authentication, OTP abstraction, session lifecycle and role/permission access
2. Society > Building/Block > Floor > Unit/Flat hierarchy
3. Resident, family, owner, tenant and membership management
4. Resident Flutter app
5. Guard Flutter app
6. Visitor management with pre-invite, approval/rejection and QR/OTP passes
7. Gate verification, check-in/check-out and immutable audit trail
8. Domestic-help management and entry/exit workflows
9. Delivery and cab workflows
10. Vehicle registration and baseline parking data
11. Notices/announcements/push notifications
12. Complaints/helpdesk
13. External/household services marketplace, providers, bookings, ratings and commercial controls
14. Maintenance bills, receipts and online payments
15. Amenities baseline
16. Society Admin dashboard
17. Super Admin dashboard
18. Audit logs, backups, monitoring, observability and production security controls
19. SaaS product tiers and entitlements
20. Offline Guard queue with idempotent synchronization
21. Reporting and operational audit views

## V2 required domains

### V2-RBAC — Administrative segregation of duties — P0
Aaraagate must expose explicit capability boundaries for finance, governance, facilities, society vendors, documents and privacy operations. Committee, Facility, Accountant, Security and Society Admin responsibilities must fail closed outside their scopes. Sensitive domains require negative authorization tests.

### V2-FIN — Full society accounting — P0
- Charge/billing rules and unit/party ledgers.
- Auditable debit, credit and adjustment entries.
- Arrears, configurable interest/penalty and controlled waiver.
- Advances/unapplied credits and payment allocation.
- Income/expense accounting and bank reconciliation.
- Budget versus actual.
- Corpus/sinking/reserve/configurable funds.
- Vendor bills/payables and approval controls.
- Financial statements, exports and year/audit-period close.
- GST/TDS support only where configured/applicable; no universal tax assumption.
- Accounting corrections use auditable entries rather than destructive history rewriting.

### V2-OCC — Tenancy and move lifecycle — P0
- Prospective tenant/occupancy workflow with effective dates.
- Configurable documents/approval steps.
- Move-in/out slots and configurable charges/deposits.
- Vehicle/workforce/access migration or revocation.
- Tenant exit atomically removes occupant-scoped gate/app authority.
- Jurisdiction/society-specific rental/police-verification requirements remain configurable.

### V2-GOV — Governance — P0/P1
- Committee roster, offices, tenure and handover.
- AGM/SGM/committee meetings, agendas, minutes and attachments.
- Resolutions and action items.
- Configurable quorum/approval evidence.
- Rules/bye-law references and records.
- Polls/surveys may be supported. Statutory electronic election workflows are optional and enabled only where the governing framework permits them.

### V2-EMR — Emergency/incident operations — P0/P1
- Emergency categories and control-room/security escalation.
- Emergency/family contacts.
- Mass emergency broadcast and acknowledgement where appropriate.
- Incident timeline, assignments, evidence and closure.
- Critical SOS delivery must not depend solely on normal push delivery or the currently selected property screen.

### V2-PRV — Privacy/data lifecycle — P0
- Clear purpose/data-category notice model.
- Retention policy hooks and privacy/grievance contacts.
- Auditable request workflow for access/correction/erasure or other applicable requests.
- Consent/withdrawal records where relevant to the processing workflow.
- Processor/vendor privacy controls.
- Personal-data incident/breach operations.
- Minor/child data protections where applicable.
- Destructive requests fail safely when statutory/accounting/security/dispute retention conflicts exist.
- Documentation must avoid unsupported claims of universal statutory compliance.

### V2-PAY — Payment exception operations — P0
- Debited-but-not-confirmed handling.
- Duplicate detection.
- Refunds and reversals.
- Dispute/escalation reference tracking.
- Immutable payment events and explicit accounting allocation/reconciliation.

### V2-FAC — Asset/AMC/facility management — P1
- Common-asset register, criticality and location.
- AMC/warranty/contract dates and expiry reminders.
- Preventive maintenance, inspections and work orders.
- Breakdown/service history, evidence and cost history.
- Critical/statutory maintenance escalation.

### V2-VND — Society vendors/procurement — P1
Society-appointed vendors are separate from consumer marketplace providers. Required capabilities include vendor master, contracts/AMCs, quotation comparison, optional PR/PO workflow, vendor invoices/payment approval references, SLA/expiry tracking and vendor-staff gate linkage.

### V2-DOC — Document repository — P1
Secure object/document storage with classification such as committee-only, admin-only, finance, owner-only, resident-visible or community/public. Download authorization is enforced server-side.

### V2-HLP — Helpdesk SLA/escalation — P1
Category, priority/severity, SLA/TAT, assignment/reassignment, internal/resident-visible comments, evidence, escalation, reopen, closure reason, satisfaction and analytics.

### V2-COM — Communication governance — P1
Audience targeting, scheduling, expiry, attachments, optional required acknowledgement and delivery/open/ack metrics where technically available. The product must not imply legal service merely from app delivery/open state.

### V2-AMN — Amenity policy engine — P1
Capacity, quotas, advance windows, cooling-off, guest/companion rules, configurable prices/deposits, cancellation/refund policy, blackouts/maintenance, approvals and optional check-in/out.

### V2-PRC — Parcel desk — P1
Leave-at-gate, parcel custody, resident collection acknowledgement/OTP where enabled, uncollected escalation, courier history and delivery overstay operations.

### V2-PRK — Advanced parking — P1/P2
Allocations, visitor/temporary parking, configurable additional-vehicle rules, credential references, wrongly parked reporting and EV-readiness/integration.

### V2-UTL — Meter/utilities — P2
Optional meter master, readings/imports, consumption, tariffs, history and billing integration for society-defined utility types.

## External Services commercial direction
External Services remains a core differentiator. The architecture supports categories, verified providers, society/home availability, offerings, images/media, approved offers, bookings, ratings, provider commercial tiers and clearly labelled paid placement. Commercial Premium/Featured/Sponsored status must remain separate from verification, trust, society approval and organic reputation.

The External Services marketplace is not the society vendor/procurement domain. A legal entity may participate in both only through separate authorization and operational records.

## SaaS entitlement model
Feature tiers such as Starter, Professional, Premium and Enterprise may evolve commercially. Entitlements are resolved server-side per society, with controlled overrides. V2 modules should be independently entitlement-ready where commercially useful. UI visibility never replaces server-side entitlement enforcement.

## Multi-society and organization hierarchy
Society remains the primary operational tenant boundary. Future organization/property-manager ownership of multiple societies must use explicit delegated scopes and never weaken society-level isolation.

## Explicitly deferred / conditional
- Full statutory digital elections where legal/bye-law validity has not been established for the target society.
- AI assistant and predictive automation until v2 operational data/permissions are stable.
- ANPR/RFID/boom-barrier/IoT integrations until commercially justified.
- Meter/utilities where a society does not need the module.
- Advanced accounting integrations that depend on a chosen third-party accounting contract.

## Release and quality model
Source of truth is GitHub. `develop` is active integration, `staging` is release validation and `main` is stable release.

Promotion path:
`feature/hotfix → develop → full CI → staging → migration/build/startup/smoke/UAT/security validation → main → production`.

Aaraagate V2 is delivered in bounded slices; a large all-at-once migration is explicitly prohibited.

## Definition of Done
A requirement is complete only when:
- It maps to an approved requirement ID and traceability entry.
- Authorization, society isolation, resource scope and entitlement checks are verified.
- Sensitive admin domains use capability permissions rather than broad role-name checks.
- Segregation-of-duties negative tests exist for finance/governance/facilities/vendor/document/privacy operations as applicable.
- Ownership alone does not grant occupancy-private access; active occupants retain correct gate authority.
- Happy/failure/concurrency-sensitive paths are implemented where relevant.
- Migrations pass clean-database and supported upgrade-path validation.
- API validation and sanitized errors are present.
- Automated tests/CI gates are green and no high/critical dependency gate is failing.
- No secrets are committed and logs minimize personal/payment information.
- UI includes appropriate loading, empty, error, denied and offline states.
- Privileged/admin/gate/financial/governance/privacy mutations are auditable.
- Finance preserves auditable ledger semantics and separates payment-gateway events from accounting corrections.
- Legal/policy-variable behavior is configurable and documentation avoids unsupported legal assertions.
- Staging/UAT evidence appropriate to risk exists before production promotion.
- Documentation and acceptance criteria are updated.
