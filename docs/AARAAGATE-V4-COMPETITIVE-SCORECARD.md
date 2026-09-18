# Aaraagate V4 Competitive Scorecard

Date: 2026-09-18  
Status: Final repository-only evidence re-score after V4.13 Reliability, Accessibility & Product Polish closure

This scorecard uses the V4 program's own categories and counts only implemented, tested repository capability. It is **not** an independent market survey, customer benchmark, legal certification or production-hosting certification.

| Area | V4 target | Evidence score | Repository evidence |
|---|---:|---:|---|
| Gate and security | >= 9.0 | **9.3** | Offline guard operations, role/tenant controls, security events, manual fallback, eight-language critical gate localization, opt-out on-device status speech, deterministic review-before-submit voice quick-fill, and V4.13 cancellable realtime reconnect lifecycle that avoids duplicate scheduling and reconnect-after-sign-out/dispose |
| Resident experience/features | >= 9.0 | **9.3** | Multi-property context, independent-home mode, premium flows, V4.11 next actions, V4.12 property-scoped amenity waitlist UX, and V4.13 active-property SOS/parcel isolation, shared safe error surfaces, semantic emergency actions and large-text regression coverage |
| Accounting/billing/ERP | >= 8.6 | **8.8** | Immutable receivables/ledger, allocations/reversals, reconciliation, ageing, collections, budget/funds, finance-role segregation, V4.11 reconciliation review health, read-only candidate suggestions and accountant export date presets |
| Administration/governance | >= 8.7 | **8.9** | Privacy/audit operations, reports, migration/onboarding controls, facilities/vendors, operational dashboards, role-specific access and tenant-scoped advanced parking policy/credential/violation operations |
| Amenities/community/services | >= 8.8 | **9.1** | Policy-controlled booking plus V4.12 attendance truth, no-show lifecycle, deterministic FIFO waitlist/promotion, explicit Resident queue UX and read-only 30-day operations/demand analytics, alongside the External Services marketplace |
| Architecture/platform design | >= 9.0 | **9.1** | Tenant isolation, typed permissions, idempotency, auditable domain services, adapter boundaries, deterministic locked waitlist promotion, production-readiness and rollback controls |
| Differentiation potential | >= 9.3 | **9.4** | Permission-aware AI operations, multi-property identity, independent-home services, vendor-neutral access integrations and deterministic amenity capacity recovery without opaque ranking |
| Production/field readiness | >= 8.0 before pilot | **8.0** | CI/runtime/backup-restore repository evidence, staged release controls and pilot-readiness contracts; representative-device, real-society, provider and hosted-environment evidence remains external |

**Overall repository evidence score: 8.99 / 10.**

The overall score is the simple arithmetic mean of the eight V4 program categories above: (9.3 + 9.3 + 8.8 + 8.9 + 9.1 + 9.1 + 9.4 + 8.0) / 8 = 8.9875, reported as 8.99. The increase from 8.96 is intentionally limited to the two dimensions with materially new merged V4.13 evidence: Gate/security reliability and Resident experience/reliability. Architecture, differentiation, administration and field readiness are not increased merely because regression coverage became deeper.

## Important boundary

The 8.99 score reflects repository implementation and automated evidence only. Production/field readiness remains exactly 8.0. V4.13 does not prove representative-device accessibility, real low-bandwidth field behavior, hosted staging behavior, real-society role/policy fit, production provider behavior or customer outcomes. Those require external field evidence and remain outside this repository-only score.
