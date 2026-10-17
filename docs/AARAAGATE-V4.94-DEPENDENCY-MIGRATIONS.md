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

Status: IN_PROGRESS. Three migrations implemented locally; focused/native fixture results and protected milestone results must be recorded before claiming closure. Open dependency proposals remain open until their actual replacements pass and merge. Next action: finish generated lock review, run focused checks, open the consolidated develop candidate and finish protected API/Admin/Flutter/native gates.
