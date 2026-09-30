# Aaraagate V4.80.10.5 — Main Review Routing

## Purpose

Close the release-orchestration gap discovered after V4.80.10.4 staging promotion.

GitHub repository settings reject pull-request creation or approval from the default Actions token. The protected repository also requires approval from someone other than the last pusher. A staging controller therefore must not attempt to create or approve the main promotion PR.

## Durable release path

1. Develop changes merge through normal protected CI.
2. The exact validated develop tree is promoted to staging.
3. Staging API smoke and PostgreSQL backup/restore must pass before staging merge.
4. Staging automation stops after the staging merge.
5. A release operator opens the staging -> main PR.
6. The independent reviewer is requested; the current established reviewer is `ganeshcatch-ux`.
7. Main protected checks run on the exact staging head.
8. Main merges only after independent approval and required checks pass.

## Delay-prevention controls

- release-control-only changes use the focused CI path and do not wake unrelated Admin/API/Flutter full suites;
- staging candidates may carry current main ancestry while preserving the exact develop tree, avoiding redundant history reconciliation;
- staging controllers cannot create, approve, or merge main;
- repository branch protection remains authoritative and is not weakened;
- hosted production acceptance remains a separate fail-closed productionization concern.

## Scope

Release orchestration only. No Resident, Guard, Admin, API, schema, permission, or product behavior change.
