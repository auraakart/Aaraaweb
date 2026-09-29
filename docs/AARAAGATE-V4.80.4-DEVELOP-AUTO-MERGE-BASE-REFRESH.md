# Aaraagate V4.80.4 — Develop Auto-Merge Base Refresh

Date: 2026-09-29  
Baseline: `develop@328a06f10866cf6c1eb4033d12aefa6f2141889e`

## Incident

V4.80.1 and V4.80.3 were independently green on their product and security gates, but V4.80.2 merged first and advanced `develop`. The existing V4.75.1 auto-merge controller intentionally failed closed when the current develop SHA no longer equalled the PR event's captured base SHA.

That stale-base protection prevented an unvalidated merge, but it converted a normal concurrent-PR condition into a failed CI run and required a manual branch synchronization before validation could continue.

## Fix

The in-CI `Develop auto merge` job now serializes merge decisions with one repository-level concurrency group.

For an eligible same-repository `mastermind/* → develop` PR whose canonical Required Merge Gates passed:

1. Re-read the PR and current `develop`.
2. Require the PR head to remain the exact SHA that the completed CI run tested.
3. If `develop` moved since the PR event, call GitHub's update-branch API with that exact expected head SHA and exit without merging.
4. Let the resulting `synchronize` event start validation again on the refreshed head/current base.
5. Re-read `develop` immediately before merge; if it moved again, refresh instead of merging.
6. Only when the tested base is still current, squash-merge using the exact tested head SHA as the merge precondition.

## Safety boundary

This change does not weaken branch validation and does not auto-resolve code conflicts. An update-branch conflict still fails closed and requires normal conflict resolution.

The controller still requires:
- canonical Required Merge Gates success;
- base exactly `develop`;
- same repository;
- non-draft PR;
- `mastermind/*` head branch;
- exact tested head SHA;
- squash merge.

No staging or main target is introduced. Main remains explicitly approval-gated.

## Regression prevention

`scripts/check-required-merge-gates.mjs` now verifies:
- serialized develop auto-merge concurrency is present and does not cancel queued merge decisions;
- stale bases use `/update-branch` with the exact expected head SHA;
- a second current-develop comparison occurs before merge;
- the old hard-fail stale-base assertion cannot return;
- exact-head and develop-only merge boundaries remain intact.

## Outcome

Concurrent V4.80 feature PRs no longer need a manual refresh merely because another validated PR reached `develop` first. A stale PR is refreshed, revalidated, and only then eligible for auto-merge.
