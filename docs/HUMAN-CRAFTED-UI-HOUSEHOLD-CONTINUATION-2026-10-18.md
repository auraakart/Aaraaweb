# Aaraagate human-crafted UI — household detail continuation

Source-of-truth: `develop` at d55c4c0fe42cef10d0a5e9fc8a80a8326b596cfc. This follows [the prior human-crafted refinements](HUMAN-CRAFTED-UI-REFINEMENT.md) and the [Resident Requests slice](HUMAN-CRAFTED-UI-FOLLOWUP-2026-10-18.md).

## Audited source issues

- The Emergency Contacts introduction repeated the same membership/occupancy disclaimer in a prominent nested surface.
- Contact identity, relationship, priority and removal were competing for one narrow horizontal row.
- Vehicle records repeated the icon-container/identity layout already available in `PremiumIdentityHeader`.
- Pending vehicle approval status was pinned beside the registration number, squeezing essential identification on compact layouts.
- Vehicle and contact type dropdowns did not claim the available form field width.
- The vehicle approval explanation was framed by an unnecessary nested card inside the registration dialog.

## Minimal refinement

- Reuse the existing `PremiumIdentityHeader` for contact and vehicle identity and approval status. Place status after the associated description instead of beside names and numbers.
- Keep remove controls as distinctly labeled accessible IconButtons.
- Consolidate the household-contact boundary text, leaving the actual membership/occupancy restriction clear.
- Leave approval, registration, removal, validation, pending lifecycle, fields and server authority unchanged.
- Allow the dropdown fields to use available width, and flatten the decorative approval explanation.
- Extend rendered light/dark visual tests at 320px/200% text and 390px/normal text, including a long name, vehicle details and pending approval.

## Acceptance

Requires green changed Resident widget tests, risk-weighted regression/coverage, Flutter analysis, complete Resident tests and required repository merge gates. Human/TalkBack/device/multilingual acceptance and product-wide 9/10 score remain open. No theme colors, dependencies, router, backend, authorization, data contracts, main or staging changes are part of this slice.
