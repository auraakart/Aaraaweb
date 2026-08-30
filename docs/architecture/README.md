# Aaraagate Architecture Baseline

## Product model
Aaraagate is a multi-tenant Society Operating System for gated communities.

## Applications
- `apps/web`: Next.js web portal for society management and super-admin operations.
- `apps/resident`: Flutter resident mobile application.
- `apps/security`: Flutter security/gate mobile application.

## Backend
- `services/api`: NestJS + TypeScript modular monolith.
- REST API under `/api/v1`.

## Data
- PostgreSQL is the system of record.
- Redis is used for cache, rate limiting, temporary tokens and background jobs.
- S3-compatible object storage holds photos and documents.

## Core domains
Auth, organizations, societies, buildings, units, residents, visitors, gates, security, vehicles, deliveries, staff, vendors, notices, complaints, maintenance, amenities, payments, documents, notifications, polls, reports and audit logs.

## Tenancy
Every tenant-owned domain record must be scoped to a society/tenant identifier and authorization must be enforced server-side. A user identity is separate from their society memberships and roles.

## Security
Use least-privilege RBAC plus permissions, OTP rate limiting, access/refresh token sessions, validation, audit logging, secure file handling, secrets outside source control and environment separation.

## Delivery strategy
Start as a modular monolith. Extract services only when scale or operational boundaries justify it. Keep `main` stable and use `develop` for active integration.
