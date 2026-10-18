# Aaraagate Admin — dark-preview surface audit (2026-10-18)

Baseline: `develop` `dbdc9fccd7a80a221ef8764cfbf6a46ad5d8a8b5`.

## Finding
Shared Admin UI components already render through semantic tokens, but the legacy shell/sidebar, queue rows, navigation drawer and standalone property workspaces still force light white or near-white backgrounds. This prevents reliable admin dark-theme coverage and generates mismatched sections if dark palette variables are tested.

## Safe, incremental fix
- Add an **opt-in** `html[data-admin-theme="dark"]` preview palette in existing Admin token CSS. The Aaraagate brand teal values are unchanged, and no OS-wide toggle is exposed or globally enabled.
- Migrate named legacy backgrounds, status treatments and navigation drawer surfaces to existing semantic variables. Retain today's light defaults, all authorizations, business data, navigation and actions.
- Adapt shared Admin link and semantic feedback ink to the preview palette. Retain error, warning and focus distinctions.
- Add browser checks for dark computed surfaces, interactive controls, WCAG AA automated accessibility and a rendered screenshot. Require green Admin CI and mandatory merge gates.

## Open acceptance work
This **does not** establish complete admin dark-mode support. Wider legacy pages may still hard-code colours in route-specific CSS or inline styling. Do not enable globally before audit of finance/governance, partner/branding, privacy, documents, facilities and role-restricted states, plus a real operator review. Physical-device, screen-reader, multilingual and independent full-product 9/10 acceptance remain pending. No main or staging changes.
