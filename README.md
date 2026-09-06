# Aaraagate

Aaraagate is a multi-tenant Society Operating System for gated communities, built from the `Aaraaweb` repository.

## Current architecture baseline

- **Web:** Next.js / React management and super-admin portal
- **Mobile:** Flutter resident app and Flutter security/gate app
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
apps/web             Next.js management portal
apps/resident        Flutter resident application
apps/security        Flutter security/gate application
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

- `main` — stable baseline
- `develop` — active integration branch

See `docs/architecture/README.md` for the architecture baseline.
