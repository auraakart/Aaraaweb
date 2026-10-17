# V4.94 — coordinated dependency migrations

Authorized by the owner's 17 October instruction to diagnose the pause and resume remaining work. Baseline develop: `433da1912d1b2dfae16b4d2ee21a9a89915a4f9f`. Develop only; root/API/Admin `4.94.0`, Resident/Guard `4.94.0+49400`.

## Root cause and continuation correction

V4.93 had already merged successfully; no runtime implementation or protected workflow was stuck. Its bounded three-slice stop condition ended the previous turn while four actionable dependency proposals were left deferred. The broader owner instruction authorized continued repository work. Treating that scope boundary as the endpoint caused the pause; the missing attached image is separate from this repository work.

Previously demonstrated technical delays were stale source assertions: a literal ESLint 10.11.0 requirement and a sharp snapshot tied to Node 20 types. V4.93 fixed both and added negative security/compatibility cases. V4.94 preserves those controls and updates the version-aware Next configuration check for the actual framework migration.

Resume from the canonical branch and existing open PRs. Execute the three migrations below sequentially, publish one coordinated implementation candidate, inspect the exact protected run and fix only demonstrated failures. Do not end at a documentation-only milestone while actionable authorized code remains. Do not repeatedly bootstrap local Flutter/browser dependencies; required isolated CI is the authoritative runtime/build validation. After merge, close superseded proposals and record actual remaining external/policy dependencies. A future session resumes from this ledger; no background execution after a turn is implied.

## Migration sequence

| Slice | Implementation | Required evidence |
| --- | --- | --- |
| V4.94.1 Firebase Admin | Pin Firebase Admin 14.5.0 on the supported Node 22 runtime. Existing modular `firebase-admin/app` and `/messaging` imports and token-based `sendEachForMulticast` remain. Add sender boundary tests for recipient-scoped lookup, partial invalid/transient failures, consumer isolation and transport failure propagation. Supersedes #1074 after validation. | API lint/type/build, sender/outbox regressions, risk and dependency gates. No real Firebase delivery/provider certification is inferred. |
| V4.94.2 Next/React cohort | Upgrade Next 16.4.0, React/React DOM 19.3.0 and both React type packages together. Remove the obsolete Next ESLint option while retaining required standalone lint. Keep the existing Webpack compiler explicitly for build/dev and real host-SSR tests; preserve the reviewed middleware host/origin boundary and existing awaited request APIs. Supersedes isolated #1071/#1076 after validation. | React/type compatibility negatives, Admin lint/type/build and browser suite, actual host/cookie/SSR/TLS regressions. No untested middleware-runtime or caching redesign. |
| V4.94.3 Native sharing | Pin share_plus 13.3.1 with its Dart 3.10 minimum; use `SharePlus.instance.share(ShareParams(...))` for visitor passes and authorized privacy exports. Exercise both screen actions through the real plugin's mocked platform channel. Verify generated AGP/Kotlin/Gradle minimums before native builds, including positive Kotlin/Groovy fixtures and fail-closed old/unknown versions. Supersedes #1075 after validation. | Full Resident/Guard tests and real base TEST APK/AAB builds with archive/package/SDK/ABI/signer and cross-role checks. Physical target-app sharing, partner artifacts and iOS acceptance remain separate. |

Use pnpm 10.15.0 to generate the lock, retaining security overrides. Do not hand-edit lock resolutions or relax security thresholds. Package/test-only API changes do not require a new inventory digest; the original generator remains enforced in protected CI.

## References and remaining boundaries

