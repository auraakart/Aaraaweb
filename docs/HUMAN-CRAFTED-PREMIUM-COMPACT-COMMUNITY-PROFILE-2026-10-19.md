# Premium Compact UI — Community and Profile continuation

Date: 2026-10-19
Baseline: develop `d484ca98a4f6d7ee13148c2a9b3649235498ba0b`, after the merged Home, Gate, Staff, Billing, Helpdesk and Services compact slices (#1463–#1466).

## Scoped change
- Community: at default text sizes (<=115%), use 16dp outer gutters, 8–16dp inter-section gaps and 12dp/8dp row content padding; retain all shortcuts, announcements, meetings, governance references, documents, polls, resident requests and property-scoped Helpdesk display.
- Profile: match 16dp page gutters, restrained section separation and compact list padding at default type sizes; preserve current household identity, ownership-based permissions, family/vehicle/contact routes, selected-property switching, notifications, easy mode, privacy and sign-out confirmation.
- Above 115% text scale, retain the current spacious design, 20dp page gutters, existing wrapping and touch-target sizes. Shared theme tokens, app navigation, global component behavior and business contracts are unchanged.

## Verification and boundaries
- Extend the existing Resident light/dark 390dp, 320dp/200%, and 840dp craft capture matrix to check Community/Profile gutter rules and entry points.
- Require Flutter analyzer, changed widget tests, risk-weighted Resident regression, full Resident tests and protected GitHub gates before develop integration.
- No API, schema, authentication, role, payment, notification, Guard or Admin changes; no staging/main commits or APK publication.
- At 320dp/200% verify all shortcut labels and the property picker with real-device TalkBack/translated fonts before declaring acceptance. Existing widget captures are not equivalent to physical-device, usability or multilingual certification.
- Whitespace reduction is an unmeasured design target until side-by-side actual screenshots have been reviewed.
