# Aaraagate human crafted UI refinement

## Scope and verified baseline

Baseline: develop `4174422dc950f553a6cd8a5add6e3481e5350882`, repository version 4.99.2. No open PRs were returned at the start of this review. Main was `7bf84fabd28880e9fddc72f0845ae50eaa4c4849`. Work uses a feature PR into develop; staging and main are outside this change.

This is incremental refinement of the existing Flutter Material 3 Resident/Guard applications and React/Next.js admin. Existing resident shared widgets are in `widgets/premium_ui.dart`, mobile tokens in `theme/aaraagate_theme.dart`, and admin shared components in `components/admin-ui`. No framework, router, font dependency or styling library is introduced.

V4.69 and V4.99.2 already improved Gate, Billing, Amenities and Notices. Their protected CI evidence is recorded in `AARAAGATE-V4.99.2-RESIDENT-PREMIUM-UX.md`. The previous resident artifact was downloaded and the actual Gate light 390px image inspected. It has an amount/task-specific hierarchy, distinct approval controls and restrained surfaces. Rebuilding those modules would duplicate existing work.

The supplied August specification establishes scope and tenant isolation; the supplied image shows GitHub, not an application screen. Neither is treated as current visual evidence. The audit below distinguishes implementation evidence from rendered and human acceptance evidence. Competitor visual parity and measured user task efficiency have not been established.

## Locked invariants

| Area | Preserved contract |
| --- | --- |
| Brand | Resident `brand = 0xFF0EABBE`, `brandDeep = 0xFF05879A`; all current light/dark primary, foreground and semantic pairs; partner branding overrides. No theme definition changes. |
| Resident navigation | Home, Gate, Services, Community, Profile. No new destinations or router changes. |
| Home | Staff, Billing, Amenities, Helpdesk quick actions; Assistant remains at the top. Feature/permission flags still own visibility. |
| Gate | Same approval and denial methods, property checks, short cab/delivery windows, mutation recovery and audit authority. UI still serializes decisions. |
| Finance and amenities | No changed payment, invoice, receipt, fee, deposit, reservation, cancellation or reconciliation contracts. |
| Staff | Same society review, assignment/verification/gate statuses, leave, rating, attendance, payment and confirmation behavior. |
| Security | No changes to APIs, database, notifications, roles, tenancy, backend or authorization. Fixtures contain demo records only. |
| Engineering | Existing widgets, spacing, surfaces and motion. No dependency additions or release identity changes. |

## Screen audit and proposed decisions

| Screen or component | Evidence and finding | Decision and priority |
| --- | --- | --- |
| Home Assistant | `_AssistantEntryCard` repeats the Assistant name in an uppercase eyebrow and title, caps context at two lines and uses elevation like the arrival card. | Remove repeated eyebrow and optional elevation; retain title, complete context, icon and same action. Urgent arrivals keep visual priority. P1. |
| Home quick actions | `PremiumQuickAction` uses a 76px inner minimum plus 24px padding and another tinted icon container. At narrow widths four actions consume considerable vertical space. | Keep the current responsive column rules and labels; use a simple recognizable icon and 48px inner minimum. Interactive targets remain at least 48px. P1. |
| Home visitor | Fixed identity/status row truncates purpose; fixed button row; one `_busy` flag drives Allow's spinner even after Deny. Request widgets lack stable identity keys. | Reuse `PremiumIdentityHeader`, `PremiumActionGroup`, `PremiumActionLabel`, key by request ID. Retain selected action labels and serialize both decisions. P0. |
| Home action inbox | Fixed trailing action text and status compete with a one-line title and subtitle. Both hide useful context with ellipses. | Adaptive section header, wrapping title/subtitle and readable action text below content; single chevron. Preserve urgency labels, semantic action and aggregate counts. P1. |
| Home community preview | A one-line bold title truncates notice identity before the reader opens. | Allow title wrapping, use a quieter weight; body remains a deliberately bounded preview with the same reader route. P1. |
| Gate | Existing rendered light/dark compact and standard fixtures plus V4.99.2 evidence. Already uses adaptive identity, selected-action progress and explicit waiting context. | Retain implementation; reuse its component contracts on Home. Keep existing concurrency/recovery tests. |
| Billing | Existing V4.99.2 invoice/receipt fixtures and tests cover amount, due state, verified receipt and compact layout. | Retain financial workflow and established amount-first treatment. No speculative financial redesign. |
| Amenities | Existing V4.99.2 evidence covers booking, deposit, waitlist and scrolling cancellation. | Retain implementation and mandatory confirmation. |
| Staff list | `_StaffCard` uses two rigid rows of icon buttons with long labels. Add, leave and rating sheets use non-scrolling columns; rating controls lack individual labels. | Use existing adaptive action groups, scrolling safe-area forms, theme heading roles, labeled busy content and wrapped accessible rating controls. Preserve every status and action. P0. |
| Helpdesk | Source has wrapping status/priority, property scoping, recovery targets and next action. | Render actual list and retain recovery regressions before deciding on further refinements. No invented assignee data or workflow changes. P1 validation. |
| Services | Source separates local service discovery, provider selection and bookings; dedicated sheets and safety disclosures already exist. | Render actual screen, retain provider choice, booking confirmations and trust disclosures. P1 validation. |
| Community | Source separates notices, polls, documents, meetings and complaints; poll boundaries and server response authority are explicit. | Render actual screen, retain editorial grouping and existing poll behavior. P1 validation. |
| Profile | Source groups household and settings; property context and ownership determine allowed actions. | Render at compact large type; preserve property switching, easy mode and privacy controls. P1 validation. |
| Admin | Shared 16-component system exists; readiness panels are nested inside operational detail panels, intentionally dense. Legacy brand CSS adds shadows to many surfaces and movement on notice hover. | Audit rendered operational fixtures separately. Retain tables, queues, filters, evidence, permission gates and keyboard workflows. P2. |
| Guard | Own Flutter theme and large control workflows exist. | Preserve operational layout; no cosmetic global changes across resident and guard themes. Physical guard-device/voice acceptance remains separate. |

