# Aaraagate

Aaraagate is a multi-tenant Society Operating System for gated communities, built from the `Aaraaweb` repository.

## Current architecture baseline

- **Web:** Next.js / React Admin/Operations application
- **Mobile:** Flutter resident app and Flutter guard/security gate app
- **API:** NestJS + TypeScript modular monolith
- **Database:** PostgreSQL
- **Cache/queues:** Redis
- **Files:** S3-compatible object storage
- **Push:** Firebase Cloud Messaging
- **API style:** REST, versioned under `/api/v1`
- **Tenancy:** society-scoped multi-tenant authorization
- **Access control:** RBAC + granular permissions

## Repository layout

```text
apps/admin           Next.js Admin/Operations application
apps/resident        Flutter resident application
apps/guard           Flutter security/gate application
services/api         NestJS backend
packages/types       Shared TypeScript domain contracts
packages/api-client  Shared API client contracts
packages/config      Shared configuration conventions
infrastructure       Deployment and infrastructure
docs                 Product and architecture documentation
```

## User context model

Authentication is user-centric rather than society-centric. A single user may belong to multiple societies/properties and selects the active property context when required. Users without a society membership may use the independent-home external-services experience, while society-only APIs remain tenant scoped.

See `docs/USER-CONTEXT-MODEL.md` for the security and UX rules.

## Branching

- `main` — stable promoted baseline
- `staging` — release-candidate validation and promotion branch
- `develop` — active integration branch

Canonical promotion flow: `feature/* → develop → staging → main`. Avoid ancestry-repair branches during normal delivery; use them only for explicit recovery.

See `docs/architecture/README.md` for the architecture baseline.


## Current implementation references

- [27 October repository health assessment and security follow-up](docs/AARAAGATE-HEALTH-REVIEW-2026-10-27.md)
- [Current capability index](docs/CURRENT-CAPABILITY-INDEX.md)
- [API contract policy](docs/api-contract-policy.json)

## Aaraagate V5 development

Society Branding and Partner White Label development uses this shared repository. See [V5 roadmap](docs/AARAAGATE-V5-MULTIBRAND-ROADMAP.md) and [V5 program manifest](docs/v5-release-manifest.json). V5.0–V5.3 are recorded complete; V5.4/V5.5 remain in progress and formal V5.6 acceptance remains planned. Partner TEST infrastructure, independently verified signed artifacts and device acceptance remain separately gated. Existing distributed app versions remain unchanged until an approved consolidated candidate. Productionization is excluded.

## Current development cycle

