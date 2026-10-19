# Guard Tools — clear search and large-text status readability

Date: 2026-10-19
Baseline: develop `3dde813311b2f38ccb2b81c5e5e7a9ec52f3f749`

## Finding
- The unit directory search used uncontrolled TextField state. The X button changed the filter to empty but left the old search term visible. Guards could see a stale filter while viewing unfiltered units.
- The operations overview places long offline/review status values beside labels in a fixed horizontal row. At 200% text, this constrains essential decision context during gate operation.

## Scope
- Own and dispose the unit search TextEditingController; clear the field and active filter together using a visible, localized clear control in all eight existing Guard languages.
- At large text sizes (>130%) stack each operations label and its actual value; normal-size operational rows remain side-by-side.
- Preserve Gate role, language selection, voice cues, offline queue values, retry action, unit access scope and all navigation/action handlers.
- Add search-clear behavior in the existing Hindi-language unit directory test and light/dark 320dp/200% layout regressions.

## Validation boundary
Require Flutter analyze, Guard changed test/risk regression/full suite and branch CI green before develop merge. Physical device, native speaker and accessibility service acceptance remain separately outstanding. Staging/main and demo APK are untouched. No API, DB, authorization, offline replay logic, notifications or global theme changes.

## First CI correction
The first changed-Guard test run detected a real 320dp/200% RenderFlex overflow in the existing bilingual language selector. Keep all eight bilingual **menu options** but display a concise native-language selected value with `isExpanded: true`; the selected code and onChanged handler remain unchanged. The same run's status headings were below the initial viewport, so the test now explicitly scrolls to the status content before making visible-widget assertions. Do not suppress the overflow or downgrade layout exceptions. Revalidate on the new exact PR head; the first run is not a pass.
