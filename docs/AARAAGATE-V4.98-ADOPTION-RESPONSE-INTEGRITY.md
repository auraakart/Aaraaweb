# V4.98 — adoption response integrity and source locations

Authorized by the owner's 17 October instruction to continue remaining nonproduction work. Baseline develop `65a07f26d611b9691f070c4d2396bc02479e324e`. Develop only; root/API/Admin `4.98.0`, Resident/Guard `4.98.0+49800`.

## Demonstrated gaps and fixes

1. Onboarding checked only the production-acceptance flag before rendering nested server values. Partial activation/steps could cause render errors, and inconsistent counters or destinations could be displayed. Validate the existing response contract, step identifiers/states/local paths, reported counts, activation values and timestamp before accepting it into state. Invalid data shows a recoverable error, with no old progress or workspace links. This validates reported evidence; the existing server still owns readiness, policy and permissions.
2. Import preview trusted response counts/rows/issues, allowing malformed responses to crash rendering or enable batch creation. Bind the response to the requested entity and source row count, validate normalized string values, issue row bounds and consistent invalid/duplicate counts, then expose it. Batch creation previously accepted any object as success and invoked the workspace refresh callback. Require a complete entity/status/identity/checksum/replay contract before success/callback. Ambiguous responses tell the operator to review existing batches; no automatic retry. A valid replay reports its recorded state, including COMMITTED/ROLLED BACK/FAILED, rather than claiming a new dry-run was created.
3. The parser preserved physical source lines after V4.97, but preview error rendering still showed the API record ordinal. Bind each accepted preview to the immutable submitted source-line list and map errors to the actual CSV/XLSX source row. Preserve server ordinals and APIs; no batch row identity, checksum or migration authority changes.

## Validation ledger

Status: MERGED_PROTECTED_CI_PASSED; all three demonstrated adoption fixes are complete on develop. Independent acceptance remains open.

- Implementation [PR #1427](https://github.com/auraakart/Aaraaweb/pull/1427), validated head `461882d7d74cb4c4601f4ea2bff784248db64367`.
- Develop merge `c16c848958bcd47037844ed4fca3eaf1aca33b79`; tree `a9a8b30cb4c7af5e8d32ba94a4605075106996f7` matches the reviewed local/uploaded source.
- Protected [CI 39037162716](https://github.com/auraakart/Aaraaweb/actions/runs/39037162716) completed successfully for that exact PR head through `.github/workflows/ci.yml`. Repository structure, preflight, full API/Admin/Flutter, dependency security and Required merge gates passed before normal develop auto-merge. No CI correction or gate bypass was needed.
- All 124 Admin browser/accessibility cases passed, including 32 new regressions for malformed/recovered onboarding and preview responses, unconfirmed batch results, existing COMMITTED replay status and physical CSV/XLSX source error locations. Existing context replacement, file integrity, confirmation and role cases remain intact. The historical fixture's DRY_RUN creation response was corrected to the actual READY/entity/checksum/replay contract, retaining its success assertions.
- All 27 focused production response cases passed locally and in normal Admin validation. All 44 stable invariants, current release/maintainability/privacy/hygiene and authoritative onboarding contracts plus `git diff --check` passed locally.
- Admin lint/type/build, actual direct-host SSR/cookie isolation and local TLS 1.3 lifecycle checks passed. API broad phase: 2,432 passed / 15 intentionally skipped, then all 86 risk cases; dedicated database gates passed. Full Resident/Guard analysis, behavioural suites and risk coverage gates passed.
- No dependency, API runtime, schema, tenant inventory or native toolchain changes. The original inventory generator remains enforced; Android base smoke was correctly skipped. No new demo, partner artifact or physical-device result is claimed. No local Flutter/browser bootstrap was repeated. Automated fixtures are not independent onboarding or accountant acceptance.

The [consolidated backlog](AARAAGATE-V4.93-COMPLETION-FOLLOW-THROUGH.md) still requires independent onboarding/accountant/user/device/representative AI acceptance. Accepted [Services commercial decisions](AARAAGATE-SERVICES-4.5-WORKFLOW-COMPLETION.md) and actual [V5 TEST/partner evidence #1380](https://github.com/auraakart/Aaraaweb/issues/1380) remain missing inputs. No repository-only readiness wrapper substitutes for operator provisioning, partner artifacts or device observations. V4.94–V4.97 remain complete.

Next actual inputs remain accepted Services commercial decisions, independent onboarding/accountant/user/device/AI acceptance and external TEST/partner evidence in #1380. Fix newly demonstrated authorized defects narrowly. Staging/main, the published V4.91.5 demo, productionization and iOS remain unchanged.
