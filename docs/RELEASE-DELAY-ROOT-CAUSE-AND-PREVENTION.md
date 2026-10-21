# Release delay: root cause and prevention

The V4.87.0 application code passed full regression and is retained. This repair changes release tooling and CI scheduling, not application behaviour or the independent main approval requirement.

## V5.7 validation delay — 2026-10-21

Resume checkpoint: V5.7 software was already merged to develop in PR [#1512](https://github.com/auraakart/Aaraaweb/pull/1512), with acceptance evidence in [#1513](https://github.com/auraakart/Aaraaweb/pull/1513), develop `615fa505aa546578d4299cce60b4750a53df622e`. Resume from that checkpoint; do not restart feature implementation or promote staging/main. Productionization and physical-device acceptance remain on hold.

The avoidable delay came from publishing before all targeted checks had completed. Three distinct validation misses caused successive CI cycles; the final software run [39595127560](https://github.com/auraakart/Aaraaweb/actions/runs/39595127560) passed all required gates. The current attachment copy also opens successfully; the earlier missing scratch-path error is not reproduced and is separate from the CI failures below.

| Confirmed cause | Evidence | Prevention |
| --- | --- | --- |
| Local source-contract check was incomplete | [Run 39594272645](https://github.com/auraakart/Aaraaweb/actions/runs/39594272645), job 119202592303: V4.58 expected English reopen labels inside the screen after they had moved into the translation map. | The translation-aware checks are already fixed. Local full preflight now runs the stable source contracts before dependency installation. |
| New Dart test reached CI with a syntax error | [Run 39594552329](https://github.com/auraakart/Aaraaweb/actions/runs/39594552329), job 119203782089: an extra closing parenthesis in `v57_product_workflows_test.dart` produced three analyzer errors. The local environment had no Flutter SDK. | Local full preflight reports missing Flutter/Dart tools before dependency work, never claiming a pass. With the SDK available, changed Dart files are parsed without rewriting before API installation. Existing CI analysis and changed-widget tests remain required. |
| New browser test failed during the full suite | Same run, job 119203782071: `getByText('AGR-53AA5CE7')` matched the receipt and its Inspect button; the suite completed with 211 passing and one failed test after two minutes. | Exact locators are already fixed. Changed Admin specs now run first with stop-on-first-failure, followed by the complete browser suite. Admin typecheck also runs before the access/SSR/browser suites. |

Both preflight modes check changed JavaScript syntax, including browser specs outside `scripts/`. CI structural preflight remains lightweight and does not install pnpm/Flutter or repeat complete suites. The Admin checkout includes the PR merge and both parents for exact base/head selection. Changed-spec selection handles additions, edits, copies and renames; ignores deletions/other apps; escapes literal filenames; and propagates nonzero test exits. Missing refs or expected test files fail closed. Empty selection does not replace full regression.

Regression evidence: `node --test scripts/release-delay-controls.test.mjs` passes 27 tests, including missing-toolchain, parse/contract failure before installation, literal changed-spec selection, failure propagation and two-parent shallow-checkout cases. The pinned Playwright CLI also resolves the escaped financial-spec filter with `--list`. No application, database, permission, coverage-floor or production configuration change is part of this repair. Required protected CI remains the merge criterion; no reduction in total validation runtime is claimed without measured evidence.

## Historical V4.87 interrupted cycle

| Cause | Evidence | Correction |
|---|---|---|
| Duplicate serial preflight | Final CI run 37791487218: preflight ran 14:20:58–14:22:52 UTC (114 seconds); API/Admin/Flutter full jobs could start only afterwards, repeating installation, analysis and behavioural checks. The run took 6m36s overall. | CI uses structural preflight without pnpm/Flutter installation. Canonical full jobs retain analysis, full tests, risk coverage, browser/axe and dependency gates. Local full preflight remains available. |
| Missing main ancestry | Initial staging promotion #1134 had the correct develop tree but omitted main commit aa9416ce. Main #1135 showed `behind`, requiring history-only #1136 and another validation cycle. | Candidate helper includes current staging, develop and main parents while preserving the exact develop tree, and verifies ancestry before publication. |
| Main opened before final staging head | #1135 initially targeted staging 4bec5f47; history reconciliation changed it to ed2b9c03. Bot-triggered synchronize runs paused with `action_required`. Operator reopen started valid runs, repeating the cycle. | Main helper verifies the current merged staging promotion and both successful exact-candidate smoke workflows, checks branch stability, then opens/reuses the PR. Only confirmed latest `action_required` runs at that head are refreshed through the release operator. |
| Unconditional Linux dependency installation | Repair CI run 37803356940: Admin browser setup ran 15:46:13–15:49:57 UTC (224 seconds). Ubuntu package downloads consumed most of the step; the actual browser downloads took about five seconds. | Download the pinned Chromium, verify a real headless launch, and install Linux dependencies only if that launch fails. Verify launch again after fallback; the 28 browser/axe tests remain required. |
| Late feedback on new widgets | Discovery tests assumed results were visible without scrolling; a new 200%/keyboard circle test exposed an inaccessible action. These failed only during the broad Resident suite. | Changed/added Flutter tests run first in the canonical Flutter job. Full widget regression and coverage still run afterwards. |

Evidence: https://github.com/auraakart/Aaraaweb/actions/runs/37791487218 and PRs #1133–#1136. Waiting for independent review is a release gate, distinct from implementation and CI delay.

## Canonical sequence

1. Complete source changes and local relevant checks. Do not publish intermediate UI/test edits as separate promotion cycles.
2. Allow protected develop CI and integration to finish.
3. Run `scripts/prepare-staging-candidate.sh <version> [release/v<version>-<attempt>-staging-candidate]`. It fetches the current three branch heads, creates a local candidate with the exact develop tree and all release ancestry, and prints the commit/branch references. It does not modify the checkout or push protected branches.
4. Run `scripts/publish-staging-candidate.sh <version> [branch]` through the release operator. It temporarily closes an existing staging-to-main review before staging changes, pushes the prepared candidate without force, and opens/reuses the protected staging PR. API smoke and PostgreSQL backup/restore must succeed before staging merges.
5. Run `scripts/open-main-release-pr.sh <version>` through the release operator. It fails closed for missing main ancestry, incomplete/failed/wrong-commit evidence, non-equivalent trees or a moving staging baseline. It requests the established independent reviewer and never approves or merges main.
6. The main helper reopens the suspended, unmerged main PR when present, preserving its identity. Main-specific required checks and independent approval remain authoritative; the demo APK is generated after the approved main merge.

`PREFLIGHT_MODE=structural` is reserved for the CI structural gate. The default `scripts/mastermind-preflight.sh` still performs the optional local full preflight. Unknown modes fail closed.

## Regression protection

`node --test scripts/release-delay-controls.test.mjs` runs in required Repository structure validation. Real temporary Git repositories exercise candidate ancestry, tree equivalence and idempotency. Fixtures reject stale, unmerged, forked, wrong-workflow/commit, pending/failed/retried and missing smoke evidence, including branch movement during verification. Shell tests ensure structural preflight cannot invoke heavyweight tools and changed Flutter selection stays within the requested app. Browser setup tests exercise ready-runner, missing-dependency recovery and permanent launch failure. Existing protected-gate orchestration, cancellation and main-review-routing contracts remain active.

No approval is bypassed and no successful test is fabricated. Physical-device microphone and TalkBack acceptance remain pending in the V4.87.0 experience checklist. External runner queues and reviewer response time are not controlled by these scripts; the fixes remove the avoidable orchestration causes identified above.
