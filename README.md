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

- [Current capability index](docs/CURRENT-CAPABILITY-INDEX.md)
- [API contract policy](docs/api-contract-policy.json)

## Aaraagate V5 development

Society Branding and Partner White Label development uses this shared repository. See [V5 roadmap](docs/AARAAGATE-V5-MULTIBRAND-ROADMAP.md) and [V5 program manifest](docs/v5-release-manifest.json). V5.0–V5.3 are recorded complete; V5.4/V5.5 remain in progress and formal V5.6 acceptance remains planned. Partner TEST infrastructure, independently verified signed artifacts and device acceptance remain separately gated. Existing distributed app versions remain unchanged until an approved consolidated candidate. Productionization is excluded.

## Current development cycle

[V5.10 health hardening](docs/V5.10-HEALTH-HARDENING.md) consolidates the 25 October review into recovery, reproducibility, full lint, risk coverage, complexity and truthful status controls. Package identity is 5.10.0 / mobile build 51000. [PR #1525](https://github.com/auraakart/Aaraaweb/pull/1525) passed full protected application/native CI and merged into develop. Database RLS/hosted and independent partner/device acceptance remain open.

V4.99.3 was promoted to main at `29f95ecaef53c5a03af8858ea89ca58cf2fe0811` on 24 October, with V5.8/V5.9 source included. Full pre-main CI 40047889745 passed; post-main CI reuses the same validated source tree. Earlier candidate-preparation notes below are historical, not current publication status.

[V4.99.3 release candidate and health closure](docs/AARAAGATE-V4.99.3-HEALTH-CLOSURE.md) aligns the release identity after the dependency and compact Finance/Governance fixes; device, language and independent release acceptance remain open. [V4.99.2 Resident premium action and reading UX](docs/AARAAGATE-V4.99.2-RESIDENT-PREMIUM-UX.md) refines Gate decision feedback, adaptive Billing and booking records, whole-card receipt access and persistent notice acknowledgement. [V4.99.1 login lifecycle follow-through](docs/AARAAGATE-V4.99.1-LOGIN-LIFECYCLE.md) continues the review across Provider session ownership and Admin/Auditor/Provider/Partner OTP attempts. [V4.99 code quality review](docs/AARAAGATE-V4.99-CODE-QUALITY-REVIEW.md) fixes shared Admin session races and API import normalization ambiguity. [V4.98 adoption response integrity](docs/AARAAGATE-V4.98-ADOPTION-RESPONSE-INTEGRITY.md) addresses malformed onboarding/import results, batch confirmation and source error locations. [V4.97 import integrity](docs/AARAAGATE-V4.97-IMPORT-INTEGRITY.md) addresses spreadsheet data loss, physical source provenance and bounded expansion. [V4.96 recurring context recovery](docs/AARAAGATE-V4.96-RECURRING-CONTEXT-RECOVERY.md) addresses recurring preference confirmation, replacement-login routes and uncertain status recovery. [V4.95 Services consent recovery](docs/AARAAGATE-V4.95-SERVICES-CONSENT-RECOVERY.md) remains complete. [V4.94 dependency migrations](docs/AARAAGATE-V4.94-DEPENDENCY-MIGRATIONS.md) remains complete with protected application and real base Android artifact validation. [V4.93 completion follow-through](docs/AARAAGATE-V4.93-COMPLETION-FOLLOW-THROUGH.md) retains the consolidated policy and independent acceptance backlog, building on [V4.92 workflow reliability](docs/AARAAGATE-V4.92-WORKFLOW-RELIABILITY-AND-ACCEPTANCE.md).
