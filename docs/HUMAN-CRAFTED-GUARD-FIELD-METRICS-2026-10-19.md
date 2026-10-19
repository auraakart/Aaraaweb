# Guard Field Operations metrics: large-text and TalkBack-ready counts

Date: 2026-10-19
Source checkpoint: `develop` `e58ee15069ee1be95178a63e09f9b54f14db77a3` after merged Watchlist/Incident card #1481.

## Verified outstanding issue
The Field Operations overview summarizes Overstays, Watchlist, Open passes, Incidents and Checkpoints as five fixed-width (128dp) label/count columns. At 320dp with 200% system text, long labels compete with numbers and columns become overly narrow. The label and value also lack an explicit combined screen-reader announcement. The AppBar refresh icon does not declare an accessible tooltip.

## Targeted code changes
- Extract a bounded `GuardFieldMetric` presentation widget; retain 128dp columns and current colors/type hierarchy at ordinary text scaling.
- At >130% system text, make each count occupy the available summary width with the name and number separated for legibility.
- Give each metric one semantic announcement of the original label and current value. Do not change summary API keys, count calculations or fallback values.
- Provide the refresh icon a plain-English accessibility tooltip. Do not change its busy behavior, loading path or network calls.
- Add 8 widget cases across light/dark, 390dp/100% versus 320dp/200% and zero/nonzero counts including semantic and layout checks.

## Constraints and validation
Keep the existing theme, all callbacks, data and role permissions. Require changed Guard tests, Flutter analyzer, risk-weighted Guard regression/coverage, full Flutter suite and all mandatory PR gates before merge to `develop`. Device TalkBack, localization and physical-user acceptance remain unverified; no staging/main or APK change.

## CI failure and fix (PR #1482)
The initial Guard metrics test suite failed 8/8 cases with `A SemanticsHandle was active at the end of the test`. The tests called `tester.ensureSemantics()` and registered `semantics.dispose` with `addTearDown`, but Flutter's end-of-test semantic-handle verification occurs before that teardown. Dispose the handle explicitly at the end of each test body, immediately after the assertions. The resulting coverage-artifact failure is secondary to the aborted test step; no product implementation, visual styling or test assertions were changed. Require a completely green new CI run on the corrected PR head before merging.