**Current snapshot — 10 November 2026:** `develop` is at **V5.14.34** (`f028b7b5325d130267479ba0c1ca0cf76c703251`). SOS tenant-context slices V5.14.32–V5.14.34 (PRs [#1616](https://github.com/auraakart/Aaraaweb/pull/1616), [#1617](https://github.com/auraakart/Aaraaweb/pull/1617), [#1618](https://github.com/auraakart/Aaraaweb/pull/1618)) are merged; V5.14.34 passed protected CI run [#4312](https://github.com/auraakart/Aaraaweb/actions/runs/42770305896), including full API validation and required merge gates. The canonical tenant-access inventory is synchronized at **444** runtime `withTenantContext` calls. **V5.14.35** is open as [PR #1619](https://github.com/auraakart/Aaraaweb/pull/1619), adding policy-aware SOS responder alerts through the existing resident realtime/push outbox path. The V5.14.22 notes below are historical, not the current develop head.


**Latest accepted source cycle (7 November 2026): V5.14.22** — WhatsApp template parameter maps, approved registry own-key validation and runtime recipient/idempotency/language types are hardened through protected develop PRs [#1598](https://github.com/auraakart/Aaraaweb/pull/1598), [#1599](https://github.com/auraakart/Aaraaweb/pull/1599) and [#1600](https://github.com/auraakart/Aaraaweb/pull/1600). See [V5.14.20](docs/V5.14.20-WHATSAPP-TEMPLATE-PARAMETER-VALIDATION.md), [V5.14.21](docs/V5.14.21-WHATSAPP-APPROVED-TEMPLATE-OWN-KEY.md), and [V5.14.22](docs/V5.14.22-WHATSAPP-SCALAR-INPUT-VALIDATION.md) for exact tested/merged tree evidence. Package/app release identities and staging/main remain unchanged; externally operated hosted, provider, partner and device acceptance is pending.

[V5.14.4 utility integration context](docs/V5.14.4-UTILITY-INTEGRATION-CONTEXT.md) continues from accepted [V5.14.3 billing/import transactions](docs/V5.14.3-UTILITY-FINANCIAL-CONTEXT.md). Package/API/Admin identity is 5.14.4; Resident/Guard build is 51404. The integration, mapping/recovery and ingestion source passed protected CI 41682523592 and merged on develop as 41c9a0ce; external hosted-role and deployment gates remain open. [V5.14.5 report download session safety](docs/V5.14.5-REPORT-DOWNLOAD-SESSION-SAFETY.md) passed protected CI 41752286168 and merged on develop as a186cfb4. [V5.14.6 migration evidence session safety](docs/V5.14.6-MIGRATION-EVIDENCE-SESSION-SAFETY.md) passed protected CI 41753452980 and merged into develop as a0b44d6c. [V5.14.7 accounting artifact session safety](docs/V5.14.7-ACCOUNTING-ARTIFACT-SESSION-SAFETY.md) passed protected CI 41754761644 and merged on develop as b81dea49. [V5.14.8 reporting export tenant-regression coverage](docs/V5.14.8-REPORT-EXPORT-ISOLATION-REGRESSIONS.md) passed protected CI 41769891594 and merged as e2565fe8. [V5.14.9 report CSV tenant transactions](docs/V5.14.9-REPORT-EXPORT-TENANT-TRANSACTIONS.md) passed protected CI 41771283717 and merged on develop as f0fbfef8, including exact inventory regeneration. [V5.14.10 Report read-isolation regression coverage](docs/V5.14.10-REPORT-READ-ISOLATION-REGRESSIONS.md) passed protected CI 41859821049 and merged on develop as 2066c6eb. Its test-only scope preserves selected-society query predicates and finance redaction. Migration plus reviewed function-owner/runtime EXECUTE grants are required before deployment. Reporting, notifications and remaining workforce subservices remain next. External holds and staging/main governance remain in force. [V5.14.12 society analytics tenant transactions](docs/V5.14.12-REPORT-ANALYTICS-TENANT-TRANSACTIONS.md) passed protected CI 41948430726 and merged on develop as c27e6f15 (PR #1582). Experience funnels and operations dashboards are scoped through tenant-local transactions; the subsequent journey/outcomes conversion is recorded in V5.14.13 and platform-wide reporting stays global. [V5.14.13 society journey and outcomes tenant transactions](docs/V5.14.13-JOURNEY-OUTCOMES-TENANT-CONTEXT.md) passed protected CI 41951187746 and merged into develop as 5b9792c0 (PR #1584), with source-bound inventory 403 tenant-context sites. Three finance-only queries remain conditional; platform-wide reporting remains explicitly global. Hosted RLS/grant rollout is still pending. [V5.14.14 notification tenant read/evidence boundaries](docs/V5.14.14-NOTIFICATION-TENANT-READS-AND-EVIDENCE.md) passed protected CI 41955990979 and merged on develop as 9e2222ef (PR #1586), with four notification context boundaries and 407 canonical tenant-context sites. Global consumer/device transfer and mixed outbox retry semantics remain unchanged, and hosted RLS/grant rollout is separate. [V5.14.15 resident push-delivery tenant contexts](docs/V5.14.15-RESIDENT-PUSH-DELIVERY-TENANT-CONTEXT.md) passed protected CI 41964680800 and merged into develop as b6c16d47 (PR #1588), with canonical inventory 411 scoped call sites. Resident delivery lookup, branded membership and invalid-token revocations use selected-society transactions; global consumer transfer, outbox leases, live Firebase I/O and hosted RLS rollout remain separate. [V5.14.16 mixed-scope push enqueue tenant boundary](docs/V5.14.16-PUSH-OUTBOX-ENQUEUE-TENANT-BOUNDARY.md) passed protected CI 41970528924 and merged into develop as 23aea403 (PR #1590), with 412 canonical tenant-context calls. Resident enqueues use tenant-local transactions, while consumer and existing caller-transaction paths preserve their established semantics. [V5.14.17 gate-recipient selected-society transactions](docs/V5.14.17-GATE-RECIPIENT-TENANT-CONTEXT.md) passed protected CI 41973606083 and merged on develop as d9023e5d (PR #1592). The canonical inventory now counts 413 scoped calls; eligible occupant notification routing retains its existing predicates and ordering. Hosted roles, device acceptance and staging/main remain outside the slice. [V5.14.18 gate fallback recipient isolation](docs/V5.14.18-GATE-FALLBACK-RECIPIENT-ISOLATION.md) passed protected CI 42021434370 and merged into develop as 0bfae1f5 (PR #1594). Global phone reads in gate fallback now require active selected-society occupant evidence; the canonical tenant-context inventory is 414. No external provider/device/hosted-role or staging/main acceptance is implied. [V5.14.11 Reports read tenant-context conversion](docs/V5.14.11-REPORTS-READ-TENANT-CONTEXT.md) passed protected CI 41866924940 and merged on develop as fe2f307d (PR #1580). All six Reports read transaction boundaries and the canonical tenant register are accepted; hosted RLS/grants and other unconverted services remain separate work.

[V5.12 tenant boundaries and experience closure](docs/V5.12-TENANT-AND-EXPERIENCE-CLOSURE.md) consolidates the 31 October health recommendations. Package/API/Admin identity is 5.12.0; Resident/Guard build is 51200. Accepted source changes include Helpdesk and Amenities tenant clients, bounded worker/dispute-evidence extraction, Home notice identity deduplication, a selected Node type patch and evidence reconciliation (PRs #1557–#1559 / final CI 41223073848). Hosted policy, independent worker/artifact and physical-device acceptance remain open. A version label is not a published APK.

[V5.11 occupancy and experience hardening](docs/V5.11-OCCUPANCY-AND-EXPERIENCE-HARDENING.md) has accepted occupancy read/mutation, worker/private-file, performance-baseline and compact Resident form source slices. Consolidated acceptance continues in V5.12; hosted isolation, independent Partner A/B worker/artifact and physical-device acceptance remain open. [V5.10 health hardening](docs/V5.10-HEALTH-HARDENING.md) is historical accepted engineering evidence.

V4.99.3 was promoted to main at `29f95ecaef53c5a03af8858ea89ca58cf2fe0811` on 24 October, with V5.8/V5.9 source included. Full pre-main CI 40047889745 passed; post-main CI reuses the same validated source tree. Earlier candidate-preparation notes below are historical, not current publication status.

[V4.99.3 release candidate and health closure](docs/AARAAGATE-V4.99.3-HEALTH-CLOSURE.md) aligns the release identity after the dependency and compact Finance/Governance fixes; device, language and independent release acceptance remain open. [V4.99.2 Resident premium action and reading UX](docs/AARAAGATE-V4.99.2-RESIDENT-PREMIUM-UX.md) refines Gate decision feedback, adaptive Billing and booking records, whole-card receipt access and persistent notice acknowledgement. [V4.99.1 login lifecycle follow-through](docs/AARAAGATE-V4.99.1-LOGIN-LIFECYCLE.md) continues the review across Provider session ownership and Admin/Auditor/Provider/Partner OTP attempts. [V4.99 code quality review](docs/AARAAGATE-V4.99-CODE-QUALITY-REVIEW.md) fixes shared Admin session races and API import normalization ambiguity. [V4.98 adoption response integrity](docs/AARAAGATE-V4.98-ADOPTION-RESPONSE-INTEGRITY.md) addresses malformed onboarding/import results, batch confirmation and source error locations. [V4.97 import integrity](docs/AARAAGATE-V4.97-IMPORT-INTEGRITY.md) addresses spreadsheet data loss, physical source provenance and bounded expansion. [V4.96 recurring context recovery](docs/AARAAGATE-V4.96-RECURRING-CONTEXT-RECOVERY.md) addresses recurring preference confirmation, replacement-login routes and uncertain status recovery. [V4.95 Services consent recovery](docs/AARAAGATE-V4.95-SERVICES-CONSENT-RECOVERY.md) remains complete. [V4.94 dependency migrations](docs/AARAAGATE-V4.94-DEPENDENCY-MIGRATIONS.md) remains complete with protected application and real base Android artifact validation. [V4.93 completion follow-through](docs/AARAAGATE-V4.93-COMPLETION-FOLLOW-THROUGH.md) retains the consolidated policy and independent acceptance backlog, building on [V4.92 workflow reliability](docs/AARAAGATE-V4.92-WORKFLOW-RELIABILITY-AND-ACCEPTANCE.md).
