# aaraagate Technical Architecture

## Stack
- Resident app: Flutter
- Guard app: Flutter
- Society/Super Admin: React / Next.js
- API: Node.js / NestJS
- Database: PostgreSQL
- Cache and queues: Redis
- Object storage: S3-compatible storage
- Push notifications: Firebase Cloud Messaging
- Payments: Indian payment gateway with server-side verification and reconciliation

## Architecture rules
1. API-first: mobile and web clients never access PostgreSQL directly.
2. Multi-tenant: every operational record is scoped to a society/tenant identifier.
3. Authorization: every read/write checks authenticated identity, role and society scope. Never rely on UI hiding for authorization.
4. Auditability: security, admin, resident-impacting and financial mutations create audit events.
5. Privacy: guard interfaces mask resident contact data unless a workflow explicitly requires it.
6. Async work: notifications, reconciliation, reports and other non-critical background jobs use queues.
7. Offline guard operation: gate events are stored locally with idempotency keys and synchronized when connectivity returns. Conflicts must fail safely rather than overwrite server truth.
8. Payments: client success is never trusted; gateway webhooks are verified, idempotent and reconciled.
9. Files: object storage access uses short-lived authorized URLs; file ownership is checked server-side.
10. AI: future AI access goes only through permission-checked backend tools; no unrestricted database access.

## Backend boundaries
- identity: authentication, sessions, OTP and role assignment
- society: societies, blocks, floors, flats, gates and configuration
- residents: residents, family members, owners, tenants and profiles
- security: visitors, passes, approvals, entries, exits and incidents
- domestic-help: profiles, assignments, schedules and access
- deliveries: courier/food/grocery delivery workflow
- vehicles: resident vehicles and V1 parking records
- services: providers, categories and service requests
- complaints: tickets, assignment, SLA, media and resolution
- billing: invoices, payments, receipts and reconciliation
- notifications: templates, preferences, delivery and escalation
- audit: immutable audit events and operational traceability

## Initial repository layout
```text
apps/
  resident/
  guard/
  admin/
  super-admin/
services/
  api/
packages/
  design-system/
  api-contracts/
  shared-types/
docs/
infra/
tests/
```

## API conventions
- Versioned REST API under `/api/v1`.
- Consistent envelope for successful and failed responses.
- DTO validation at API boundaries.
- Cursor pagination for large operational collections.
- Idempotency keys for operations that can be retried.
- Correlation/request IDs for tracing.

## Security baseline
- Short-lived access tokens plus secure refresh/session strategy.
- Rate limiting for authentication and sensitive endpoints.
- Password/OTP secrets never logged.
- PII minimized and masked in guard/admin contexts where appropriate.
- Authorization tests include IDOR/BOLA and privilege escalation scenarios.
- Society isolation tests are mandatory before release.
