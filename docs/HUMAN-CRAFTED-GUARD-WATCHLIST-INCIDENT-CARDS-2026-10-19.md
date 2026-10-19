# Guard Field Operations Watchlist and Incident information cards

Date: 2026-10-19
Baseline: `develop` `b91f53668883523cdc6e6a95d07a644f24512ec0` after merged incident and handover forms #1479–#1480.

## Actual cause of remaining layout risk
The Guard Field Operations screen uses one read-only `_tile` helper for Watchlist and Incidents. Both place an icon, possibly long identity/severity and status/reason inside a compact ListTile. At 320dp and 200% text, a leading icon reduces the width available for long identifiers and operational details.

## Narrow presentation remediation
- Extract `GuardFieldInfoCard` while keeping the caller's exact title, subtitle, icon mapping and existing data semantics.
- At normal text sizes, retain the original ListTile, bold title, trailing-free read-only layout.
- At >130% system text, put title beside the icon and the full explanatory subtitle on its own line.
- Add eight widget tests covering Watchlist/Incident, light/dark theme and 390dp/100% vs 320dp/200% text.
- No API, gate authorization, action callback, watchlist determination, status classification or brand-color changes.

## Evidence boundary
Protected Flutter analyzer, changed Guard tests, risk-weighted Guard tests, full Guard regression and all mandatory merge gates must pass before merging into `develop`. Physical-device, localization and TalkBack acceptance still require separate verification. No staging/main/APK changes.

## Delay prevention
Recover from live GitHub `develop` HEAD and the latest merged PR before editing. An interrupted chat response must not be treated as evidence of an interrupted GitHub CI/merge workflow.
