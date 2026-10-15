# Aaraagate V4.81.2 — Maintainability, Dependency & Tenant-Confidence Hardening

## Objective

V4.81.2 consolidates the non-production recommendations from the V4.81.1 repository health review. The milestone reduces hotspot growth risk, accepts only dependency upgrades that pass current protected validation, strengthens real PostgreSQL tenant-context evidence, raises risk-coverage floors, improves branch cleanup governance, and clarifies repository security ownership.

Production hosting, external providers, Android store signing, field-pilot evidence and live monitoring activation remain outside this milestone.

## 1. Dependency hygiene

The maintenance upgrades that remained green on current `develop` are incorporated:

- `typescript-eslint` 8.71.0;
- ESLint 10.11.0.

Partial major upgrades that failed the API/security gates are not accepted:

- NestJS 12 must be upgraded as a coordinated `common/core/platform-express` migration;
- Prisma 7 client and CLI must be upgraded together with the Prisma 7 datasource/client configuration changes;
- the failing Prisma 7 branch also exposed a high-severity transitive `mysql2` advisory and therefore cannot be used as an automatic upgrade path.

The V4.81.2 contract rejects mixed NestJS majors and mixed Prisma client/CLI majors.

## 2. Hotspot architecture extraction

Five files that were above 93% of their V4.81 complexity ceilings received bounded responsibility extraction:

- Billing webhook persistence/state transitions move to `payment-webhook.processor.ts`;
- AI tool definitions, multilingual routing hints and injection/amount parsing move to `ai-assistant.policy.ts`;
- Guard operation sheets/cards move to `guard_operations_components.dart`;
- Resident load/scoping logic moves to the same-library `resident_data_loading.dart` extension;
- Amenity analytics querying moves to `amenity-analytics.query.ts`.

The complexity gate is tightened to the new post-extraction sizes instead of raising limits.

## 3. Tenant-isolation confidence

V4.81.2 adds a PostgreSQL-backed integration test for `PrismaService.withTenantContext` using the clean PostgreSQL service already provided by API CI.

The test verifies:

- society context is visible inside the intended transaction;
- sequential tenant transactions receive their own society context;
- the tenant value is not retained after each transaction;
- malformed society IDs are rejected before tenant work executes.

This is stronger migration evidence for future database enforcement. **PostgreSQL RLS remains disabled.**

## 4. Risk coverage gates

Risk-weighted coverage floors are raised where current V4.81.1 evidence provides sufficient margin.

API floors are strengthened for access, session security, household scope and AI operations. Resident/Guard floors are strengthened for the resident controller, Gate, Billing, Home, Guard controller and typed Guard boundaries.

The Resident privacy screen remains at its existing floor until additional focused tests provide safe headroom; V4.81.2 does not raise a threshold beyond demonstrated coverage.

## 5. Branch hygiene

Historical retention no longer bypasses current canonical comparison.

Each retained branch is re-evaluated against:

- ancestry;
- exact source-tree equivalence;
- exact merged canonical PR head evidence;
- explicitly superseded canonical PR head evidence.

A retained branch is kept only when that fresh comparison still cannot prove integration. The weekly hygiene run now deletes only branches that meet those proof conditions; ambiguous or recovery branches remain preserved/review-only.

## 6. CI signal quality

Admin lint remains an explicit required CI action. The Next production build therefore skips its duplicate build-time lint pass, removing redundant work and avoiding the misleading Next-plugin warning without weakening lint enforcement.

## 7. Repository security governance

V4.81.2 adds:

- `SECURITY.md` with safe vulnerability-reporting and evidence-handling rules;
- `.github/CODEOWNERS` for repository and high-risk security/finance/gate/release-control paths.

This milestone does not change repository visibility and does not invent a software license; either decision requires explicit owner/legal direction.

## Release identity

- Root/API/Admin: `4.81.2`
- Resident/Guard: `4.81.2+48102`

## Explicit boundaries

V4.81.2 does **not**:

- enable PostgreSQL RLS;
- activate an external telemetry exporter;
- provision hosting or live provider credentials;
- produce a signed Play Store release;
- change repository visibility;
- add or infer a software license;
- perform NestJS 12 or Prisma 7 major migrations.

## Result

V4.81.2 converts the health-review recommendations into enforceable repository controls: the most important hotspots have headroom again, tenant context is exercised against a real PostgreSQL database in CI, risk coverage expectations are higher, dependency majors cannot drift independently, and branch/security governance is less ambiguous.
