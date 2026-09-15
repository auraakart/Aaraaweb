# V2 Staging and Pilot Execution

This runbook coordinates the remaining V2.4 human validation against one exact candidate SHA. It does not replace the existing hosted staging smoke, UAT, policy pilot, security/privacy review, or Accountant/Committee acceptance plans.

## Current state

The execution record is `docs/v2-staging-pilot-execution.json`. It starts `NOT_PREPARED` and `NOT_READY`. That is intentional until a real staging/pilot execution is scheduled.

## Preparation

1. Select the exact `develop` commit to validate.
2. Open a PR from that candidate to `staging`; do not merge a different SHA.
3. Record the current `main` SHA as rollback target.
4. Confirm the hosted staging API origin is HTTPS.
5. Prepare non-production Resident, Guard and Admin test accounts/devices without copying production credentials or resident PII.
6. Identify the pilot society, pilot identifier, release owner and reviewers before changing the execution record to `PILOT_IN_PROGRESS`.

## Hosted staging evidence

After the exact candidate reaches `staging`, require the existing `Hosted staging acceptance` workflow to prove the same SHA is live and dependency-ready. Record only the workflow/run evidence reference in the execution record. Do not store tokens, connection strings, resident information or raw production data.

The execution record checker rejects `STAGING_DEPLOYED` or later unless:
- `stagingSha` is a full SHA and equals the declared `developSha`;
- a full rollback `main` SHA is recorded;
- the staging origin is HTTPS;
- hosted staging acceptance evidence is recorded.

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
