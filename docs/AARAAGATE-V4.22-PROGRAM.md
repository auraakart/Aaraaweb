# Aaraagate V4.22 Admin UI and UX Consolidation

Date: 2026-09-19  
Status: **COMPLETE on `develop`** — all V4.22.0–V4.22.7 repository slices reconciled through `b8349322d29a6439605ca68ee358fe70d80a1c79`  
Planning baseline: `develop` at `9ee9655181c3bf167d9f79f13b8c360a29508877`  
Completion baseline: `develop` at `b8349322d29a6439605ca68ee358fe70d80a1c79`  
Execution dependency: V4.21 Helpdesk baseline reconciled before the Helpdesk migration

## Goal

Extract one shared Admin design system, then migrate Helpdesk → Privacy → Facilities → Documents → Occupancy → Finance/Governance. Give operators consistent page structure, actions, forms, status, readiness and evidence while preserving domain behavior and authorization. Complete and validate each migration before advancing.

This is a dedicated consolidation milestone. Existing module delivery does not count as completion of this milestone. Productionization, physical hardware, real external providers, mobile redesign and APK distribution are outside its scope.

## Evidence behind the milestone

- `apps/admin/app/brand-tokens.css` already defines the Aaraagate palette, surfaces, radius and elevation. Reuse it as the source of brand values.
- `helpdesk/page.tsx`, `privacy-operations/page.tsx`, `documents/page.tsx` and `occupancy-lifecycle/page.tsx` contain local presentation constants and repeated form/panel markup.
- Helpdesk uses a hard-coded `#0f766e` primary button instead of the existing `--brand` token and fixed minimum queue/detail columns. Shared components must remove this drift and provide narrow-screen reflow.
- Facilities and Finance already have workspace styles. Consolidate reusable structure into shared components while retaining styles for genuinely domain-specific data views.
- Admin regression scripts currently include source-token checks. Preserve their intent, but add rendered behavior coverage for the shared contracts and migrated workflows; source matching alone cannot establish accessibility or functional equivalence.
- At planning time PR #720 targets V4.21.3 resident service recovery. This plan does not change its implementation or claim V4.21 is closed. Re-read the integrated baseline before the Helpdesk migration.

## Shared implementation boundary

V4.22.0 implements `apps/admin/components/admin-ui/` with a public `index.ts`, component implementations and scoped styles. Usage, ownership and the 25-route inventory are recorded in [ADMIN-DESIGN-SYSTEM.md](ADMIN-DESIGN-SYSTEM.md), linked from `UI-UX-DESIGN-SYSTEM.md`. Existing CSS variables supply the brand baseline; shared components add spacing, typography, semantic tones, controls and responsive layout without global selectors that restyle unmigrated pages.

Components own presentation, accessible semantics and interaction affordances. Module pages retain API calls, domain types, permission decisions, form state, validation, lifecycle transitions and evidence interpretation. Avoid moving session access, API clients or business rules into the design system. Preserve Next.js client/server boundaries and use client components only where hooks or interaction require them.

## Required component contracts

| Component | Responsibility and acceptance contract |
| --- | --- |
| PageShell | Responsive page width, spacing and optional queue/detail composition. One main landmark; stack panels at narrow widths without hiding actions or evidence. |
| PageHeader | One page title, optional description, society context and navigation/actions. Wrap long content and retain a logical heading order. |
| QueuePanel | Named queue region with toolbar, result count, selection and caller-supplied items. Distinguish loading, empty results and failure; retain keyboard-operable selection. Search/filter/pagination appear only where supported by the module. |
| DetailPanel | Named selected-record region with header and content slots. Support no selection, loading and failed detail retrieval without displaying the previous record as current. |
| ReadinessPanel | Render supplied summary, checks, blockers, next actions and evidence boundary. Unknown or failed readiness never becomes ready; the component does not calculate domain readiness or authorize an action. |
| StatusPill | Explicit human label plus semantic tone. Status remains understandable without colour; unknown codes have a neutral fallback. Module adapters map domain status to label/tone. |
| FormField | Visible label, stable control ID, hint, required indicator and error association. Support input and textarea composition, preserve native attributes and forward refs when needed. |
| SelectField | Native labelled select with typed value/change handling and option content; share FormField hint/error semantics. Preserve required and disabled behavior. |
| PrimaryButton | Main action presentation; forward native attributes, ref, loading and disabled state. Default to `type="button"`; form submissions explicitly specify `type="submit"`. Prevent repeated activation while pending. |
| SecondaryButton | Supporting action with the same native/async contract. Navigation remains a link, not a disguised button with navigation-only handlers. |
| DangerButton | Destructive action styling with explicit action label. Preserve module-owned confirmation, reason, preview and permission checks; styling never supplies authorization. |
| EmptyState | Explain no records, no selection or filtered-out results with an optional contextual action. Never shown in place of loading or permission failure. |
| ErrorState | Accessible error announcement and contextual recovery action. Keep entered values where safe; retry retrieves data and does not blindly replay a mutation. Do not expose tokens or raw sensitive payloads. |
| Timeline | Semantic ordered events with stable keys, actor, timestamp, event label and optional evidence. Preserve caller-defined order, visibility, notes and append-only meaning; represent no history explicitly. |
| EvidenceGrid | Responsive labelled facts and authorized evidence links. Distinguish missing, pending and unavailable values; do not infer approval or success from missing evidence. |
| ActionBar | Consistent grouping and wrapping of primary, secondary and destructive actions with pending/result feedback. Any sticky variant must preserve reading/tab order and avoid covering content at zoom or on narrow screens. |

