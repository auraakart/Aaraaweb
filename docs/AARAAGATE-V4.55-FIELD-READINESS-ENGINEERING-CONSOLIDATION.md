# Aaraagate V4.55 — Field Readiness & Engineering Consolidation

Date: 2026-09-25

## Objective

V4.55 converts the V4.54 repository baseline into a stricter release candidate without adding broad product scope. The release concentrates on field-readiness truth, hosted-stage enforcement, current Flutter support, supply-chain controls, behavioural regression evidence, release identity and repository hygiene.

## 1. Hosted staging becomes a main-promotion gate

The staging-to-main release-readiness job now runs the hosted TLS/readiness smoke against the exact staging candidate. Main promotion fails closed when `AARAAGATE_STAGING_API_BASE_URL` is missing, the hosted service is unreachable/unhealthy, or the deployed commit does not match the candidate.

Repository smoke is no longer treated as a substitute for hosted acceptance.

## 2. Flutter 3.47 convergence

Resident CI, Guard CI, Resident demo packaging and signed Resident release packaging use Flutter 3.47.0. Resident and Guard source themes use the current `CardThemeData` and `DialogThemeData` APIs directly; packaging no longer rewrites validated source as a compatibility patch.

## 3. Risk-weighted behavioural regression gates

CI explicitly exercises high-risk behaviour before the broad suites:
- occupancy / tenant isolation;
- visitor gate lifecycle;
- canonical payment availability;
- controlled AI Helpdesk assignment;
- privacy self-context;
- Resident property isolation, gate, billing, privacy and Action Inbox behaviour;
- Guard offline recovery, realtime lifecycle and workforce assignment.

These execute real tests. Historical token-based milestone contracts remain secondary repository invariants rather than the primary behavioural evidence.

## 4. Supply-chain security

V4.55 adds:
- CodeQL JavaScript/TypeScript analysis;
- Dependabot configuration for GitHub Actions, pnpm/npm and both Flutter apps;
- high/critical npm audit;
- high-confidence tracked-secret scanning;
- a CycloneDX 1.6 SBOM generated from resolved CI dependency inventories and retained as workflow evidence.

These controls improve evidence but do not constitute vulnerability, licensing or regulatory certification.

## 5. Release identity

Root workspace, API and Admin identify V4.55.0. Resident and Guard identify `4.55.0+45500`. Signed Resident AAB creation rejects a supplied release label that does not match the Resident source version.

Runtime deployments continue to expose immutable `APP_VERSION` and `GIT_SHA` through health metadata.

## 6. Pilot truth boundary

`docs/v4.55-pilot-readiness-evidence.json` intentionally starts at `NOT_EXECUTED`. Real hosted infrastructure, devices, providers, hardware, store signing and society/business acceptance must be evidenced externally before the status changes.

CI must never convert repository completion into a synthetic pilot claim.

## 7. Repository hygiene and promotion discipline

Branch hygiene continues automatically after merged develop work and now performs a weekly classification-only review during quiet periods. Canonical promotion remains:

`feature -> develop -> staging -> main`

V4.55 is intentionally batched to minimize canonical release commits: one source integration into develop, one staging promotion and one main promotion when all gates—including hosted staging—are green.

## Exit state

Repository implementation can be complete while field acceptance remains pending. Main promotion is blocked by design until the exact hosted staging candidate is demonstrably healthy.
