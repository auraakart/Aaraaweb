# V4.95 — Services consent and commercial review recovery

Authorized by the owner's 17 October instruction to continue the nonproduction next steps. Baseline develop: `82f6cfbd99dd89f9590ae0dc43e8c9870625c7f9`. Target develop; root/API/Admin `4.95.0`, Resident/Guard `4.95.0+49500`.

## Verified gaps and implementation sequence

| Slice | Demonstrated gap | Change and required regression evidence |
| --- | --- | --- |
| V4.95.1 Quote amount truth | The post-service panel used `BigInt.tryParse(raw) ?? BigInt.zero`; missing/malformed amounts appeared as ₹0.00 and left approval/bill controls enabled. | Require positive decimal whole paise within the existing backend quote bound of 100,000,000 paise. Show amount unavailable for invalid values; block approval and separate-bill requests without reviewable scope/amount. Preserve one-paise formatting and consent-only/nonpayable copy. No tax/price policy is invented. |
| V4.95.2 Consent response recovery | The decision guard began after the confirmation dialog; an uncertain response lost the original decline reason and required another dialog, although the backend requires the exact original decision/reason for receipt replay. | Guard before opening the dialog; retain an uncertain decision/reason within the current view and expose an exact saved retry. Do not allow a conflicting new approval/decline while uncertain. Fresh terminal server evidence or a successful replay settles it. Widget regression must simulate a committed-but-lost response and verify identical retry bodies. No new payment or API authority. |
| V4.95.3 Source and context recovery | Failed quote/bill reads were silently treated as empty history. Five optional reads and up to five dispute threads were serialized behind core reads. Post-service state lacked a booking/client identity boundary. | Show unknown financial-source status and explicit retry; disable another bill request while its history is unknown. Start independent reads together and bound thread reads in parallel. Key inner state by immutable authenticated API client and booking; discard late loads and close owned commercial dialogs when that context is replaced. Test request concurrency, failed/malformed reads, replacement login, booking switch and dialog single-flight. |

No independent field/UAT results were supplied for this cycle. These are source-demonstrated correctness/recovery gaps verified with automated widget tests, not claimed user observations. Reuse the existing server-scoped quote, consent and separate-bill APIs and immutable receipts; no route, schema, financial mutation or commercial policy is added.

## Commercial decisions still required

The [Services 4.5 decision register](AARAAGATE-SERVICES-4.5-WORKFLOW-COMPLETION.md) remains canonical: seller/invoice owner; finance-approved parts/labour and tax treatment; fresh extra-work payment consent, cancellation/refunds/reconciliation/settlement; category rework targets/terms. The current instruction authorizes implementation work but supplies none of those missing policy values. Quote approval remains scope consent, and a separate-bill request remains nonpayable evidence. This milestone does not implement chargeable consolidated checkout or invoice issuance.

Independent device/accessibility/notification/onboarding acceptance, accountant/treasurer acceptance and reviewed representative AI answers remain open in the [consolidated backlog](AARAAGATE-V4.93-COMPLETION-FOLLOW-THROUGH.md). Actual partner TEST provisioning and signed artifacts remain [#1380](https://github.com/auraakart/Aaraaweb/issues/1380). No new readiness wrapper substitutes for that evidence. [V4.94 dependency/native migrations](AARAAGATE-V4.94-DEPENDENCY-MIGRATIONS.md) stay complete.

## Validation and continuation ledger

Status: MERGED_PROTECTED_CI_PASSED; all three repository slices are complete on develop. Independent acceptance and the commercial decisions above remain open.

- Implementation: [PR #1421](https://github.com/auraakart/Aaraaweb/pull/1421), validated head `00f5ec4c9921951e3faadda37fe141a8964801d6`.
- Develop merge: `3136dc4c7cc99e49b1b409783f888c76b15891cb`; source tree `3ca46e495287a6fa013a3f0fdafae09c82911584` matches the uploaded and locally staged tree.
- Protected [CI 39024729358](https://github.com/auraakart/Aaraaweb/actions/runs/39024729358) completed successfully for that exact PR head through `.github/workflows/ci.yml`. Repository structure, preflight, full API/Admin/Flutter, dependency security and Required merge gates passed before normal develop auto-merge. No CI correction or gate bypass was needed.
- Flutter: analysis, all 20 new post-service widget cases, existing post-service regressions, full Resident/Guard suites and risk coverage gates passed. New cases cover ten invalid/missing amount shapes, one-paise formatting, invalid approved amounts, a committed-but-lost decline response with identical reason replay, dialog single-flight, failed/malformed quote reads, failed bill history and recovery, concurrent reads, late old-client results and booking changes with an open consent dialog.
- API: broad phase 2,432 passed / 15 intentionally skipped, followed by all 86 risk cases; existing dedicated database gates passed. API runtime source and the generated tenant inventory are unchanged; protected CI retained the original inventory generator.
- Admin: lint/type/build, all 65 browser/accessibility cases, direct-host SSR/cookie isolation and actual local TLS 1.3 host/cookie lifecycle checks passed.
- Local: all 44 stable invariants, current release identity checks and `git diff --check` passed. Local Flutter bootstrap was not repeated; isolated protected CI supplied runtime validation.
- Native plugin/toolchain source is unchanged from the actual V4.94 APK/AAB acceptance. The correctly scoped Android base smoke job was skipped for this UI-only change; no new APK/AAB, published demo update, partner artifact or physical-device result is claimed.

Continue with accepted Services commercial policies, independent user/device/onboarding/accountant/AI acceptance and actual V5 TEST/partner evidence in #1380. Fix newly demonstrated authorized defects with focused regressions; do not invent commercial terms or field results to close the remaining backlog. Staging/main, the published V4.91.5 demo, productionization and iOS remain unchanged in this cycle.
