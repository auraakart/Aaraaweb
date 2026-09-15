# Staging Release Evidence

Updated: 2026-09-15

The `Staging smoke` workflow is the repository gate for an immutable Aaraagate staging candidate. It validates code and release metadata; it does not claim that a hosted environment, managed backup policy, monitoring route or real device has been verified.

## Promotion contract

- A pull request targeting `staging` must originate from `develop`.
- The current `staging` commit must be an ancestor of the candidate. If histories diverge, reconcile `staging` into `develop` through a reviewed PR before promotion.
- The workflow checks out `github.event.pull_request.head.sha`, not GitHub's synthetic pull-request merge ref.
- `GIT_SHA`, the checked-out commit and the evidence candidate SHA must be identical.
- Direct `develop` and `staging` pushes continue to exercise the same runtime smoke without changing the production branch.

## Retained evidence

Every run uploads a 30-day `staging-evidence-<run-id>` artifact containing:

- immutable candidate and checked-out SHAs;
- source and target refs;
- target SHA observed when the run started;
- workflow run ID and UTC timestamp;
- the non-sensitive readiness response proving PostgreSQL and Redis/auth-state health plus release metadata.

The artifact must never contain credentials, connection strings, tokens, resident data or other customer information.

## Hosted acceptance remains separate

Before pilot or production approval, an accountable release owner must still record:

- the hosted artifact/image identifier and deployed candidate SHA;
- public TLS endpoint checks;
- managed PostgreSQL backup, retention, encryption and PITR settings;
- an isolated provider restore result;
- monitoring destinations, alert routing and alert-delivery test;
- representative Resident and Guard device UAT;
- rollback owner and previous known-good immutable artifact.

Use `docs/BACKUP-RESTORE-EVIDENCE.md` and `docs/UAT-PILOT-CHECKLIST.md`. Do not mark hosted controls complete based only on repository CI.
