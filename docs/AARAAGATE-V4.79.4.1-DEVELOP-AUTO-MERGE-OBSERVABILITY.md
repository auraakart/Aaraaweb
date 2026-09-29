# Aaraagate V4.79.4.1 — Develop Auto-Merge Observability

Date: 2026-09-29

## Root cause

PR #995 passed every required and evidence workflow, but the final `Develop auto merge` job was marked **skipped**. The merge script never started, so no diagnostic failure was emitted.

The job-level `if` expression combined required-gate success with PR eligibility checks (develop base, same repository, mastermind branch prefix and non-draft state). GitHub evaluates a false or unavailable field in a job-level condition as a silent skip. That made an otherwise healthy, exact-tested PR remain open indefinitely.

## Permanent fix

- Keep the job-level condition limited to:
  - pull-request event;
  - `Required merge gates` succeeded.
- Always start the merge controller after successful gates.
- Evaluate develop-base, draft, repository and `mastermind/*` eligibility inside the shell step.
- Ineligible PRs exit successfully with an explicit reason.
- Eligible mastermind PRs continue to require:
  - exact tested head SHA;
  - unchanged develop base SHA;
  - open PR state;
  - same-repository source;
  - exact-head squash merge.
- The merge API response must report `merged=true`; otherwise the controller fails visibly.
- Already-merged exact-head races are treated as idempotent success.
- The repository semantic guard now inspects the specific required-gate job for `!cancelled()` rather than accepting an unrelated `always()` elsewhere in CI.

## Boundary

This changes develop integration orchestration only. It does not automate staging or main, weaken required checks, bypass branch protection, or change productionization policy.
