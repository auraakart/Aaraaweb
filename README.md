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

[V4.95 Services consent recovery](docs/AARAAGATE-V4.95-SERVICES-CONSENT-RECOVERY.md) addresses demonstrated quote review, exact retry and source/context recovery gaps. [V4.94 dependency migrations](docs/AARAAGATE-V4.94-DEPENDENCY-MIGRATIONS.md) remains complete with protected application and real base Android artifact validation. [V4.93 completion follow-through](docs/AARAAGATE-V4.93-COMPLETION-FOLLOW-THROUGH.md) retains the consolidated policy and independent acceptance backlog, building on [V4.92 workflow reliability](docs/AARAAGATE-V4.92-WORKFLOW-RELIABILITY-AND-ACCEPTANCE.md).
