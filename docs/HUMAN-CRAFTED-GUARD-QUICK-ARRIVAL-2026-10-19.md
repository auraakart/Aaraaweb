# Guard Quick Arrival — accessible selector and destination

Date: 2026-10-19
Baseline: develop `aa58550b6ff5aa177793cbe8f1d12f965f2b35ff` after Guard Tools PR #1468.

## Source finding and scope
- Quick Arrival uses icon-and-text delivery/cab segments and a selected-destination close icon without a descriptive tooltip. These are hard to distinguish at accessibility font sizes and for non-visual operation.
- At text scaling above 130%, show concise text-only delivery and cab segments without an extra selection glyph; preserve both choices, state transitions and existing provider/name reset rules.
- Give the selected unit's existing clear-selection action the accessible label 'Change destination'. Do not alter its reset behavior or unit permission scope.
- Add a light/dark 320dp/200% test for selector size, switching to Cab, selecting a unit and changing destination without layout exceptions.

## Unchanged
Authentication, society isolation, gate approval, offline queue/retry, recent-arrival storage, voice parser, provider selection and request payloads. No shared brand tokens, API, DB, production/staging/main or APK changes.

## Acceptance
Require changed Guard tests, Flutter analysis, risk regression, complete Guard suite and protected develop CI before merge. Physical device, TalkBack and multilingual/native-speaker acceptance remain unverified separately.
