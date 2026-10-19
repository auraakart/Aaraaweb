# Guard Field Operations: incident reporting form clarity and safety

Date: 2026-10-19
Baseline: `develop` `e1ca56174a8fca3f3c79587326ca396e1441bc30`, after merged Guard gate-pass form PR #1478.

## Findings from live source
The Report incident modal currently presents an enabled REPORT button even when Category or Title is empty. Tapping it silently does nothing. Guard staff cannot see which fields are required, and the Severity selection should retain its complete labels when text is enlarged.

## Changes
- Extract the existing modal into `GuardFieldIncidentDialog`, matching the adjacent established Guard gate-pass form pattern.
- Disable REPORT until the existing mandatory Category and Title fields have non-whitespace values. Show Required helper text on both labels.
- Retain LOW, MEDIUM, HIGH, CRITICAL; default MEDIUM; one-per-line evidence references; optional details; original trimmed payload; cancellation; existing authorization and backend createIncident callback.
- Add 6 Guard widget cases: light/dark × 100%/200% text at 390dp/320dp, exact submitted payload, severity/evidence preservation and cancel path.
- Preserve the Aaraagate guard theme, action words, routing, request model and feature semantics.

## CI and acceptance boundary
Require changed Guard widget tests, Flutter analysis, risk-weighted regression/coverage, full Guard tests and all mandatory PR merge gates before `develop`. Automated tests do not establish physical Android, multilingual, or TalkBack acceptance. Do not change staging/main or the demo APK.
