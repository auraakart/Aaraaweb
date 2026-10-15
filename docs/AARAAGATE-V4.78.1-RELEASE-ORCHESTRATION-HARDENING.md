# Aaraagate V4.78.1 — Release Orchestration Hardening

Date: 2026-09-29  
Baseline: `develop@cbdc68d6e4b7e29776276e791e48e55be867a194`

## Root cause

The V4.78 work itself was not the main source of elapsed time. The delay came from three workflow weaknesses:

1. a historical semantic guard assumed no-show labels and validation stayed inline in one Admin page, so a safe extraction caused a false CI failure;
2. an AccessService replay test used a fixed visitor-invite expiry date and became a time-bomb on 2026-09-29;
3. staging had two independent green release gates but no final fail-closed orchestration step, leaving an avoidable manual merge/status loop after validation was complete.

V4.78 already corrected the first two causes. V4.78.1 closes the third and makes the staging release path deterministic.

## Changes

- Backup restore smoke now uses an explicit scope job: every pull request targeting `staging` runs the drill, while non-staging development PRs retain the earlier schema/workflow/evidence path sensitivity.
- Both staging release workflows check out the exact pull-request head SHA.
- Both workflows call one shared `try-staging-auto-merge.sh` controller after their own checks succeed.
- The workflow that finishes second performs the merge only when the companion workflow has completed successfully for the same head SHA.
- Immediately before merge the controller rechecks:
  - same-repository PR;
  - open, non-draft state;
  - `staging` base and unchanged base SHA;
  - approved source branch;
  - candidate tree equality with current `develop`;
  - ancestry for `release/*-staging-candidate`;
  - exact expected PR head SHA.
- `main` is not referenced by the auto-merge controller and remains manual/approval-gated.
- The existing staging-release semantic contract now fails CI if these controls drift.

## Expected operating effect

Future safe development becomes:

`mastermind/* → develop (required merge gates + auto-merge) → exact-tree staging candidate → staging smoke + backup/restore → automatic staging merge`

Only promotion to `main` still requires explicit approval.

## Boundaries

This changes release orchestration only. It does not weaken branch checks, skip tests, add productionization, or authorize any main-branch promotion.
