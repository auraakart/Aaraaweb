# Guard Parcel Intake: large-type identity and action safety

Date: 2026-10-19
Base: `develop` `ca0568cb509d828b187d8444f5d3d8dadb2fb23f`, after Parcel Desk card refinement #1471.

## Observed source-level issue
The Parcel Desk's completed large-text card work does not cover its Receive Parcel form. At 320dp and 200% text, its selected resident/unit is shown only as an ellipsized dropdown entry, which can conceal the full destination. The long Receive & notify resident icon-button label shares a rigid horizontal layout and may wrap poorly on compact devices.

## Scoped fix
- At text scales >130%, repeat the currently selected recipient/unit as complete, untruncated supporting text below the existing selector. It responds to the same selected key and adds no duplicate selection control or data access.
- Use a wrapping label with a full-width action surface at large text sizes; preserve the original familiar icon button on standard text sizes.
- Preserve all recipients, selectors, courier/tracking/notes values, submit callback, guard authorization/API contract, safety handling, and existing light/dark teal palettes.
- Add 390dp/100% and 320dp/200% light/dark widget tests. Assert long destination readability, no layout exception, and unchanged payload recipient identity after submit.

## Acceptance boundary
Protected Flutter format/analyze, changed Guard tests, broad Guard regression and required merge gates must pass prior to integration. No guard payment, gate entry/exit, parcel handover or server mutation contract changes. No staging/main/APK changes. Real device/translated font/TalkBack and operator acceptance remain unverified by widget tests.