## Visual and accessibility requirements

- Preserve `--brand` / `--brand-bright` and existing semantic identity; use the existing system font stack, 4/8px spacing rhythm, clear hierarchy, rounded surfaces and restrained elevation.
- Use scoped token-driven styles for migrated presentation; remove superseded page-level constants only after their callers migrate.
- Support the existing theme behavior. Where alternate theme tokens exist, consume them; new site-wide theme switching is not a prerequisite for consolidation.
- Verify visible focus, associated labels/errors, sensible focus after selection and errors, keyboard-only operation, reduced motion and statuses that do not rely on colour.
- Check 360px, 768px and 1440px viewports plus 200% zoom. No page-level horizontal overflow; intrinsically wide tables may use a labelled scroll region. Controls target at least 44px interaction areas.
- Measure text contrast and focus visibility for actual token combinations, including hover and disabled states; do not infer accessibility from a colour name or palette match.

## Sequential delivery slices

| Slice | Scope and existing entry points | Exit evidence |
| --- | --- | --- |
| V4.22.0 | Inventory affected routes and repeated styles; implement all 16 shared components, tokens, usage examples and behavioral fixtures. | Public exports and documented contracts; rendered shared-state checks; Admin lint/typecheck/build. No module marked migrated. |
| V4.22.1 | Helpdesk: `apps/admin/app/helpdesk/page.tsx`. First full consumer and reference composition. | Queue selection, assignment, status/reason codes, resident/internal notes, reopen, SLA actions, readiness and both histories remain usable. Validate stale-detail handling and no-selection/loading/error paths. |
| V4.22.2 | Privacy: `apps/admin/app/privacy-operations/page.tsx`; inventory `platform/privacy/page.tsx` separately for its platform boundary. | Case selection, read-only/management differences, assignment/status, legal hold, retention decision, plan preview, explicit erasure confirmation and history preserved. A failed preview or changed case cannot leave an executable stale plan. |
| V4.22.3 | Facilities: `apps/admin/app/facilities/{page,layout}.tsx`, operations, preventive, contracts, inventory, alerts and health routes. | Preserve asset/work-order context, preventive scheduling, contract linkage, inventory actions, completion evidence and readiness. Retain domain-specific tables and existing navigation. |
| V4.22.4 | Documents: `apps/admin/app/documents/page.tsx`. | Preserve audience/property targeting, upload validation, secure download, lifecycle/history, read-only access and controlled supersession. The published document stays live until replacement publication. |
| V4.22.5 | Occupancy: `apps/admin/app/occupancy-lifecycle/page.tsx`. | Preserve request queue, owner/tenant/property context, readiness and authorized lifecycle actions. Gate notifications remain occupant-directed and dues behavior remains owner/tenant aware. |
| V4.22.6 | Finance/Governance: inventory all routes under `apps/admin/app/finance/` and `apps/admin/app/governance/`, including readiness and polls. Validate Finance first, then Governance within this slice. | Preserve ledger/reconciliation/waiver/close/export behavior, segregation of duties, approvals, governance readiness and evidence. Keep financial tables and specialized decision rules in their modules. |
| V4.22.7 | Cross-module closure, remaining duplicate-style removal and documentation reconciliation. | All in-scope routes accounted for, regression and visual evidence linked to final commit, roadmap/traceability updated, exceptions listed and reviewed. |

The route inventory is finalized in V4.22.0 from the latest integrated code. Related platform routes must retain their own authorization boundary. A module need not use every component; use each applicable shared contract instead of copying its presentation locally.

## Per-slice workflow and safety

1. Record the integrated baseline, route inventory, current actions and before screenshots. Inspect intervening PRs before editing.
2. Replace presentation incrementally while preserving route URLs, navigation/feature gates, request payloads, permission checks and domain state. Do not force every screen into a queue/detail layout.
3. Verify loading, empty, validation, permission denied, request failure/retry, pending, success and destructive confirmation where applicable. Changing record or society must not expose stale evidence or apply an action to the wrong record.
4. Run focused Admin lint/typecheck, shared behavior tests and affected module regression scripts. For tests that inspect source strings, update only the structural assumptions invalidated by extraction; retain endpoint, authorization and action coverage.
5. Capture desktop/narrow-screen evidence and keyboard/zoom checks. Fix regressions before moving to the next module.
6. Integrate through a reviewable PR into `develop` after required checks. Keep each slice independently revertible; do not delete old shared CSS while unmigrated consumers still use it.

