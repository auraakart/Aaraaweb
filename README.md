# Aaraagate

Aaraagate is the AaraaPlatforms gated-community and residential-services product.

## Applications

- `apps/resident` — resident/owner/tenant Flutter application
- `apps/guard` — security guard Flutter application
- `apps/admin` — society/platform administration web application
- `services/api` — NestJS API and PostgreSQL/Prisma domain services

## User context model

Authentication is user-centric rather than society-centric. A single user may belong to multiple societies/properties and selects the active property context after login when required. Users without a society membership may use the independent-home external-services experience, while society-only APIs remain tenant scoped.

See `docs/USER-CONTEXT-MODEL.md` for the security and UX rules.

## Development

Use the repository CI as the release-quality gate. Production infrastructure decisions are maintained separately from application-domain requirements.
