# Aaraagate Admin — remaining operational dark-preview route matrix

Baseline: `develop` `5ba0ccd1a3de6c8c3f53bafa4582bc637a221a9e` at the start of this slice.

## Root-cause and duplication control

Before modifying source, inspect the current `develop` HEAD and the merged PR history. Previous dark-preview PR #1451, legacy Helpdesk/Finance PR #1453 and Billing PR #1452 are already integrated. The apparent delay arose from stale conversation progress relative to commits already landed; do not recreate or re-merge these. The source of truth is the current branch, PR status and exact commit checks, not a repeated status prompt.

## Source-driven corrections

- Facilities operational panels used hard-coded white and light dividers inside inline style constants. Reference existing Admin palette variables so the visual content follows the opt-in dark preview while retaining the present light values and all action semantics.
- Occupancy warning boxes referenced `--warning-soft`, `--warning-ink` and `--warning-line` but the preview lacked dark overrides. Add those three semantic values only under `[data-admin-theme='dark']` without changing the untouched light fallbacks.
- Extend Playwright migration fixtures for Privacy, Facilities, Documents, Occupancy and Governance at 1280px, with content, no horizontal overflow, computed dark surface (Facilities), selected warning token (Occupancy), axe WCAG 2A/AA/2.1AA and screenshots.

## Preserved

No global theme enablement or OS automatic switch, no changes to branded primary hues, operator roles, routes, forms, payments, notifications or API. Existing Admin and backend test coverage remains a required merge gate. Real user studies, contrast and visual checks for remaining role-specific pages and physical assistive-technology testing still required for product-wide 9/10 acceptance.
