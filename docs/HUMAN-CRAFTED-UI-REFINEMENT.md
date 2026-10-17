# Aaraagate human crafted UI refinement

## Scope and verified baseline

Baseline: develop `4174422dc950f553a6cd8a5add6e3481e5350882`, repository version 4.99.2. No open PRs were returned at the start of this review. Main was `7bf84fabd28880e9fddc72f0845ae50eaa4c4849`. Work uses a feature PR into develop; staging and main are outside this change.

This is incremental refinement of the existing Flutter Material 3 Resident/Guard applications and React/Next.js admin. Existing resident shared widgets are in `widgets/premium_ui.dart`, mobile tokens in `theme/aaraagate_theme.dart`, and admin shared components in `components/admin-ui`. No framework, router, font dependency or styling library is introduced.

V4.69 and V4.99.2 already improved Gate, Billing, Amenities and Notices. Their protected CI evidence is recorded in `AARAAGATE-V4.99.2-RESIDENT-PREMIUM-UX.md`. The previous resident artifact was downloaded and the actual Gate light 390px image inspected. It has an amount/task-specific hierarchy, distinct approval controls and restrained surfaces. Rebuilding those modules would duplicate existing work.

The supplied August specification establishes scope and tenant isolation; the supplied image shows GitHub, not an application screen. Neither is treated as current visual evidence. The audit below distinguishes implementation evidence from rendered and human acceptance evidence. Competitor visual parity and measured user task efficiency have not been established.

