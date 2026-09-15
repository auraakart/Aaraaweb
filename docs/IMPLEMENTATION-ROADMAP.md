# Aaraagate Implementation Roadmap

Updated: 2026-09-12

## Current execution status
Commercial V1 has reached a validated code baseline and is now the foundation for **Aaraagate V2**. V2 expands Aaraagate from a gated-community application into a broader Indian residential-community operating platform without reopening proven V1 tenancy, security, owner/occupant, External Services or release controls.

The authoritative v2 scope is `PRODUCT_REQUIREMENTS.md` plus `AARAAGATE-V2-PROGRAM.md`.

## V1 baseline — COMPLETE / CONTINUES TO BE HARDENED
Validated foundations retained in V2:
- Modular monorepo: Flutter Resident/Guard, Next.js Admin, NestJS/PostgreSQL API.
- OTP/session security and Redis-backed production auth state.
- Society tenancy isolation and capability permissions.
- Ownership/occupancy separation and multi-property context.
- Independent-home External Services mode.
- Visitor, delivery, cab and Guard gate flows with offline/idempotent recovery.
- Workforce/domestic-help lifecycle.
- Resident home, notices, helpdesk/SOS, vehicles, amenities baseline and privacy disclosure.
- External Services provider lifecycle, media/offers/commercial controls, bookings/ratings/dispatch.
- Maintenance billing/payments and reconciliation baseline.
- SaaS tiers/entitlements, reports/audit, CI/release/backup controls.

## V2.0 — Foundation and segregation of duties — ACTIVE
Goal: make the platform safe to receive accounting, governance and facility operations before introducing large data-model changes.

Deliverables:
1. Explicit permission boundaries for finance, governance, facilities, society vendors, documents and privacy operations.
2. Segregation-of-duties tests across Accountant, Committee, Facility, Society Admin, Security and resident roles.
3. Updated product requirements, architecture, role matrix and traceability.
4. Society-policy/configuration model for jurisdiction/bye-law-dependent rules.
5. Common document/media authorization approach.
6. Ledger/money/event design for auditable society accounting.
7. V2 audit-event taxonomy and privileged-action requirements.
8. Privacy request/retention model before destructive data workflows.

Exit criteria:
- no new v2 sensitive API depends on a broad role-name check alone;
- architecture/domain boundaries approved;
- targeted authorization tests green;
- CI green on the v2 foundation PR.

## V2.1 — P0 society operating core

### V2.1A — Accounting foundation
- Account/fund/chart primitives suitable for society accounting.
- Unit/party ledger and auditable journal entries.
- Charge-rule/billing linkage.
- Arrears, interest/penalty and controlled waiver.
- Advances/unapplied credits and payment allocation.
- Income/expense entry and attachment references.
- Bank-account register/reconciliation.
- Budget/fund tracking.
- Vendor payable linkage.
- Financial statements/exports and period close.
- GST/TDS fields/reports only when configured/applicable.

Delivery rule: payment-gateway events remain distinct from accounting entries. Financial history is corrected with auditable reversing/adjusting events, not destructive rewrites.

### V2.1B — Move-in/move-out and tenancy lifecycle
- Prospective tenancy and effective dates.
- Configurable document/approval checklist.
- Move slots, charges/deposits when configured.
- Vehicle/workforce/access migration or revocation.
- Atomic occupancy termination and session/permission reconciliation.

### V2.1C — Governance core
- Committee roster/tenure/handover.
- AGM/SGM/committee meeting records.
- Agenda, minutes, resolutions and action items.
- Configurable quorum/approval evidence.
- Rules/bye-law references.
- Poll/survey foundation; statutory election workflow remains conditional.

### V2.1D — Emergency and privacy hardening
- Emergency categories, escalation and incident timeline.
- Critical broadcast/acknowledgement and control-room paths.
- Privacy request case model, retention checks and audit trail.
- Processor/vendor privacy register hooks.
- Personal-data incident workflow.

