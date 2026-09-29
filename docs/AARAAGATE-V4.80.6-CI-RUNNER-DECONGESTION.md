# Aaraagate V4.80.6 — CI Runner Decongestion

Date: 2026-09-30
Baseline: `develop@bfa0cae86bca4719511487b58617212ac7fb8895`

## Root cause

V4.80 delivery delay had two independent causes:

1. Concurrent green feature PRs could validate against the same old `develop` base and one would fail after another merged. V4.80.4 already closed this with serialized auto-merge plus exact-head update-branch refresh.
2. Every ordinary `develop` PR still launched non-required auxiliary workflows alongside canonical CI, while any Flutter change ran both Resident and Guard suites even when only one app changed.

The second condition consumed runner capacity without improving the protected `develop` merge decision.

## Protected-branch boundary

The required `develop` checks remain exactly:
- Repository structure
- API validation
- Admin validation
- Flutter validation
- Dependency security

V4.80.6 does not remove or rename any of these contexts.

## App-scoped Flutter validation

Change Scope now emits separate `run_resident` and `run_guard` decisions.

- Resident-only changes run Resident dependency resolution, risk-weighted tests, analysis and full tests.
- Guard-only changes run the Guard equivalents.
- Cross-cutting workflow/config/package changes still run both.
- The required `Flutter validation` wrapper remains authoritative.

Amenity screen reliability is added to the Resident risk-weighted behavioural suite.

## Dependency-security scope

Tracked-source secret scanning now runs inside the required Repository Structure gate for every code/config PR. The expensive pnpm install/audit lane runs only when a package manifest, pnpm lockfile or workspace manifest changes. The required `Dependency security` wrapper remains unchanged and fails if the scoped audit is required but does not succeed.

## Auxiliary workflow decongestion

- Full Cross-role E2E no longer starts on ordinary develop PRs. Its lightweight source contract now runs in the required Repository Structure gate, while the live E2E runs after merge on `develop` and again before `main`.
- CodeQL no longer starts on ordinary develop PRs. It runs after relevant JavaScript/TypeScript changes land on `develop`, before `main`, and on its schedule.
- Supply-chain SBOM/audit no longer runs for every source-only develop PR. Canonical validation still scans tracked source for secrets before merge, while npm audit runs when the dependency graph changes. Full supply-chain evidence runs for dependency/security-control changes after develop merge, before main, and on schedule.
- Backup Restore no longer starts on develop/main PRs. It remains unfiltered on staging pull requests and staging pushes, preserving the exact release-evidence and staging auto-merge companion-gate contract.

## Regression prevention

`scripts/check-required-merge-gates.mjs` now verifies the app-scoped Flutter contract, dependency-audit scope, required secret scan, cross-role source contract, deferred auxiliary workflow triggers and Backup Restore path gate.

## Delivery rule

Use one focused `mastermind/* → develop` PR at a time. Let canonical Required Merge Gates and V4.80.4 auto-merge resolve the exact tested head. Do not poll or wait on auxiliary post-merge evidence to decide develop merge readiness.

No staging or main promotion is included.
