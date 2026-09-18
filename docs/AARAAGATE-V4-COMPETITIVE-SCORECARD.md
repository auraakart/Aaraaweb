# Aaraagate V4 Competitive Scorecard

Date: 2026-09-18  
Status: Final repository-only evidence re-score after advanced parking and Guard localization/voice closure

This scorecard uses the V4 program's own categories and counts only implemented, tested repository capability. It is **not** an independent market survey, customer benchmark, legal certification or production-hosting certification.

| Area | V4 target | Evidence score | Repository evidence |
|---|---:|---:|---|
| Gate and security | >= 9.0 | **9.1** | Offline guard operations, role/tenant controls, security events, device-neutral access integration, manual fallback, app-wide critical gate localization across eight languages, opt-out on-device access-status voice cues and regression contracts |
| Resident experience/features | >= 9.0 | **9.0** | Multi-property context, independent-home mode, premium flows, services, privacy self-service, AI assistant and accessibility regression |
| Accounting/billing/ERP | >= 8.6 | **8.7** | Immutable receivables/ledger, allocations/reversals, reconciliation, ageing, collections, budget/funds and finance-role segregation |
| Administration/governance | >= 8.7 | **8.9** | Privacy/audit operations, reports, migration/onboarding controls, facilities/vendors, operational dashboards, role-specific access and tenant-scoped advanced parking policy/credential/violation operations |
| Amenities/community/services | >= 8.8 | **8.8** | Amenities plus trusted external-services marketplace, approved providers, booking/ratings and measured conversion/completion outcomes |
| Architecture/platform design | >= 9.0 | **9.1** | Tenant isolation, typed permissions, idempotency, auditable domain services, adapter boundaries, production-readiness and rollback controls |
| Differentiation potential | >= 9.3 | **9.3** | Permission-aware AI operations, multi-property identity, independent-home services and vendor-neutral access integrations |
| Production/field readiness | >= 8.0 before pilot | **8.0** | CI/runtime/backup-restore repository evidence and staged release controls; hosted production proofs remain explicitly external |

**Overall repository evidence score: 8.86 / 10.**

The overall score is the simple arithmetic mean of the eight V4 program categories above: (9.1 + 9.0 + 8.7 + 8.9 + 8.8 + 9.1 + 9.3 + 8.0) / 8 = 8.8625, reported as 8.86. The increase from 8.84 is intentionally limited to the two dimensions with new merged evidence: Guard localization/voice depth and advanced parking administration. It exceeds the V4 release criterion of 8.6 while preserving the rule that planned-only capability does not count.

## Important boundary

The 8.86 score reflects repository implementation and automated evidence. Production/field readiness remains exactly 8.0 because hosted staging, provider-managed backup/PITR, alert delivery, real provider credentials, representative device UAT and real access hardware certification are not proven by repository CI and are intentionally not scored as complete. Physical ANPR/RFID/boom-barrier/EV integrations, real payment/OTP/push/SMS/WhatsApp providers and other real-world integrations remain excluded from this repository-only re-score.
