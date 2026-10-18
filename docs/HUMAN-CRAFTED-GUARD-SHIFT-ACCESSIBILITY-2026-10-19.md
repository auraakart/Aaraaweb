# Guard shift header and gate selector accessibility

Date: 2026-10-19
Base: `develop` `3ed0c943ce59c0c1765c6e90b5140630e5922898` (after merged Guard Tools #1468 and Guard Quick Arrival #1469).

## Root-cause reconciliation
The previous continuation inspected Guard tools while its search-clear and status-row fixes were already being integrated. The next completed Quick Arrival PR also resolved the expanded selector. Avoid recreating those changes. The remaining unaddressed Guard Operations header keeps a fixed icon + label + status-pill row; this can squeeze long gate names and status labels at 320dp and 200% text.

## Change
- Stack the existing security-shift details and status pill when the system text scale exceeds 130%, or available card width is less than 250dp.
- Keep the established one-row operational scan hierarchy on wider normal-text screens.
- Use the existing localized shift and gate labels in the screen-reader summary. Preserve the current status-pill wording and semantic access status.
- Expand both active-gate dropdowns, retaining full gate values, route callbacks, and the same backend selection contract while rendering long names safely inside available width.
- Add four narrow light/dark, gate-selected/unselected widget cases asserting the full identity and both selector modes without layout exceptions.

## Safety and validation
No Gate permission, guard identity, society tenancy, offline sync, API, backend, brand tokens, theme, navigation, authorization or arrival/visitor flows are changed. Full Flutter/analyzer, targeted Guard tests, risk-weighted regression and repository merge gates are required before integration into `develop`. No staging/main commits or APK publication. Automated widget tests do not replace on-device TalkBack and multilingual operator acceptance.
