# Aaraagate V4.80.6.1 — Develop Runner Quiescence

Date: 2026-09-30
Baseline: `develop@d9f380ca70fe72ef001283833d051b459d6111fc`

## Root cause completion

V4.80.4 removed stale-base merge failures and V4.80.6 removed most develop-PR runner contention. A final audit found a second-order source of the same delay: after a PR merged, `develop` push triggers could immediately start canonical CI plus historical/security/evidence workflows. Those post-merge runners could contend with the next feature PR in continuous-development mode.

The audit also found two non-required specialist workflows that still ran beside develop PRs: Performance Regression and V3 Runtime Reliability.

## Final develop rule

For an ordinary open `mastermind/* → develop` PR, canonical CI is the only validation workflow used for merge readiness.

After merge, `develop` does not start another validation fan-out.

This preserves the protected develop contexts:
- Repository structure
- API validation
- Admin validation
- Flutter validation
- Dependency security

## Coverage retained without develop fan-out

Lightweight source/release contracts are executed inside Repository Structure, including:
- historical V2/V4 plan/evidence contracts already consolidated by V4.74.1;
- cross-role source contract;
- V4 release evidence contract;
- release-migration shell syntax validation;
- tracked-secret scanning.

Heavy specialist evidence is moved to meaningful boundaries:
- Performance Regression: main PR + weekly schedule + manual.
- V3 Runtime Reliability: main PR + weekly schedule + manual.
- Cross-role E2E: main PR + weekly schedule + manual.
- CodeQL: main PR/main push + schedule.
- Supply-chain security: dependency-relevant main PR/main push + schedule.
- V4 Release Consolidation: main PR + manual.
- Resident Demo APK: main push + manual.

Historical plan/evidence workflows that are already covered by Repository Structure become manual-only. The staging-pilot execution record moves to staging push because it reads staging history.

## Staging and main boundaries

Staging smoke and Backup Restore remain tied to staging pull/push behavior and are not weakened.

Main retains protected CI plus its existing review requirement, release readiness, specialist security/reliability checks and post-main health.

## Branch hygiene

Branch cleanup continues on merged develop PR events, weekly schedule and manual dispatch; the duplicate develop-push trigger is removed.

## Regression prevention

`scripts/check-required-merge-gates.mjs` now fails if:
- canonical CI loses develop/main PR coverage;
- canonical CI regains a develop push trigger;
- any listed specialist/historical workflow regains a develop push trigger;
- Performance, Runtime Reliability, Cross-role E2E, CodeQL, Supply-chain or V4 Release Consolidation regains a develop PR trigger;
- lightweight V4 release evidence/syntax checks disappear from Repository Structure.

## Outcome

A continuous sequence of develop PRs no longer creates its own runner backlog either before or after merge. Staging/main, scheduled and manual evidence boundaries continue to provide deeper validation without blocking normal feature iteration.
