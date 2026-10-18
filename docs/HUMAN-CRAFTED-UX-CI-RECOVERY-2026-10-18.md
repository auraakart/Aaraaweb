# Aaraagate — CI delay prevention and Helpdesk refinement (2026-10-18)

Baseline `develop` 5ae585f08a6d4abed26376cd3aa2ade018434471. Follow-up to household craft PR #1448.

## Verified reason for the previous delay

The first household refinement CI run on commit `656e49e` failed `Flutter validation (full)`. Job 117521171688 reported an `unused_import` warning in `resident_household_craft_visual_test.dart`, followed by a non-zero exit from `flutter analyze`. The corrective commit `79dc69f` removed that import; the subsequent run 39075440774 passed and merged PR #1448.

The CI job performed changed tests and risk-weighted coverage work **before** running static analysis. Consequently an inexpensive import warning forced a second full validation cycle, increasing turnaround. This is a workflow ordering problem, not a Flutter build or business-logic defect. The earlier work was already merged; no recovery changes need to be reapplied.

## Root-cause prevention

Move resident and guard `flutter analyze` directly after their respective `flutter pub get` steps, before changed tests and broader risk/coverage suites. Preserve the same analyses, tests, scopes, coverage thresholds, required gates, security checks and merge policy. This catches unused imports and other analyzer findings before expensive tests, while continuing full validation for passing PRs.

Use one coherent feature PR, limit correction commits, and use the existing automatic integration for `mastermind/*` branches after all required checks pass. Don't silently bypass failed checks or update `main` or `staging`.

## Next UI/UX slice — Helpdesk detail actions

- Preserve the resident complaint, comment and reopen APIs, idempotency, validation, status, privilege and recovery behavior.
- Reuse `PremiumActionLabel` so the action name remains visible and accessible during submitting, reopening and commenting.
- Expand the priority dropdown across its available field width.
- Add compact 320px/200% text coverage of the sheet and primary action without using new dependencies.
- Keep the existing light/dark themes and navigation unchanged.

## Acceptance

Require green changed tests, full Flutter validation, analyzer, regression/coverage and branch merge gates before merging. Physical-device, multilingual and independent usability acceptance remain open. This work does not claim product-wide 9/10 certification.
