# Aaraagate V4.81.4 — Privacy Recovery & Dependency-Cohort Hardening

## Objective

V4.81.4 closes two residual non-production engineering gaps after the V4.81.2 health-review closure and V4.81.3 release-orchestration hardening: Resident privacy self-service recovery/coverage and unsafe partial-major dependency proposal handling.

Productionization, live external providers, PostgreSQL RLS, signed store release, field-pilot evidence, repository visibility/licensing decisions, and actual NestJS 12 / Prisma 7 migrations remain outside this milestone.

## 1. Resident privacy recovery

The privacy request history is authoritative user-facing workflow state. Privacy-program and grievance-contact metadata are useful explanatory context, but they must not make request history unavailable when that optional context endpoint is temporarily degraded.

V4.81.4 therefore makes the privacy context fetch non-blocking while retaining fail-closed behavior for the actual privacy request-history request.

The request-details dialog also avoids a controller-disposal race during route dismissal and uses scroll-safe content so correction/erasure detail capture remains stable with the on-screen keyboard and smaller viewports.

Focused behavioural coverage now proves that:

- request history remains visible when optional context metadata fails;
- an uncertain privacy submission can be retried using the same request key rather than creating a duplicate intent;
- correction requests remain disabled until required details are entered and the reviewed text is submitted.

The Resident privacy screen risk-coverage floor rises from 20% to 35%. This is a repository quality floor, not a privacy-compliance certification.

## 2. Coordinated dependency-major proposals

The failed NestJS and Prisma dependency proposals demonstrated that independent major bumps are unsafe for these coupled packages.

Dependabot now groups:

- `@nestjs/common`, `@nestjs/core`, and `@nestjs/platform-express` for major updates;
- `prisma` and `@prisma/client` for major updates.

This prevents the repository automation from proposing the previously observed mixed-major states. Existing V4.81.2 invariants continue to reject mixed NestJS and Prisma majors.

V4.81.4 does **not** upgrade to NestJS 12 or Prisma 7. Those remain coordinated migration projects requiring their own compatibility changes and full protected validation.

## 3. Historical invariant continuity

The V4.81.3 release-orchestration contract is made forward-compatible with later release identities while continuing to enforce its staging/main source-equivalence and fail-safe validation rules.

## Release identity

- Root/API/Admin: `4.81.4`
- Resident/Guard: `4.81.4+48104`

## Promotion discipline

Implementation is isolated on the V4.81.4 feature branch and must pass protected validation before a squash merge to `develop`. Staging should receive one consolidated exact-tree promotion after develop is green. Main remains unchanged until explicit owner approval.

## Result

V4.81.4 improves graceful degradation of Resident privacy self-service, raises focused behavioural evidence on the previously lowest-covered high-risk Resident screen, and prevents automation from recreating known invalid partial-major dependency combinations without widening runtime authority or production scope.