Implementation status: merged into develop at `64c2fd2116e32633281e94cf31bd7fd15fc027dc` through [PR 1435](https://github.com/auraakart/Aaraaweb/pull/1435). The final tested UI head is `5a0b3f5d6bd95f37329a6db39481fa08ad61046c`; its complete tree matches the develop integration tree. Main and staging were not promoted.

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

### Rendered review corrections

The first protected Flutter execution produced 63 PNGs and passed 52 changed tests with four failures. These failures were Staff hit-test assertions before the scrolled viewport had been repainted; the test now waits for layout after scrolling, without suppressing hit-test warnings or dropping assertions. No RenderFlex exception was reported in this matrix. It is still a failed run and is not a merge gate pass.

Actual Home, Staff, Helpdesk, Services, Community and Profile screenshots were inspected. At 320px/200%, decorative page icons squeezed long heading words into narrow columns. Page and identity headers now give that space back to essential text at accessibility sizes. Community tiles also truncated request context while reserving a trailing action column; they now wrap content and place the same action below it on phone/large-type layouts. Insta Services uses the existing adaptive section header for its identity/status pair. Price labels use onSurface for small-text contrast. These are screen-specific changes driven by rendered evidence.

Short Home gate decisions may share a row at 300px content width, matching the established Gate pattern. Staff uses equal leave/rating actions at that width; the longer attendance/payment group retains the 360px default after rendered review found an awkward split in ATTENDANCE. Large text always stacks. Other action groups retain the 360px default. This documented exception avoids unnecessarily tall phone cards while keeping long labels readable.

The capture helper now supplies the SDK Roboto family to Chip styles as well as buttons. The first Staff capture exposed Ahem test-font blocks in chip labels; that image cannot establish label quality. Those capture font overrides do not change the production font. Staff status presentation is separately refined as described below. The populated Services fixture now supplies provider/category contract fields; the first capture showed the empty state because older demo offerings lacked the typed model's required provider object.

Admin Helpdesk's prior rendered queue/detail layout was inspected at 1440px. Routine forms used the same tinted rounded treatment as readiness summaries. Forms now use spacing and a top divider, retaining readiness tint for its distinct purpose. Existing navigation/action/notice hover treatments stop moving controls; reduced-motion preferences cover those legacy surfaces and the management drawer. Metric, notice and action shadows are removed, and legacy amount columns use tabular numerals. No controls, forms, filters, evidence or operational destinations are removed.

Additional modified files: `apps/resident/lib/screens/community_screen.dart`, `apps/resident/lib/screens/services_screen.dart`, `apps/admin/app/helpdesk/page.tsx`, `apps/admin/app/admin-shell.css`, `apps/admin/app/property-workspace.css`, and `apps/admin/tests/admin-ui/contracts.spec.mjs`.

### Validation status

Protected [CI 39060828264](https://github.com/auraakart/Aaraaweb/actions/runs/39060828264) passed for code head `5a0b3f5d6bd95f37329a6db39481fa08ad61046c`. Changed Resident tests: 56 passed; risk regression: 66 passed and coverage gate passed; full Resident: 370 passed; Flutter analysis: no issues. Admin: 167 browser tests passed, including the new legacy reduced-motion/navigation check; Admin build and applicable validation gates passed. Repository structure, preflight, dependency/security routing and required merge gates passed. API full tests and Android smoke were scope-skipped; their wrapper success is not new API or device evidence. Guard source is unchanged.

Local stable domain invariants: 44/44 pass. Maintainability, release identity, privacy/hygiene and base-to-working-tree diff checks pass. The Insta Services source invariant now accepts the existing Text label or its shared heading title, retaining runtime entry/navigation coverage. No assertions, hit-test warnings, retries or CI controls were suppressed.

The green run produced 65 Resident PNGs in [artifact 12111039194](https://github.com/auraakart/Aaraaweb/actions/runs/39060828264/artifacts/12111039194) and 25 Admin PNGs in [artifact 12111213044](https://github.com/auraakart/Aaraaweb/actions/runs/39060828264/artifacts/12111213044). Reviewed standard/compact light/dark Home, Staff, Helpdesk, populated Services, Community, Profile and Staff form examples, plus Admin Helpdesk before/after. Representative images are presentation fixtures, not live sessions.

Manual review found an awkward mid-word wrap in the phone attendance button. Its group now retains the existing wider stacking threshold. That correction and the essential-status/large-type corrections below passed the final protected run and were visually reviewed before the develop merge. Whole-product 9/10 acceptance remains open.

### Quality scorecard and acceptance limits

The original whole-product score is **not established**: the available rendered baseline covers four resident feature screens, while operational, accessibility and human usability evidence is incomplete. Source and rendered findings above identify specific review failures; they do not establish a measured whole-product score.

For each dimension use a 0–10 rubric: 0–2 blocks core use; 3–4 major defects; 5–6 usable with recurring friction; 7–8 coherent with remaining polish/coverage gaps; 9 professionally reviewed across required states with no known blockers; 10 exceptionally resolved with independent usability corroboration. Record evidence and coverage beside every score. Never average away a functional, brand, permission or accessibility blocker.

| Dimension | Reviewed sample estimate | Evidence and remaining limit | Target |
| --- | --- | --- | --- |
| Professional appearance | 8.5 | Actual mobile/admin fixture composition reviewed; broader device coverage remains | 9 |
| Human crafted character | 8.0 | Repetition, competing Assistant hierarchy and Community crowding corrected; deeper flows need equivalent review | 9 |
| Visual consistency | 8.5 | Shared roles and adaptive controls; legacy admin surfaces remain | 9 |
| Ease of use | Not rated | Callback/recovery tests pass; no independently measured user task success | 9 |
| Information hierarchy | 8.5 | Full arrival context and distinct admin form/readiness grouping; more operational states remain | 9 |
| Accessibility | 8.0 | Existing contrast checks, 200% type, keyboard/axe tests; physical screen-reader and multilingual acceptance pending | 9 |
| Interaction polish | 8.5 | Selected-action progress and serial decisions; actual device feel remains untested | 9 |
| Dark and light quality | 8.5 | Mobile theme fixtures reviewed; admin evidence is current light-theme only | 9 |
| Cross screen consistency | 8.5 | Six additional Resident screens plus existing feature and Admin evidence; not every app route | 9 |

The eight scored dimensions average **8.4/10** for the reviewed sample. This is a transparent reviewer estimate, not a measured whole-product score, competitor ranking or 9/10 acceptance. The original complete-product baseline remains unscored because current evidence does not cover the entire application.

Brand-token deviation, unapproved functional changes and known functional regressions must all be zero. The complete initiative remains open until its evidence gates are satisfied; passing widget tests alone does not certify professional quality, real-device performance or screen-reader behavior.

## Remaining acceptance work

- Run physical lower-end Android, TalkBack, voice and intermittent-connectivity acceptance; widget fixtures do not model device behavior.
- Review long multilingual strings with real fonts and complete operational/partner/Guard journeys.
- Establish admin dark-theme coverage across legacy routes before claiming product-wide dark/light consistency. This slice does not invent a theme switch or force partial dark styling over hardcoded legacy surfaces.
- Extend screenshot review to deeper forms, detail sheets, loading, offline, denied, expired and concurrent states. Existing automated recovery tests are retained, but are not visual evidence for every state.
- Obtain independent task-based resident/senior/guard/operator feedback, remedy findings, then reassess the 9/10 target. No elapsed-time, tap-efficiency or commercial competitor score is invented.

Further review of the complete compact contact sheet exposed pre-existing single-line Chip truncation of Staff assignment, verification and gate-access values. These essential values now use wrapping icon/text details, preserving every label and its meaning; the visual test also checks the actual RenderParagraph has no line cap. Community uses the established headline-small role and a single-column shortcut layout at large type, so words and destination labels remain whole. Optional Assistant/Insta Services lead icons yield their space to text at large sizes. These corrections are driven by actual compact light/dark renders, not a test-pass assumption.

## Demo APK delivery

Published [Resident UI demo preview](https://github.com/auraakart/Aaraaweb/releases/tag/resident-demo-ui-20261018), version `4.99.2+49902`, through [build 39061260371](https://github.com/auraakart/Aaraaweb/actions/runs/39061260371). The demo packaging run passed all 370 Resident tests and APK archive/manifest/bytecode/ARM64 engine inspection before publication.

- Application source: develop `64c2fd2116e32633281e94cf31bd7fd15fc027dc`.
- Build commit: `4a6583d1c1cb9ff5f452397de1e182b084411096`; application paths are verified byte-for-byte against the validated source before packaging.
- Asset: [Aaraagate-Resident-Demo-Showcase-V2.apk](https://github.com/auraakart/Aaraaweb/releases/download/resident-demo-ui-20261018/Aaraagate-Resident-Demo-Showcase-V2.apk), 59472910 bytes.
- Published digest: `sha256:a3725b8289d35477c7ce58dd9f5cea5c7ef8ff8d28db0db2ea99f21c316f4e2c`.
- The dedicated preview workflow exists only on `demo/ui-refinement-20261018`. It reuses the established demo packaging, enrichment, SDK, tests and integrity checks. The main demo workflow and `resident-demo-latest` release are unchanged.
- This is a demo-signed, release-mode preview with the existing Continue as Demo Resident login; it is not a production/store-signing or physical-device acceptance claim.

