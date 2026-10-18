# Human-crafted Gate visitor-pass and cancellation refinement — 2026-10-18

Baseline: `develop` `e073858ebd4fa171cd6ee080ef8cb06e8c92a794`. This continues the completed household and Helpdesk UI slices without altering brand tokens, navigation, security or API contracts.

## Observed friction

- The Gate cancellation confirmation used an unscrollable dialog content column for explanatory copy and validity information, risking poor fit with large accessibility text on compact phones.
- The visitor-pass QR remained 210 logical pixels at all phone widths, and pass presentation used extra-heavy one-off typography that competed with the actual scannable credential.
- The pass sheet used fixed bottom padding without accounting for keyboard or safe-area insets.

## Minimal implementation

- Make cancellation explanatory content scroll within the existing Material dialog; preserve both confirmation actions and backend cancellation rules.
- On compact phones below 360 logical pixels, use a 180px QR while leaving the standard 210px scanner-friendly layout unchanged; retain a white contrast surface in both themes.
- Use existing app typography, spacing and corner tokens for the pass; keep QR data, share message, selectable credential, copy action and expiration disclosure unchanged.
- Test compact 320px/200% cancellation and visitor pass, including explicit negative assertion that cancellation never occurs when a dialog is dismissed.

## Quality boundary

The tests verify widget layouts and gate interaction invariants. Actual device scanning, TalkBack, multilingual and user experience review remain outstanding. There are no changes to theme colours, credential generation, approval authorization, route navigation, dependencies, main or staging.
