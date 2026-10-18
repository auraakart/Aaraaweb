# Aaraagate human-crafted billing action feedback — 2026-10-18

Base `develop`: `f3b83e0d46017642c9ed00853db841678809aff5`.

## Observed gap
Billing had two payment entry actions: a summary shortcut and an invoice action. Both replaced their action names with “Preparing payment…” during order creation. This loses the user's original decision context under large text and differs from the existing `PremiumActionLabel` convention for progress and screen readers.

## Minimal UX fix
- Keep “Pay next due” / “Pay overdue bill” and “Pay securely” visible throughout in-flight preparation.
- Reuse the existing `PremiumActionLabel` progress indication and semantic busy state on both existing `FilledButton` controls; retain disabled state on the corresponding active invoice.
- Verify both entry labels, spinner flags, disabled controls and exactly one attempted order while a fake repository holds the request in flight at 320px/200% text in both light/dark.
- Validate receipt/gateway pending semantics and existing idempotency through unchanged tests.

No modifications to gateway payloads, checkout idempotency keys, access policy, tenancy, financial calculations, theme colours or billing routes. Full physical-device screen-reader acceptance and independent 9/10 review remain open.
