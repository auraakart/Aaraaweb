# Guard Field Operations: shift handover required summary

Date: 2026-10-19
Baseline: `develop` `829b0961ab344f1abd67f7c2a065563aa1c120ef`, after verified green incident reporting #1479.

## Source issue
The existing Shift handover modal renders HAND OVER as apparently enabled with an empty summary or a summary shorter than three trimmed characters. Tapping it silently returns without submission; it does not explain why to a guard finishing a shift.

## Targeted fix
- Extract the existing modal as `GuardFieldHandoverDialog`, consistent with the adjacent incident and gate-pass form components.
- Preserve the pre-existing trimmed summary length >=3 business rule; visibly disable HAND OVER until valid.
- Provide helper text for the minimum summary requirement.
- Preserve up to five visible lines for open items and the existing newline splitting/trimming/filtering; cancel returns null.
- Keep the original createShiftHandover authorization, gateId, callback, data payload, existing colors and refresh flow unchanged.
- Add six tests including light/dark, 320dp/200% and 390dp/default, exact openItems values, whitespace rejection and cancellation.

## Quality and release constraints
Require full protected source invariants, Flutter analyzer, changed widget tests, guard behavioral regression and coverage, full Guard test suite, mandatory merge checks before integrate into `develop`. Human device, screen-reader and multilingual testing remain separate. No staging/main or demo APK changes.
