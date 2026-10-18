# Aaraagate Admin — legacy dark-preview continuity (2026-10-18)

Baseline `develop` `7f0320121a5ec0a988fc718a0724c7e97518c716`, after PRs #1451 and #1452.

## Delay and work recovery
The earlier apparent pause was a stale conversational status: the opt-in admin dark preview and Billing progress states had already merged. Repeated broad reads and redundant rework would waste review/CI. Check the live `develop` head and merged PRs before each slice, and extend only gaps.

## Remaining finding
The existing opt-in `data-admin-theme="dark"` palette and shared Admin primitives support dark surfaces, but standalone legacy controls in `globals.css` still use fixed white backgrounds, and legacy urgency/status treatments use fixed light-mode semantics. This can yield bright isolated areas and poor warning/error contrast in the opt-in preview.

## Scoped change
- Override legacy panels, rows, choices, tools and input surfaces **only when** the root already opts into the dark preview.
- Resolve legacy error/warning/success backgrounds through existing preview semantic variables.
- Preserve the full original default light stylesheet, branded teal values, authorization, APIs, navigation and operational actions.
- Add computed-colour Playwright assertions for representative legacy controls and real migrated Helpdesk/Finance route visual/a11y snapshots.
- Keep the preview opt-in and not globally available as a product toggle.

## Acceptance boundary
Require CI Admin browser validation, route/permission regression, lint, build and protected merge gates. The two selected operational routes are not comprehensive admin-wide dark acceptance; role-restricted, partner, governance, lower-end devices, multilingual and human-operated screen-reader acceptance remain outstanding. No staging/main changes or product-wide 9/10 claim.

## Browser-discovered Finance contrast gap and correction
The first protected Playwright run exposed a dark-preview status-selector collision: the drawer uses `.open` for its expanded state, so dark error status selectors must be scoped to actual `.badge.open` components. A second run revealed Finance's remaining inline white cards; light text on these cards failed automated WCAG AA contrast.

Use existing `--surface`, `--line`, `--admin-subtle-surface`, and warning-surface tokens in the Finance presentation-only style constants. Preserve their original light-mode values as CSS variable fallbacks, with no calculation, reconciliation or permission changes. Keep the dark browser accessibility assertion and add a computed-surface invariant for the receivables section. Do not disable or weaken axe checks.
