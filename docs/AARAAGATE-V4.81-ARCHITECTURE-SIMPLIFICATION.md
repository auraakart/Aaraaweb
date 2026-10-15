# Aaraagate V4.81.0 — Architecture Simplification & Consistency Hardening

## Objective

V4.81.0 converts the post-V4.80 code-health recommendations into repository changes without widening product authority, weakening tenant isolation, or changing the protected main-release process.

## Completed slices

### 1. Property finance policy consistency

- Added a shared property-finance visibility policy separating owner accounting visibility from resident payment authority.
- Current tenants can retrieve payable maintenance dues through the Resident AI status tool because they already hold PAYMENT_CREATE_OWN.
- Tenants do not inherit owner-only PROPERTY_FINANCE_READ or society FINANCE_READ.
- Family members remain excluded from maintenance invoice/payment retrieval through the combined Resident AI tool.
- Payment evidence remains scoped by the existing payer/verified-owner query boundary.

### 2. Reusable property-scope predicates

- Added parameterized society + user + unit predicates for current resident access and current payer access.
- Resident AI unit authorization and Billing AutoPay/current-payer assertions reuse those predicates.
- Current-payer scope remains verified owner OR current TENANT occupancy.
- Generic resident property scope continues to support an active occupant/verified owner where the calling permission permits the workflow.

This is an application-layer convergence step. PostgreSQL row-level security is not enabled in V4.81 because the repository still contains legitimate cross-tenant platform operations and raw SQL paths that require an explicit transaction/session-scope migration before RLS can be enabled safely.

### 3. Authentication degradation safety

- OTP request, OTP verification and refresh-token rate limits fail secure when their limiter state store is unavailable.
- Sensitive authentication traffic receives a bounded 503 retry response rather than bypassing abuse protection.
- Normal API traffic continues the existing availability-oriented fail-open behavior if the limiter is temporarily unavailable.
- Payment callbacks retain their existing provider/reconciliation behavior.

### 4. API runtime hardening

- Added dependency-free defensive response headers.
- HSTS is emitted only for production runtime.
- Express fingerprinting is disabled.
- Nest graceful shutdown hooks are enabled.
- Existing CORS, DTO validation, request IDs, health/readiness and safe logging behavior remain unchanged.

### 5. Complexity decomposition

Resident:
- Extracted household/family/emergency-contact snapshot matching into ResidentHouseholdSnapshot.
- Extracted workforce presence/leave/rating/retry matching into ResidentWorkforceSnapshot.
- ResidentDataController keeps orchestration and mutation authority while pure state interpretation is separately testable.

Amenities:
- Extracted booking-rule parsing, blackout/operating-hours interpretation, guest limits and pricing policy into AmenityPolicyEngine.
- AmenitiesService remains the transactional/application orchestration boundary.
- The service is reduced from roughly 1,518 lines to below the V4.81 1,300-line hotspot budget.

### 6. CI and maintainability convergence

- Consolidated the V4.36–V4.78 historical domain contract steps behind one stable-domain invariant runner while executing the same underlying checks.
- Added permanent hotspot line budgets for Amenities, Resident controller, AI assistant, Billing and Guard operations.
- CI fails if extracted V4.81 boundaries disappear or hotspot classes grow beyond their defined budgets.
- V4.79/current release checks and protected release gates remain separate.

## Regression coverage

V4.81 adds focused coverage for:
- current-tenant payable-dues visibility through Resident AI;
- family-member finance non-widening through the existing combined-status regression;
- authentication limiter store degradation;
- HTTP security-header policy;
- Resident household/workforce snapshot matching;
- Amenity policy parsing, India-local operating windows, pricing overlap and guest limits.

The normal API, Flutter Resident, Guard, Admin and repository invariant suites remain authoritative.

## Release identity

- Root/API/Admin: `4.81.0`
- Resident/Guard: `4.81.0+48100`

## Explicit boundaries

V4.81 does not claim:
- hosted production readiness;
- PostgreSQL RLS rollout;
- a live OpenTelemetry/metrics exporter;
- live payment/OTP/WhatsApp/provider activation;
- signed store distribution;
- physical hardware certification;
- field-pilot or business acceptance.

Database RLS and external telemetry exporters should be introduced only with deployment-aware migration/runbook evidence so repository hardening does not accidentally break platform-wide operations.

## Result

V4.81 reduces policy drift and complexity concentration while preserving Aaraagate's existing tenant, permission, payment, gate and release authorities. Main promotion remains independently approval-gated.
