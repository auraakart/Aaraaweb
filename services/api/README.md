# Aaraagate API

NestJS modular monolith. Domain modules are added incrementally under `src/`.

Primary module boundaries include:
- auth
- organizations
- societies
- buildings
- units
- residents
- visitors
- gates
- security
- vehicles
- deliveries
- staff
- vendors
- notices
- complaints
- maintenance
- amenities
- payments
- accounting / finance operations
- documents
- notifications
- polls
- reports
- audit

API version prefix: `/api/v1`.

## Operations references

- Accounting connector deployment, enablement, retry and monitoring: [`../../docs/ACCOUNTING-CONNECTOR-OPERATIONS.md`](../../docs/ACCOUNTING-CONNECTOR-OPERATIONS.md)
- Environment-variable examples: [`.env.example`](.env.example)

Real deployment secrets must be supplied through the deployment secret store and must not be committed to the repository.
