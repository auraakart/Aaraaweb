# Aaraagate V4.78.3 — Protected Staging Check Orchestration

Date: 2026-09-29  
Baseline: `develop@f755736dcdb6983f49ae00e611a4beb5ed2823e2`

## Root cause

The V4.78.2 proof passed the staging API smoke itself, readiness/liveness validation and backup/restore, but the merge attempt was executed as the final step inside the protected `Staging API smoke` job.

GitHub branch protection correctly rejected that merge because the required status check was still `in_progress` until the job finished. This created a self-dependency: the job could not finish until its merge step finished, and the merge could not occur until the job was finished.

## Fix

- Remove merge mutations from the protected smoke jobs.
- Add downstream release-controller jobs with explicit `needs` on the protected jobs.
- The staging controller starts only after `Staging API smoke` succeeds.
- The backup controller starts only after the PostgreSQL backup/restore drill succeeds.
- Controllers query the named companion **job** for the same candidate SHA rather than the whole workflow run.
- The controller that observes both protected jobs green attempts the exact-head merge.
- If both controllers race, the loser re-reads the PR and treats an already-merged exact head as recovered success.
- Existing exact-tree, base-SHA, branch-source and develop-tree checks remain unchanged.
- Main is not automated.

## Result

Branch protection stays fail-closed, protected checks can complete normally, and staging promotion no longer depends on a manual merge after the two release gates are green.