### V2.1E — Payment exception lifecycle
- debited-but-unconfirmed;
- duplicate detection;
- reversal/refund;
- dispute/escalation references;
- accounting allocation/reconciliation.

V2.1 exit criteria:
- clean + upgrade-path migrations;
- tenant/role negative tests;
- finance integrity tests;
- Admin loading/empty/error/denied states;
- role-based UAT for Accountant, Committee and Society Admin.

## V2.2 — Facilities and operational depth

### V2.2A — Assets / AMCs / work orders
- Asset register and criticality.
- Warranty/AMC/contract expiry.
- Preventive maintenance.
- Breakdown and work-order lifecycle.
- Inspections, evidence, history and cost.
- Critical maintenance escalation.

### V2.2B — Society vendors / procurement
Separate from the consumer External Services marketplace:
- vendor master;
- contracts/AMCs;
- quotation comparison;
- optional purchase request/order;
- invoice/approval linkage;
- SLA/expiry tracking;
- vendor staff/gate relationship.

### V2.2C — Helpdesk SLA and communications
- Priority/severity + SLA/TAT.
- Assignment/reassignment/escalation.
- Resident-visible/internal notes and evidence.
- Reopen, closure reason and satisfaction.
- Scheduled/expiring notices and optional acknowledgement.
- Audience targeting and delivery/open/ack metrics where available.

### V2.2D — Documents, amenities and parcel desk
- Classified society document repository.
- Amenity capacity/quotas/windows/cooling-off/guest/pricing/deposit/blackout/approval rules.
- Leave-at-gate parcel inventory, collection acknowledgement and escalation.

## V2.3 — Optional / advanced modules
- Advanced parking allocation/visitor/temporary parking/EV readiness.
- Meter and utility readings/tariffs/history/billing integration.
- Optional digital voting/election capability only where society governing framework permits.
- Advanced dashboards, audit/export packs and accounting integrations.
- Hardware/access-control/IoT integrations where justified.
- AI features only after permissions/data/action-safety are proven.

## V2.4 — Validation and release
- Role-by-role UAT: Super Admin, Society Admin, Committee, Accountant/Treasurer, Facility Manager, Security Supervisor, Guard, owner-resident, tenant, non-resident owner, independent-home and multi-property owner.
- Accountant/committee real-society pilot.
- Policy/bye-law configuration review for pilot society.
- Full migration and rollback rehearsal.
- Security/privacy review.
- Backup/restore and operational evidence.
- Staging exact-SHA smoke/UAT.
- Protected `staging → main` promotion and post-main validation.

## Execution order and dependency rules
1. Foundation permissions/architecture before new sensitive domains.
2. Finance and occupancy before dependent vendor/governance workflows.
3. Document authorization before broad document uploads.
4. Facility/vendor domains before advanced procurement analytics.
5. Privacy retention rules before destructive privacy automation.
6. Optional modules cannot delay P0/P1 pilot readiness.

## Promotion governance
`feature/hotfix → develop → staging → main`

For each material v2 slice:
1. targeted tests during implementation;
2. PR CI and independent review before `develop`;
3. milestone-boundary full regression;
4. exact candidate promotion to `staging`;
5. migrations/build/startup/smoke/backup validation appropriate to risk;
6. UAT/security/privacy approval;
7. protected promotion to `main`;
8. post-main CI and release-history reconciliation.

## Hosted production exit criteria
A green repository does not equal operational go-live. Production still requires hosted API/Admin, managed PostgreSQL + Redis/Valkey, providers/secrets, backup/PITR + restore evidence, monitoring/alerts, signed Android release/Play validation and a real-society pilot.

## Quality rule
Do not trade tenant isolation, authorization, payment/accounting integrity, privacy safety or operational recoverability for speed. Major cross-cutting changes require explicit regression and release evidence even when compilation and unit tests pass.
