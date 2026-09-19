# Aaraagate V4 Competitive Scorecard

Date: 2026-09-19  
Status: Repository-only evidence re-score after V4.19 Privacy Operations & Data Lifecycle Depth closure

This scorecard uses the V4 program's own categories and counts only implemented, tested repository capability. It is **not** an independent market survey, customer benchmark, legal certification or production-hosting certification.

| Area | V4 target | Evidence score | Repository evidence |
|---|---:|---:|---|
| Gate and security | >= 9.0 | **9.3** | Offline guard operations, role/tenant controls, security events, manual fallback, eight-language critical gate localization, opt-out on-device status speech, deterministic review-before-submit voice quick-fill, and V4.13 cancellable realtime reconnect lifecycle that avoids duplicate scheduling and reconnect-after-sign-out/dispose |
| Resident experience/features | >= 9.0 | **9.5** | Multi-property context, independent-home mode, premium flows, V4.11 next actions, V4.12 property-scoped amenity waitlist UX, V4.13 active-property SOS/parcel isolation and safe/accessibility hardening, V4.16 daily action prioritization/community hub, plus V4.17 property-aware move status, next-action guidance, readiness and event timeline |
| Accounting/billing/ERP | >= 8.6 | **9.0** | Immutable receivables/ledger, allocations/reversals, reconciliation, ageing, collections, budget/funds and finance-role segregation, plus V4.14 tenant-scoped close readiness, race-safe irreversible period close, draft-journal blocking, accountant period-close/reporting workspace and typed bounded finance operator controls |
| Administration/governance | >= 8.7 | **9.5** | Privacy/audit operations, reports, migration/onboarding controls, facilities/vendors and operational dashboards, V4.15 governance workflow depth, V4.16 procurement/vendor/facilities operator depth, V4.17 typed occupancy operations/readiness evidence, V4.18 tenant-scoped document operations/version lineage, plus V4.19 typed privacy case operations, readiness/conflict evidence, privacy registry/incident/grievance context and Resident self-service clarity |
| Amenities/community/services | >= 8.8 | **9.1** | Policy-controlled booking plus V4.12 attendance truth, no-show lifecycle, deterministic FIFO waitlist/promotion, explicit Resident queue UX and read-only 30-day operations/demand analytics, alongside the External Services marketplace |
| Architecture/platform design | >= 9.0 | **9.1** | Tenant isolation, typed permissions, idempotency, auditable domain services, adapter boundaries, deterministic locked waitlist promotion, production-readiness and rollback controls |
| Differentiation potential | >= 9.3 | **9.4** | Permission-aware AI operations, multi-property identity, independent-home services, vendor-neutral access integrations and deterministic amenity capacity recovery without opaque ranking |
| Production/field readiness | >= 8.0 before pilot | **8.0** | CI/runtime/backup-restore repository evidence, staged release controls and pilot-readiness contracts; representative-device, real-society, provider and hosted-environment evidence remains external |

**Overall repository evidence score: 9.11 / 10.**

The overall score is the simple arithmetic mean of the eight V4 program categories above: (9.3 + 9.5 + 9.0 + 9.5 + 9.1 + 9.1 + 9.4 + 8.0) / 8 = 9.1125, reported conservatively as 9.11. V4.19 increases Administration/governance only where materially new privacy operator, readiness/conflict and resident self-service evidence was added. Resident experience remains 9.5 because the privacy clarity work improves an existing self-service surface rather than materially broadening the total Resident feature set.

## Important boundary

The 9.11 score reflects repository implementation and automated evidence only. Production/field readiness remains exactly 8.0. V4.19 does not prove jurisdiction-specific privacy-law interpretation, statutory rights eligibility, qualified legal review, representative-device usability, hosted production behavior or real-society privacy outcomes. Those require external evidence and remain outside this repository-only score.
