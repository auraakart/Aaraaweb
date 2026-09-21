# V2 Staging and Pilot Execution

This runbook coordinates the remaining V2.4 human validation against one exact source candidate and its governed staging promotion commit. It does not replace the existing hosted staging smoke, UAT, policy pilot, security/privacy review, or Accountant/Committee acceptance plans.

## Current state

The execution record is `docs/v2-staging-pilot-execution.json`. `STAGING_PROMOTED` means the reviewed `develop` candidate has been merged into the protected `staging` branch and repository-level staging smoke/backup evidence exists, but the hosted staging API has not yet passed exact-deployment acceptance. This is intentionally different from `STAGING_DEPLOYED`.

The current V2.4 source candidate is `26724d3b1b0da114a6fd3b71fa2f88eccae95fad`. PR #551 promoted that candidate into staging merge commit `5d9f9c87fc13d481d5eb30f916349d5cc3458a04`. The promotion merge preserves the exact source-candidate tree. Post-push Staging smoke #491 and Backup restore smoke #309 passed. Hosted staging acceptance #2 did not reach the API because `AARAAGATE_STAGING_API_BASE_URL` was empty, so hosted acceptance remains a blocker rather than evidence of application failure.

## Preparation and promotion

1. Select the exact `develop` commit to validate.
2. Open a PR from that candidate to `staging`; do not move the protected staging ref directly.
3. Verify that `staging` contains no source-only changes relative to its shared source merge-base with the current `develop` candidate. Release-merge ancestry alone does not require reconciliation.
4. Record the current `main` SHA as rollback target.
5. Merge only after the staging API smoke and backup/restore promotion gates are green.
6. Record both identities: `developSha` is the source candidate; `stagingSha` is the governed staging merge commit.
7. The governed staging merge commit must preserve the exact source-candidate tree. Equality between the two commit SHAs is neither expected nor required; release-merge-only ancestry divergence is permitted.

## Hosted staging evidence

After the candidate is promoted to `staging`, configure the non-secret `AARAAGATE_STAGING_API_BASE_URL` with the public HTTPS origin of the hosted staging API and ensure the hosting platform deploys the current staging commit. Require the existing `Hosted staging acceptance` workflow to prove that exact staging commit is live and dependency-ready.

The execution record uses these states:
- `STAGING_PROMOTED`: Git promotion is complete; hosted acceptance may still be blocked or pending.
- `STAGING_DEPLOYED`: the promoted staging commit has a valid HTTPS hosted origin and green hosted staging acceptance evidence.
- `PILOT_IN_PROGRESS`: hosted staging is accepted and real pilot identities/accounts/devices are ready.
- `COMPLETE`: all required execution evidence has been collected.

The checker validates staging promotion by exact source identity and governed staging tree identity; release-merge-only ancestry divergence is permitted while source-only staging drift is rejected. For `STAGING_DEPLOYED` or later it additionally requires:
- a full rollback `main` SHA;
- an HTTPS hosted staging origin;
- hosted staging acceptance evidence.

Never store tokens, connection strings, resident information or raw production data in this record or workflow evidence.

## Pilot entry

Before setting `PILOT_IN_PROGRESS`, the record requires:
- pilot identifier and society name/reference;
- release owner and at least one reviewer;
- test accounts ready;
- representative Resident and Guard devices ready.

Execute the existing evidence packs:
- `docs/v2-role-uat-plan.json`
- `docs/v2-policy-pilot-plan.json`
- `docs/V2-SECURITY-PRIVACY-AUTOMATED-EVIDENCE.md` plus the required human security/privacy review
- `docs/v2-pilot-acceptance-plan.json`
- `docs/UAT-PILOT-CHECKLIST.md`

Do not change the V2.4 manual or pilot gates to accepted until their real evidence and human sign-off exist.

## Release readiness

`READY_FOR_RELEASE` is only an execution-record state; it is not permission to update `main`. The checker requires `COMPLETE`, no blocking issues, and production-preflight evidence before that state is valid. Promotion to `main` still requires the explicit release approval defined by repository governance.

Accepted exceptions must be recorded explicitly. Sev-1/Sev-2, tenant-isolation, authorization, security or payment-integrity blockers are not suitable for silent exception handling.
