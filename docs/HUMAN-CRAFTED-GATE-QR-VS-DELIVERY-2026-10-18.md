# Aaraagate Gate: Visitor QR vs Delivery Approval Clarity

Updated: 2026-10-18

## Why this change exists

A resident often does not know a delivery rider's telephone number. The previous prominent action, “Invite guest,” could suggest that every delivery required a pre-shared visitor QR credential.

## Actual existing flows (unchanged)

- **Known visitor:** resident creates a visitor pass, optionally enters a phone number, and shares the secure visitor credential/QR; security scans/verifies it.
- **Unknown delivery or cab:** the guard selects Delivery or Cab, chooses the destination flat, and requests resident approval; the phone number is optional. A resident approves or denies the Gate request and the guard checks in only after approval.
- No automatic delivery admission, visitor credential sharing to unknown riders, backend change, tenancy change, API change, or change in gate authorization policy has been made.

## UI refinements

- Resident Gate header explicitly says “Create visitor QR pass,” retaining its existing visitor-pass route and native sharing behavior.
- Resident Gate shows a quiet, readable clarification: “No QR needed for deliveries. Security will request your approval when the rider arrives.”
- Both strings are present in the eight current high-frequency Gate localizations (en, hi, ta, te, kn, ml, mr, bn); the visitor CTA permits wrapping at compact accessibility sizes.

## Verification

- Updated existing English visitor-pass creation, QR and share regression tests to use the new action label; delivery guidance is asserted.
- Extended the 320px, 200% text-scale, light/dark, eight-locale Gate widget matrix to assert the delivery guidance without assuming offscreen list children exist.
- Existing localization completeness tests cover all eight new keys.
- CI Flutter validation must pass before merging into develop. No real physical Android or live screen-reader/native speaker validation is claimed by widget tests.

## Follow-on, explicitly not part of this slice

An optional “Expecting a delivery” heads-up should be scoped as a separate feature with explicit data retention, a no-auto-approval rule, and tested Resident/Guard/API contracts. It is not necessary for the existing guard-initiated arrival flow.
