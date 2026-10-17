# V4.96 — recurring preference context and recovery

Authorized by the owner's 17 October instruction to continue remaining nonproduction work. Baseline develop `4b0f9bc4d1a1fbf2ed492a07893828d81f8b54a3`. Develop only; root/API/Admin `4.96.0`, Resident/Guard `4.96.0+49600`.

## Demonstrated gaps and implementation

1. A preference confirmation began before a replacement login, but captured its generation and used `widget.apiClient` only after the dialog returned. It could therefore submit the old plan through the new client. The same screen retained open history/booking routes and allowed an old mutation's `finally` to unlock a new client's operation. Key private screen state by the immutable authenticated API client, capture the client before awaiting, and track/remove only routes owned by the disposed context. Late reads and mutation completions cannot populate or unlock replacement state.
2. The busy guard began after the confirmation dialog, allowing repeated taps to stack dialogs. Pull refresh could also invalidate the active decision's generation. Guard before opening confirmation and prevent refresh while a decision, mutation or explicit booking is active. Preserve the normal explicit confirmation and one-visit booking workflow.
3. A committed-but-lost pause/cancel/resume response left old controls active. Mark preference state uncertain, block further changes and planning, and require a successful authoritative refresh. Failed refresh does not restore stale actions. No automatic retry or guessed server result.

Nine new widget regressions cover replacement login with an open confirmation, single-flight/cancel, uncertain mutation plus failed/successful refresh, late offering/list responses, old visit history, an open booking route, old mutation completion during a new mutation, and refresh during confirmation. Existing current-price, fixed-location, idempotent booking and denied-read recovery tests remain required.

## Validation and boundaries

Status: MERGED_PROTECTED_CI_PASSED; all three demonstrated recurring workflow fixes are complete on develop. Independent acceptance and policy-dependent work remain open.

- Implementation [PR #1423](https://github.com/auraakart/Aaraaweb/pull/1423), validated head `d2863640399e6adfd60d922cb80b58489dca0047`.
- Develop merge `3ac3f104f3a559c3ae617473e101e347c8f12024`; tree `abe6cb0f10ee2ef8a620cd7af92c08d402d33d4e` matches the locally reviewed/uploaded tree.
- Protected [CI 39032742302](https://github.com/auraakart/Aaraaweb/actions/runs/39032742302) completed successfully for that exact PR head through `.github/workflows/ci.yml`. Repository structure, preflight, full API/Admin/Flutter, dependency security and Required merge gates passed before normal develop auto-merge. No CI correction or gate bypass was required.
- Flutter analysis, all nine new recurring regressions, the three existing recurring tests, full Resident/Guard suites and risk coverage gates passed. This includes an open confirmation, history sheet and booking route during replacement login, pending old reads/mutations, duplicate actions and uncertain-state recovery.
- API broad phase: 2,432 passed / 15 intentionally skipped, then all 86 risk cases; dedicated database gates passed. API runtime and tenant inventory remain unchanged, with the original generator retained in protected CI.
- Admin lint/type/build, all 65 browser/accessibility cases, actual direct-host SSR/cookie isolation and local TLS 1.3 host/cookie lifecycle regressions passed.
- Local validation: all 44 stable invariants, current release identity/maintainability/privacy/hygiene checks and `git diff --check` passed. Local Flutter/browser bootstrap was not repeated.
- No API runtime, schema, dependency or native toolchain source changes. Android base smoke was correctly skipped for this UI-only fix; V4.94's actual native evidence remains retained. No new demo, partner artifact or physical-device result is claimed.

The supplied product specification contains general payment workflow requirements, not accepted Services seller/tax/rework policy values. The [Services 4.5 decision register](AARAAGATE-SERVICES-4.5-WORKFLOW-COMPLETION.md) remains canonical. This fix creates no scheduler, automatic booking/charge, invoice, refund, provider settlement, rework guarantee or new commercial authority.

Independent user/device/onboarding/accountant/AI acceptance remains open in the [consolidated backlog](AARAAGATE-V4.93-COMPLETION-FOLLOW-THROUGH.md). Actual independent TEST registry/runner/observer provisioning, signed partner artifacts and device acceptance remain [#1380](https://github.com/auraakart/Aaraaweb/issues/1380); no additional repository readiness wrapper substitutes for those inputs. V4.95 consent recovery and V4.94 dependency/native migrations remain complete.

Next actual inputs are accepted Services commercial decisions, independent user/device/onboarding/accountant/AI acceptance and external TEST/partner evidence in #1380. Fix newly demonstrated authorized defects narrowly. Staging/main, the published V4.91.5 demo, productionization and iOS remain unchanged.
