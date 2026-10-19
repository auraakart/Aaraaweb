# Guard Parcel Desk: accessible identity and actions

Date: 2026-10-19
Baseline: `develop` `722db6de00a9c6d68d23a5cf6129f1c6bd64664b`, after Guard shift-header #1470 was merged.

## Source-level problem
A rigid parcel-card header puts an overdue Chip beside the resident's name, unit and courier, squeezing essential parcel identification at 320dp and 200% system text. Two equal-width Remind/Return buttons also share one row, reducing label space. The source and guards already implement resident pickup-code verification; this slice does not change that authority.

## Narrow UI change
- At text scale above 130%, keep parcel identity full-width, move overdue status below the identity, and stack Remind/Return across the full width.
- Keep the default compact operational row and established actions at normal text sizes.
- Use the same Verify pickup action; give the label an Expanded area so it can wrap at large text sizes.
- Preserve the disabled Remind action for non-overdue parcels, loading-state disablement and all existing return/verification/API callbacks.
- Add 320dp/200% light/dark x overdue/non-overdue widget cases, checking full identity/tracking, action width, enabled state, pickup dialog and no layout exceptions.

## Gates and acceptance limits
Require protected Flutter format/analyze, changed Guard tests, broad Guard regression and merge gates before `develop` integration. No API, role, tenancy, permission, pickup-code verification, handover, state, theme color or cross-app changes. No staging/main or APK changes. Physical-device TalkBack, native translations, visual review and real security-operator acceptance remain pending.