No database migration or API contract change is planned. If an existing race or lifecycle defect blocks safe migration, isolate and verify the narrow fix rather than hiding it inside a generic component. Backend authorization and society isolation remain authoritative, including permission-denied responses after the UI has loaded.

## Repository closure evidence

| Slice | Merged evidence | Repository validation evidence |
| --- | --- | --- |
| V4.22.0 shared foundation | PR #722, merge `af2cc9c0ce16690a0dbb39f49d6a23e4bd7e6411` | 16 shared Admin contracts, rendered Chromium interaction/accessibility checks, 360/768/1440px coverage, 200% zoom fixture, Admin lint/typecheck/build and required CI green. |
| V4.22.1 Helpdesk | PR #732, merge `2321321afad4a6eadc0c2dcae028bbefb482d42d` | Shared queue/detail/actions, stale-detail protection and Helpdesk regression preserved; required checks green before merge. |
| V4.22.2 Privacy | PR #733, merge `f60e77ea3f1188418e40e37dba2af13156c6cf58` | Society/platform privacy boundaries preserved, erasure preview/confirmation and stale-plan protection retained; required checks green before merge. |
| V4.22.3 Facilities | PR #734, merge `e4d425b02c8b8839f0b8794a0e1fa7430d63fd83` | Facilities routes consolidated, operations/inventory surfaced, typed completion/cancellation retained; required checks green before merge. |
| V4.22.4 Documents | PR #735, merge `5928e57a9a1173a46a2aa46c6aa207ff5df3396e` | Secure upload/download, audience/property targeting, lifecycle/history and controlled supersession preserved; required checks green before merge. |
| V4.22.5 Occupancy | PR #736, merge `f0a9b659fbe4b523405d5da8600fef56a1fa8f0e` | Occupancy queue/detail/readiness/lifecycle presentation consolidated with occupant/owner-tenant rules preserved; required checks green before merge. |
| V4.22.6 Finance | PR #737, merge `07ae6d5379ff082d4c0bedbcf2ad18d613216047` | Finance routes consolidated; irreversible period-close/late-fee/cutover/waiver operations use explicit persistent confirmation, stale-response guards added, accounting and maker-checker contracts preserved. CI, Cross-role, Security/Privacy, Role UAT, Pilot, Staging and Readiness suites green. |
| V4.22.6 Governance | PR #738, merge `b8349322d29a6439605ca68ee358fe70d80a1c79` | Governance workspace, polls and readiness consolidated; non-statutory poll boundary and legal-validity boundary preserved, stale-detail guards added. CI, Cross-role, Security/Privacy, Role UAT, Pilot, Staging and Readiness suites green. |
| V4.22.7 closure | This reconciliation branch/PR | Program, roadmap and traceability status aligned to the merged repository evidence. No staging/main promotion is implied. |

The staging promotion of the V4.22.0 foundation was separately validated through PR #723. That staging evidence does not substitute for the later module-migration closure on `develop`, and no production/main completion is claimed here.

## Validation and completion accounting

During extraction, add a rendered interaction harness using the repository-compatible test stack. Exercise label association, native submit behavior, pending double-click prevention, selection, error recovery and confirmation preservation. Screenshots alone do not prove these contracts.

Per-slice commands start with `pnpm --filter @aaraagate/admin lint`, `pnpm --filter @aaraagate/admin typecheck` and the affected scripts from `apps/admin/package.json`. At final closure run the full Admin test suite and build plus the existing repository-required CI and milestone-boundary regression. Run targeted API authorization/domain suites if migration exposes behavior changes; do not repeatedly run unrelated full regression during presentation-only steps.

Every slice records its commit/PR, tests actually run, results, screenshots, applicable interaction checks and known gaps. No tests, visual checks, human acceptance or production readiness may be credited merely because a plan exists.

- [x] V4.22.0 shared foundation validated
- [x] V4.22.1 Helpdesk migrated and validated
- [x] V4.22.2 Privacy migrated and validated
- [x] V4.22.3 Facilities migrated and validated
- [x] V4.22.4 Documents migrated and validated
- [x] V4.22.5 Occupancy migrated and validated
- [x] V4.22.6 Finance/Governance migrated and validated
- [x] V4.22.7 closure evidence reconciled

Completion requires all 16 shared contracts, every in-scope route migrated or explicitly justified as not applicable, no remaining duplicated equivalents in migrated pages, preserved behavior/security, green required checks and reviewed visual/interaction evidence. Staging/main promotion remains a separate release action; main requires explicit approval.

## Exact next step

V4.22 repository consolidation is closed on `develop`. Reconcile any remaining V4.23 cross-surface presentation-token consistency work without reopening the approved Resident mobile information architecture; then proceed to the V4.24 permission-aware AI Assistant program. Staging/main promotion remains a separate explicit release action.
