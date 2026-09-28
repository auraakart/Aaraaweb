# Aaraagate V4.74.1 — CI Merge-Gate Orchestration

Date: 2026-09-28

## Root cause

Recent delivery cycles were spending unnecessary time repeatedly reading individual CI jobs after the product code was already complete.

The CI workflow already had correct domain wrappers for Repository structure, API, Admin, Flutter and dependency security, but it did not expose one canonical merge-ready result. This encouraged serial polling of individual jobs and attention to unrelated auxiliary workflows such as demo APK, pilot, performance or evidence jobs.

## Fix

V4.74.1 adds a single `Required merge gates` job.

It depends only on:
- Repository structure
- API validation
- Admin validation
- Flutter validation
- Dependency security

The aggregator always runs after those wrappers resolve. It succeeds only when all five required results are `success`.

Auxiliary workflows remain useful evidence, but they are no longer part of the manual merge-readiness decision unless repository policy explicitly promotes them to a required wrapper later.

## Runner decongestion

The delay audit also found nine historical pilot/evidence workflows starting separate Ubuntu runners for every `develop` pull request. Eight of those workflows only execute lightweight Node contract scripts, while the staging-pilot workflow reads staging history and is not a feature-PR merge gate.

V4.74.1 therefore:
- executes the eight lightweight contract scripts inside the existing fast Repository structure job;
- removes `develop` pull-request triggers from all nine standalone workflows;
- retains their `develop` push execution and adds manual `workflow_dispatch`;
- retains `main` pull-request execution for the role-UAT, security/privacy and policy-pilot workflows that already covered main.

This preserves pre-merge contract coverage without allocating nine extra PR runners, while staging-history evidence remains post-merge/manual.

## Develop auto-merge

A separate `Develop auto merge` workflow runs only after the canonical `CI` workflow completes successfully for a pull request. It merges only when all of the following remain true at execution time:
- the PR is open and not draft;
- the base branch is exactly `develop`;
- the head repository is this same repository;
- the head branch starts with `mastermind/`;
- the PR head SHA exactly equals the SHA that CI tested.

The merge is a squash merge and submits that tested SHA as GitHub's merge precondition. The workflow contains no path that targets `staging` or `main`.

## Regression prevention

`scripts/check-required-merge-gates.mjs` is executed by the fast Repository structure job and verifies that:
- the aggregate check still exists;
- its dependency list remains complete;
- it resolves all five wrapper results;
- it remains an always-running resolver.

This makes the orchestration contract self-checking.

## Operating rule

For feature PRs after V4.74.1:
1. Freeze the feature SHA after PR creation.
2. Read the fast Repository structure failure directly if it fails.
3. Otherwise let the single `Required merge gates` result determine CI readiness.
4. Let `Develop auto merge` squash-merge an eligible exact-SHA `mastermind/* → develop` PR after the canonical CI workflow succeeds.
5. Do not poll demo APK, pilot, performance, staging or other auxiliary workflows for a repository-only feature unless they are separately required by the branch policy.
6. `staging` and `main` remain outside this automation; `main` still requires explicit user approval.

No productionization, staging promotion or main promotion is included in this hotfix.
