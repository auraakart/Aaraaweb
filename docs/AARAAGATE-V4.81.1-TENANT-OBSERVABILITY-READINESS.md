# Aaraagate V4.81.1 — Tenant Isolation & Observability Readiness

## Objective

V4.81.1 prepares the API for stronger database-enforced tenant isolation and production observability without claiming that either external capability is already deployed.

This release intentionally separates **readiness primitives** from **production activation**. Existing society-scoped application authorization remains authoritative.

## 1. Tenant database context

PrismaService now exposes a transaction-local PostgreSQL tenant context through `withTenantContext(societyId, operation)`.

The context uses the PostgreSQL setting:

`app.aaraagate_society_id`

The setting is applied with transaction-local semantics. This is important for connection pooling because a society context must not remain on a connection after the transaction finishes.

This primitive is the intended future bridge for policies that read `current_setting('app.aaraagate_society_id', true)`.

### Boundary

**RLS is not enabled in V4.81.1.**

Aaraagate still has legitimate platform-wide, migration, scheduled-work and operational queries. Enabling PostgreSQL row-level security before those paths have explicit policy/runbook coverage could block valid platform workflows or create incorrect cross-society behavior.

The transaction-local context therefore establishes a safe migration mechanism without changing current data authority.

## 2. Runtime raw-query safety

The API runtime no longer uses Prisma unsafe raw-query APIs.

The database readiness probe now uses parameterized `Prisma.sql` rather than `$queryRawUnsafe`.

A repository contract scans `services/api/src` and fails when `$queryRawUnsafe` or `$executeRawUnsafe` is introduced into runtime source.

Performance/test seed tooling remains outside this runtime boundary because it is not request-serving application code.

## 3. Tenant schema readiness audit

The V4.81.1 contract derives tenant-owned Prisma models from the presence of `societyId`.

Every such model must retain a society-leading index or unique key.

At implementation time the established schema contains 45 society-scoped models and all satisfy this index-readiness rule.

The audit complements, rather than replaces:

- TenantGuard society-context validation;
- society/user/unit property-scope predicates;
- permission guards;
- service-level tenant filters;
- existing compound society keys and foreign-key constraints.

## 4. Provider-neutral telemetry

A new in-process `TelemetryService` provides:

- counters;
- gauges;
- histogram summaries;
- a provider-neutral exporter interface;
- a hard series budget;
- dropped-series accounting.

No OpenTelemetry collector, SaaS APM account, metrics database or hosted exporter is activated in this release.

The registry is deliberately bounded-cardinality.

Allowed labels are operational dimensions such as method, normalized route, HTTP status class, dependency, state, operation and domain.

There are **no society, user, unit or request identifiers** in the telemetry label contract.

Dynamic UUID, numeric and opaque route segments are normalized before becoming metric labels.

## 5. Request and dependency instrumentation

Request observability now records:

- `http_requests_total`;
- `http_request_duration_ms`;
- normalized route;
- HTTP method;
- status class.

The existing structured request log retains request ID correlation, but the logged path is normalized so resource identifiers do not create unnecessary cardinality or disclosure.

Health readiness records aggregate `dependency_ready` gauges for:

- PostgreSQL;
- authentication state storage.

Dependency errors remain excluded from readiness responses.

## 6. Productionization boundary

V4.81.1 does not:

- enable PostgreSQL RLS policies;
- change society authorization semantics;
- expose a public metrics endpoint;
- add tenant/user IDs to telemetry;
- activate a hosted telemetry backend;
- configure alert routing;
- claim hosted production acceptance.

RLS rollout still requires policy-by-policy verification for platform, migration, scheduled work, support and society-scoped operations.

**External exporter activation remains productionization** and must be configured together with the selected hosting environment, secrets, retention, alerting and operating runbooks. In repository terms, external exporter activation remains productionization.

## Regression and CI coverage

V4.81.1 adds focused tests for:

- transaction-local tenant DB context and malformed society IDs;
- route normalization;
- counter/gauge/histogram aggregation;
- bounded telemetry series growth;
- provider-neutral export snapshots;
- request metric instrumentation;
- parameterized health readiness probes.

Repository Structure also runs `check-v4.81.1-tenant-observability-readiness.mjs`, which protects release identity, runtime raw-query safety, tenant model index readiness, DB-context semantics and telemetry privacy/cardinality boundaries.

## Release identity

- Root/API/Admin: `4.81.1`
- Resident/Guard: `4.81.1+48101`

## Result

V4.81.1 turns the V4.81 architecture recommendation into a controlled migration foundation: database tenant context is available without prematurely enforcing RLS, and operational telemetry can be exported later without coupling Aaraagate to a specific vendor or leaking tenant identity dimensions.
