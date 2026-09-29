# Aaraagate V4.79.4.1 — Develop Auto-Merge Observability

Date: 2026-09-29

## Root cause

PR #995 passed every required and evidence workflow, but the final `Develop auto merge` job was marked **skipped**. The merge script never started, so no diagnostic failure was emitted.

The job-level `if` expression combined required-gate success with PR eligibility checks (develop base, same repository, mastermind branch prefix and non-draft state). GitHub evaluates a false or unavailable field in a job-level condition as a silent skip. That made an otherwise healthy, exact-tested PR remain open indefinitely.

## Permanent fix

- Remove the auto-merge job-level `if` entirely.
- `needs: [required-merge-gates]` remains the only scheduling dependency, so GitHub starts the controller only after that required job succeeds.
- Always start the merge controller after successful gates.
- Evaluate event type, develop-base, draft, repository and `mastermind/*` eligibility inside the shell step.
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

## Release-control validation fast path

A second repeat-delay source was also confirmed: changing only the CI orchestration controller still woke full API, Admin, Flutter and dependency-audit runners because every `.github/**` change was conservatively treated as cross-cutting product code.

The first reduced job-level condition still reproduced the skipped controller on #996. That proved the stable fix is to remove **all** auto-merge job-level applicability conditions rather than trying to find a smaller safe expression.

The new fast path is deliberately narrow:
- only `.github/workflows/ci.yml`, this orchestration guard/classifier and documentation are eligible;
- inside `ci.yml`, only `change-scope`, `dependency-security-full`, `dependency-security` and `develop-auto-merge` may differ from the PR base;
- the classifier compares the rest of `ci.yml` byte-for-byte after masking those approved jobs;
- any application/API/schema/package/lockfile or other CI-job change falls back to the normal full validation;
- tracked-secret scanning still runs before the fast path is accepted;
- Repository structure still runs all semantic release-control contracts.

## Boundary

This changes develop integration orchestration only. It does not automate staging or main, weaken required product checks for product changes, bypass branch protection, or change productionization policy.