- [Firebase Node release notes](https://firebase.google.com/support/release-notes/admin/node): version 14 requires Node 22+ and modular entry points; token multicast remains supported. Existing code already uses those entry points.
- [Next 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16): request APIs must be awaited, React/types move together, the Next `eslint` option is removed and `--webpack` preserves that supported compiler path.
- [Exact share_plus 13.3.1 requirements and migration](https://pub.dev/packages/share_plus/versions/13.3.1): Flutter 3.38.1+, Dart 3.10+, Java 17, Kotlin 2.2.0, AGP 8.12.1+ and Gradle 8.13+. Existing isolated native workflow pins Flutter 3.47.0 and Java 17; generated tool versions must meet the checked minimums.

The [V4.93 consolidated backlog](AARAAGATE-V4.93-COMPLETION-FOLLOW-THROUGH.md) retains the Services 4.5 commercial decision register, independent accountant/user/device/AI review and actual external V5 TEST/partner evidence in #1380. These inputs cannot be supplied by a dependency upgrade. Staging/main and the published demo remain unchanged in this scope; productionization and iOS remain excluded.

## Execution ledger

Status: MERGED_PROTECTED_CI_PASSED; all three repository migrations are complete on develop. No dependency proposal from the four-item queue remains outstanding. Independent acceptance and policy-dependent functionality remain open as explicitly recorded above.

- Implementation [PR #1419](https://github.com/auraakart/Aaraaweb/pull/1419), validated PR head `c16b110c8f33984d7ab6cc21af92407777bed3f7`.
- Develop merge: `d295e1457e6042b22e61bc1178839ba725dac80f` (tree `7e82f45cf4664bf90ed4a88106ced9faa8093b3d`).
- Protected [CI 39021516424](https://github.com/auraakart/Aaraaweb/actions/runs/39021516424) passed Repository structure, Mastermind preflight, full API/Admin/Resident/Guard, dependency security, actual native artifact matrix and Required merge gates before normal develop auto-merge.
- API broad phase: 2,432 passed / 15 intentionally skipped, then all 86 risk cases; existing dedicated database gates also passed. All four new Firebase sender contract cases passed. Skipped broad cases are not counted as executed field/accountant acceptance.
- Admin: lint/type/build, all 65 browser/accessibility cases, real direct-host SSR/cookie isolation and the local TLS 1.3 host/cookie lifecycle regressions passed on Next 16/React 19 using the explicit supported Webpack path.
- Flutter: corrected visitor-pass and authorized privacy-export channel tests, full Resident/Guard behavioural suites and risk coverage gates passed. The privacy regression now waits for settled layout and asserts a hit-testable button before tapping; payload assertions are retained.
- Native: real Resident and Guard debug APKs and AABs passed build, SDK/package/ABI/archive and signer inspection; cross-role metadata comparison passed. GitHub's standard PR merge checkout was `ed232461e5a42d2fc06e5171f159fbe89c4317a1`, distinct from the PR head and later develop merge. Resident APK SHA-256 `94a126a30812372b9d2e797ddd1f22e1f9e9ac7c2169319da7e4b05f767dd1e5`; Guard APK SHA-256 `0362febd241df0044d14f3cedcd42fb605957bf0f8d5a02774d80470c692c42f`. These are base TEST artifacts, not published demo updates or independently attested Partner A/B builds.
- Focused validation: all 44 stable invariants and 35 dependency/native/security-fixture cases passed. UUID chain removal and patched versions pass; unpatched/older UUID versions fail. Generated native minimum/newer toolchains pass; old AGP/Kotlin/Gradle and unknown versions fail. Security overrides and the zero moderate/high/critical audit budget remain enforced.
- CI corrections stayed narrow: the obsolete UUID-presence assertion was replaced with an unsafe-version check; the new privacy test's off-screen tap was corrected. No application gate or failed assertion was suppressed. Final exact-head CI recomputed the unchanged API tenant inventory with the original generator.
- Superseded proposals CLOSED after the protected merge: [#1071](https://github.com/auraakart/Aaraaweb/pull/1071), [#1074](https://github.com/auraakart/Aaraaweb/pull/1074), [#1075](https://github.com/auraakart/Aaraaweb/pull/1075), [#1076](https://github.com/auraakart/Aaraaweb/pull/1076).

Next actual dependencies are the accepted Services commercial policies, independent accountant/user/device/AI acceptance and external V5 TEST/partner evidence in #1380. Those are not represented as completed by these code changes. Staging/main and the published V4.91.5 demo are unchanged. No productionization or iOS launch is included.
