# V4.89.14 — Consent-safe Assistant experience (phase 1)

## Implemented
- Daily summary **shortcut** appears only after explicit opt-in using secure device storage for one boolean. It performs no background check, push notification or transcript recording. Disabling removes it immediately; storage errors revert consent.
- Residents can mark an answer Helpful/Not helpful during the current screen session. No rating, prompt or answer is sent or persisted automatically. Negative feedback can open the existing Helpdesk for a voluntary, reviewed report.
- Regression tests check default-off and opt-in/out preference behavior, no unsolicited Assistant requests, feedback privacy and explicit Helpdesk navigation.

## Not yet delivered
Scheduled reminders, OS notification permission, background monitoring, persisted feedback analytics and server-side retention workflows require a separate consent/retention and notification design. The on-demand shortcut is **not** a push reminder. No physical-device/provider/production readiness is claimed.
