# Aaraagate V4.80.12 — Main Review Routing Hardening

## Purpose

Close the remaining human-review handoff gap exposed by the V4.80.11 main promotion. V4.80.10.5 documented the independent-review requirement, but a release operator could still open a staging-to-main PR without actually requesting the reviewer, leaving an otherwise green release blocked until the omission was noticed.

## Completed scope

- add `scripts/open-main-release-pr.sh <version>` as the canonical operator path for a protected main release;
- the helper opens or reuses the one `staging -> main` PR and routes `ganeshcatch-ux` by default in the same operator action;
- `MAIN_RELEASE_REVIEWER` may override the reviewer when repository ownership changes without editing the script;
- the helper verifies that GitHub exposes the reviewer request before returning success;
- the helper records the exact staging SHA/tree and previous main SHA in the PR body;
- the helper does not approve or merge main;
- Repository Structure validates helper presence/shell syntax and runs a machine-checkable routing contract;
- the V4.80.10.5 release-routing documentation now points operators to the helper instead of relying on a prose-only manual step.

## Delay-prevention rule

A main-release operation is not considered successfully opened until the independent reviewer request is visible on the PR. Required main checks and the repository rule requiring approval from someone other than the last pusher remain authoritative.

## Boundaries

Release orchestration only. No Resident, Guard, Admin, API, schema, authorization, financial, governance, provider or product behavior changes are introduced.