## Shared refinement standards

Reuse the existing 4/8 spacing scale, 20px page gutter, 12px small/icon, 16px card/control and 24px sheet radii. Use existing text roles rather than local heavy headings. Keep 48px touch targets and 52px primary actions. Do not cap essential identity, status or decision context. Group operational status and its meaning; do not remove required information simply to reduce badges.

Reserve elevation for attention and meaningful grouping. Home Assistant becomes a quiet entry; a waiting arrival remains raised. Quick actions use their icon and label without nested icon cards. Different modules retain their task-specific composition; financial records are not converted into Home summary rows.

Reuse 120/220ms motion and reduced-motion handling. Pending labels remain visible. The button owns enablement; progress content adds no nested action. Scrollable forms account for the keyboard and safe area. The application font, localization plumbing, dark surfaces and semantic colors remain unchanged.

## Implementation and evidence slices

1. Shared component restraint and Home refinement, including gate feedback and readable context.
2. Staff responsive actions and accessible add/leave/rating forms.
3. Rendered validation across Home, Staff, Helpdesk, Services, Community and Profile in light/dark at 390px standard, 320px 200% type and 840px standard. Fix observed blockers before merge.
4. Admin operational visual review and scoped refinements; retain dense workflows.
5. Milestone regression and evidence closure. Physical-device, multilingual, assistive-technology and independently operated usability acceptance remain required for an unqualified 9/10 rating.

### Current modified files and purpose

- `apps/resident/lib/widgets/premium_ui.dart`: compact quick actions without an extra icon container.
- `apps/resident/lib/screens/home_screen.dart`: Assistant hierarchy, complete arrival context, adaptive controls, selected-decision feedback, request identity keys, readable inbox and notice titles.
- `apps/resident/lib/screens/workforce_screen.dart`: adaptive actions, scrolling forms, labeled feedback and rating controls, reliable pull-to-refresh for short lists.
- `apps/resident/test/support/resident_visual_capture.dart`: reuse the existing SDK-font/theme/screenshot capture helper across both visual suites.
- `apps/resident/test/resident_premium_visual_test.dart`: use the shared helper; retain existing Gate/Billing/Amenities/Notice assertions and captures.
- `apps/resident/test/resident_craft_visual_test.dart`: six-screen layout/capture matrix, original quick-action destinations, Home denial progress and single-flight feedback, compact keyboard form reachability.

### Validation status

Local stable domain invariants: 44/44 pass. Maintainability, release identity and hygiene checks pass. `git diff --check` passes. Flutter is unavailable in the local runtime; attempts to retrieve the pinned SDK returned 404. No SDK or dependency constraints were lowered. Flutter execution and actual screenshots must come from the existing protected CI runner. Pending CI checks are not credited as passes.

### Quality scorecard and acceptance limits

The original whole-product score is **not established**: the available rendered baseline covers four resident feature screens, while operational, accessibility and human usability evidence is incomplete. Source findings above identify specific review failures; they do not establish a measured whole-product score.

For each dimension use a 0–10 rubric: 0–2 blocks core use; 3–4 major defects; 5–6 usable with recurring friction; 7–8 coherent with remaining polish/coverage gaps; 9 professionally reviewed across required states with no known blockers; 10 exceptionally resolved with independent usability corroboration. Record evidence and coverage beside every score. Never average away a functional, brand, permission or accessibility blocker.

| Dimension | Baseline status | Acceptance target |
| --- | --- | --- |
| Professional appearance | Partial rendered evidence; complete score pending | 9 |
| Human crafted character | Home hierarchy/duplication findings; rendered review pending | 9 |
| Visual consistency | Established shared system; remaining screen matrix pending | 9 |
| Ease of use | Workflows retained; independently measured task success pending | 9 |
| Information hierarchy | Home conflict findings; rendered review pending | 9 |
| Accessibility | Existing contrast/large-type coverage; new compact form/decision checks pending | 9 |
| Interaction polish | Home denial-progress defect identified; correction pending execution | 9 |
| Dark and light quality | Existing theme pairs retained; full matrix pending | 9 |
| Cross screen consistency | Resident and admin rendered review incomplete | 9 |

Brand-token deviation, unapproved functional changes and known functional regressions must all be zero. The complete initiative remains open until its evidence gates are satisfied; passing widget tests alone does not certify professional quality, real-device performance or screen-reader behavior.
