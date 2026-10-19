# Premium Compact UI — Resident Home Prototype

**Date:** 2026-10-18
**Scope:** Reviewable `develop`-only Resident Home presentation slice; no main/staging promotion.

## Problem and design rationale

Aaraagate's resident Home added up to 24dp of vertical separation between several sections, wide quick-action cards, a tall AI entry, and empty-state cards repeating information already available via navigation tabs. On typical compact Android phones, this pushed actionable Gate, Billing and Community information below the fold.

## Changes

- Maintain the default teal design system, route handlers, all four quick actions (Staff, Billing, Amenities, Helpdesk), Gate allow/deny lifecycle, Assistant launch, announcements, SOS and existing other screens.
- At standard text sizes (<=115%) use **16dp horizontal gutters**; **8–16dp section gaps**; **a single four-icon quick action row** at usable widths; leaner AI entry, access decision and summary cards. Each interactive surface retains >=48dp minimum hit-target geometry.
- At increased text sizes, preserve the previous spacious layout and responsive 1/2-column action arrangement, with assistant supporting text not truncated.
- Suppress only redundant **Home-dashboard** placeholders when there is no Community update or no gate history; the Community and Gate destinations remain available.
- Do not alter shared `PremiumQuickAction` or globally shrink spacing tokens, which could regress Staff, Billing, Admin and Helpdesk screens.

## Validation and approval criteria

- Targeted widget tests: normal 320dp light/dark four-action layout, >=48dp targets, button destinations, 200% accessible fallback and non-truncated AI supporting content.
- Existing design/behavioral tests remain authoritative (including `resident_craft_visual_test.dart`, `home_action_inbox_dedup_test.dart`, `resident_premium_visual_test.dart`).
- CI analyzer, targeted Resident tests, risk-weighted Resident tests, full Flutter checks and required merge gates must pass before `develop` integration.
- Estimated 20–25% reduction in unproductive whitespace is a **design objective**, not a measured result. Physical device, translated-screen and TalkBack acceptance remain to be verified separately.

## Follow-on work, excluded from this first prototype

Validate screenshots and task timing before applying a similar localized density treatment to Gate, Staff, Billing, Helpdesk and Admin. Preserve readable financial amounts and data labels, text-scaling accessibility, and exception/retry feedback.
