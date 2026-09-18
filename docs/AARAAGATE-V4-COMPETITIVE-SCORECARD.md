# Aaraagate V4 Competitive Scorecard

Date: 2026-09-18  
Status: Final repository-only evidence re-score after V4.11 competitive-depth closure

This scorecard uses the V4 program's own categories and counts only implemented, tested repository capability. It is **not** an independent market survey, customer benchmark, legal certification or production-hosting certification.

| Area | V4 target | Evidence score | Repository evidence |
|---|---:|---:|---|
| Gate and security | >= 9.0 | **9.2** | Offline guard operations, role/tenant controls, security events, manual fallback, eight-language critical gate localization, opt-out on-device status speech, and V4.11 short-phrase voice quick-fill with deterministic ambiguity handling and review-before-submit |
| Resident experience/features | >= 9.0 | **9.1** | Multi-property context, independent-home mode, premium flows, services, privacy self-service, accessibility regression, existing Updates timeline, and V4.11 property-scoped next-action highlights for dues, active services and notices |
| Accounting/billing/ERP | >= 8.6 | **8.8** | Immutable receivables/ledger, allocations/reversals, reconciliation, ageing, collections, budget/funds, finance-role segregation, V4.11 reconciliation review health, read-only candidate suggestions and accountant export date presets |
| Administration/governance | >= 8.7 | **8.9** | Privacy/audit operations, reports, migration/onboarding controls, facilities/vendors, operational dashboards, role-specific access and tenant-scoped advanced parking policy/credential/violation operations |
| Amenities/community/services | >= 8.8 | **8.8** | Amenities plus trusted external-services marketplace, approved providers, booking/ratings and measured conversion/completion outcomes |
| Architecture/platform design | >= 9.0 | **9.1** | Tenant isolation, typed permissions, idempotency, auditable domain services, adapter boundaries, production-readiness and rollback controls |
| Differentiation potential | >= 9.3 | **9.4** | Permission-aware AI operations plus V4.11 read-only Action Centre over authoritative finance/helpdesk/security/facility sources, multi-property identity, independent-home services and vendor-neutral access integrations |
| Production/field readiness | >= 8.0 before pilot | **8.0** | CI/runtime/backup-restore repository evidence, staged release controls and a machine-checked V4.11 pilot-readiness contract; actual field KPI evidence remains explicitly external and not started |

**Overall repository evidence score: 8.91 / 10.**

The overall score is the simple arithmetic mean of the eight V4 program categories above: (9.2 + 9.1 + 8.8 + 8.9 + 8.8 + 9.1 + 9.4 + 8.0) / 8 = 8.9125, reported as 8.91. The increase from 8.86 is intentionally limited to dimensions with new merged V4.11 evidence: Guard field/voice UX, resident next actions, accountant reconciliation usability and permission-aware AI operational depth.

## Important boundary

The 8.91 score reflects repository implementation and automated evidence only. Production/field readiness remains exactly 8.0 because `docs/v4.11-pilot-readiness.json` records field evidence as `NOT_STARTED` and every mandatory field KPI as `PENDING_EXTERNAL`. Hosted production proofs, real provider credentials, representative device UAT, real-society KPI results, physical ANPR/RFID/boom-barrier/EV integrations and other real-world integrations remain outside this repository-only score.
