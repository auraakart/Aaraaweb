# Aaraagate V4.75.1 — In-CI Develop Auto-Merge

Date: 2026-09-28  
Baseline: `develop@523561ea879b996520e7322dc113f83cdcf4a353`

## Root cause

V4.74.1 correctly introduced a canonical `Required merge gates` result, but its separate `Develop auto merge` workflow used the `workflow_run` event.

GitHub dispatches `workflow_run` from the workflow definition present on the repository default branch. Aaraagate intentionally keeps `main` frozen unless explicitly approved, so the new auto-merge workflow existed on `develop` but not on the default branch. As a result, green `mastermind/* → develop` PRs still required a manual merge.

This was an orchestration placement defect, not a product-code or validation defect.

## Fix

V4.75.1 moves develop auto-merge into the existing `CI` workflow as a normal job that depends on `Required merge gates`.

The job runs only when all of the following are true:
- event is a pull request;
- base is exactly `develop`;
- head repository is the same repository;
- head branch starts with `mastermind/`;
- PR is not draft;
- `Required merge gates` succeeded.

## Stale-base protection

Before merging, the job re-reads both the PR and the current `develop` branch.

It requires:
- current PR head SHA equals the head SHA captured when CI started;
- current PR base is still `develop`;
- PR remains open and non-draft;
- head repository remains this repository;
- branch still starts with `mastermind/`;
- current `develop` SHA equals the base SHA captured when CI started.

If `develop` moved while CI was running, the merge fails closed instead of merging a stale PR. The PR must then be updated and revalidated against the new base.

## Exact merge boundary

The merge call uses:
- squash merge;
- the exact expected PR head SHA as GitHub's merge precondition.

The job contains no staging or main target path.

## Cleanup

The standalone `.github/workflows/develop-auto-merge.yml` file is removed because its `workflow_run` placement cannot operate until that workflow exists on the default branch, which is intentionally not being changed.

## Regression prevention

`scripts/check-required-merge-gates.mjs` now verifies:
- canonical `Required merge gates` remains present;
- in-CI `Develop auto merge` depends on that canonical gate;
- exact head and base SHA checks remain present;
- same-repository and `mastermind/*` restrictions remain present;
- write permissions are scoped to the merge job;
- no staging/main merge target is introduced;
- the ineffective standalone workflow file does not return.

## Operating rule

For repository-only feature PRs:
1. Create `mastermind/* → develop` PR.
2. Freeze the head SHA.
3. Let CI run.
4. `Required merge gates` is the only merge-readiness result.
5. In-CI `Develop auto merge` merges the exact validated PR when the base has not moved.
6. Do not manually poll auxiliary workflows.
7. Staging/main remain outside this automation; main still requires explicit user approval.

No productionization, staging promotion or main promotion is included.
