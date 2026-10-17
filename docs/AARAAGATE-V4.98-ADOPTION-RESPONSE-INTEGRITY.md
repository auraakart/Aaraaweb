# V4.98 — adoption response integrity and source locations

Authorized by the owner's 17 October instruction to continue remaining nonproduction work. Baseline develop `65a07f26d611b9691f070c4d2396bc02479e324e`. Develop only; root/API/Admin `4.98.0`, Resident/Guard `4.98.0+49800`.

## Demonstrated gaps and fixes

1. Onboarding checked only the production-acceptance flag before rendering nested server values. Partial activation/steps could cause render errors, and inconsistent counters or destinations could be displayed. Validate the existing response contract, step identifiers/states/local paths, reported counts, activation values and timestamp before accepting it into state. Invalid data shows a recoverable error, with no old progress or workspace links. This validates reported evidence; the existing server still owns readiness, policy and permissions.
2. Import preview trusted response counts/rows/issues, allowing malformed responses to crash rendering or enable batch creation. Bind the response to the requested entity and source row count, validate normalized string values, issue row bounds and consistent invalid/duplicate counts, then expose it. Batch creation previously accepted any object as success and invoked the workspace refresh callback. Require a complete entity/status/identity/checksum/replay contract before success/callback. Ambiguous responses tell the operator to review existing batches; no automatic retry. A valid replay reports its recorded state, including COMMITTED/ROLLED BACK/FAILED, rather than claiming a new dry-run was created.
3. The parser preserved physical source lines after V4.97, but preview error rendering still showed the API record ordinal. Bind each accepted preview to the immutable submitted source-line list and map errors to the actual CSV/XLSX source row. Preserve server ordinals and APIs; no batch row identity, checksum or migration authority changes.

## Validation ledger

Status: IN_PROGRESS. Add 27 focused production response-contract cases to normal Admin validation and 32 browser regressions across actual onboarding/preview/batch/recovery and CSV/XLSX source locations. Existing context replacement, file integrity, explicit confirmation and role tests remain required. A fixture's historical DRY_RUN creation response is corrected to the actual READY/entity/checksum/replay API contract; its success assertions are retained.

Run focused contracts, all stable invariants and current release checks, then protected full API/Admin/Flutter/security milestone CI. No dependency, API runtime, schema, tenant inventory or native toolchain changes. Do not repeat local Flutter/browser bootstrap; use protected CI. Automated fixtures are not independent onboarding or accountant acceptance.

The [consolidated backlog](AARAAGATE-V4.93-COMPLETION-FOLLOW-THROUGH.md) still requires independent onboarding/accountant/user/device/representative AI acceptance. Accepted [Services commercial decisions](AARAAGATE-SERVICES-4.5-WORKFLOW-COMPLETION.md) and actual [V5 TEST/partner evidence #1380](https://github.com/auraakart/Aaraaweb/issues/1380) remain missing inputs. No repository-only readiness wrapper substitutes for operator provisioning, partner artifacts or device observations. V4.94–V4.97 remain complete.

Record exact protected head/CI/develop merge after validation. Staging/main, the published demo, productionization and iOS remain unchanged.
