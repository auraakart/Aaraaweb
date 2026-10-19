# Guard Field Operations: material and move passes at large text

Date: 2026-10-19
Baseline: `develop` `659f345747f41f5893bcd2a0a5e0d9f0b85795ca`; Guard overstay and patrol action-card PR #1476 is already merged.

## Source finding
The remaining Material & move passes section uses a single horizontal ListTile with a long reference/type, subject/items, and PROCESS button (or status). At 320dp and 200% text scaling, this can compete for width and obscure information used by the security operator.

## Scoped UI refinement
- Extract a small presentational GuardFieldPassCard, preserving the normal-text ListTile hierarchy.
- With text scale greater than 130%, show the complete reference/type and subject/items above a full-width PROCESS button, or the existing processed-state label.
- Preserve OPEN-only processing, the original FilledButton, busy-disabled state, existing API callback and identifier, first-30 display limit, reference/status labels, color tokens, and all authorization.
- Nine Guard widget tests cover light/dark, normal/200% text, open/processed states, action reachability and disabled state.

## Evidence boundaries
Require changed-test gates, Flutter analysis and full Guard regression, risk-weighted coverage, and protected branch merge gates before `develop` integration. Human Android, TalkBack, localization and operator acceptance are not established by automated UI tests. Staging/main remain untouched; no APK change.
