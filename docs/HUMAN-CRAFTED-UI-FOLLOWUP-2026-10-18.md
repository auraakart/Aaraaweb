# Human-crafted UX follow-up — Resident requests

Baseline: `develop` as of 2026-10-18. This is an incremental follow-up to [the existing human-crafted UI review](HUMAN-CRAFTED-UI-REFINEMENT.md), not a new theme or rewrite.

## Observed source-level friction

- The resident certificate/permission request route uses a heavier one-off heading instead of the established `PremiumPageIntro`.
- The submit button uses all caps and replaces its action name with a generic in-progress word.
- Existing request rows combine status and description into a subtitle clamped to three lines. This can conceal details that residents entered for society review.
- Request type choices need room to expand on compact screens at large text sizes.

## Scoped implementation

- Reuse `PremiumPageIntro`, the current Material 3 theme typography, and `PremiumActionLabel`.
- Keep the actual submit callback, validation, idempotency key, five request types, Helpdesk repository contract, and society authority wording unchanged.
- Give status its own accessible label; show complete request descriptions without a fixed line cap. Group records on one restrained surface with separators rather than extra nested cards.
- Expand the request-type field to its available horizontal space.
- Add compact 320px / 200% text regression fixtures in both existing light and dark themes; record screen captures when CI runs.

## Validation boundary

Repository/theme/navigation/permissions/payment/backend definitions are not edited in this slice. Targeted widget validation and CI are required before integration. Screenshots in automated fixtures do not establish physical-device TalkBack, multilingual, or independent user acceptance. Whole-product 9/10 certification remains open.
