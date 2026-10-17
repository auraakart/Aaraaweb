# V4.96 — recurring preference context and recovery

Authorized by the owner's 17 October instruction to continue remaining nonproduction work. Baseline develop `4b0f9bc4d1a1fbf2ed492a07893828d81f8b54a3`. Develop only; root/API/Admin `4.96.0`, Resident/Guard `4.96.0+49600`.

## Demonstrated gaps and implementation

1. A preference confirmation began before a replacement login, but captured its generation and used `widget.apiClient` only after the dialog returned. It could therefore submit the old plan through the new client. The same screen retained open history/booking routes and allowed an old mutation's `finally` to unlock a new client's operation. Key private screen state by the immutable authenticated API client, capture the client before awaiting, and track/remove only routes owned by the disposed context. Late reads and mutation completions cannot populate or unlock replacement state.
2. The busy guard began after the confirmation dialog, allowing repeated taps to stack dialogs. Pull refresh could also invalidate the active decision's generation. Guard before opening confirmation and prevent refresh while a decision, mutation or explicit booking is active. Preserve the normal explicit confirmation and one-visit booking workflow.
3. A committed-but-lost pause/cancel/resume response left old controls active. Mark preference state uncertain, block further changes and planning, and require a successful authoritative refresh. Failed refresh does not restore stale actions. No automatic retry or guessed server result.

Nine new widget regressions cover replacement login with an open confirmation, single-flight/cancel, uncertain mutation plus failed/successful refresh, late offering/list responses, old visit history, an open booking route, old mutation completion during a new mutation, and refresh during confirmation. Existing current-price, fixed-location, idempotent booking and denied-read recovery tests remain required.

## Validation and boundaries

Status: IN_PROGRESS. Run current release identity and stable invariants locally, then protected full API/Admin/Resident/Guard/security milestone CI. No local Flutter/browser bootstrap is repeated. No API runtime, schema, dependency or native toolchain source changes; retain the inventory generator and all protected gates. Native base smoke is expected to be out of scope for this UI-only fix.

The supplied product specification contains general payment workflow requirements, not accepted Services seller/tax/rework policy values. The [Services 4.5 decision register](AARAAGATE-SERVICES-4.5-WORKFLOW-COMPLETION.md) remains canonical. This fix creates no scheduler, automatic booking/charge, invoice, refund, provider settlement, rework guarantee or new commercial authority.

Independent user/device/onboarding/accountant/AI acceptance remains open in the [consolidated backlog](AARAAGATE-V4.93-COMPLETION-FOLLOW-THROUGH.md). Actual independent TEST registry/runner/observer provisioning, signed partner artifacts and device acceptance remain [#1380](https://github.com/auraakart/Aaraaweb/issues/1380); no additional repository readiness wrapper substitutes for those inputs. V4.95 consent recovery and V4.94 dependency/native migrations remain complete.

Record exact head, protected CI and develop merge after validation. Fix newly demonstrated authorized defects narrowly. Staging/main, the published demo, productionization and iOS remain unchanged.
