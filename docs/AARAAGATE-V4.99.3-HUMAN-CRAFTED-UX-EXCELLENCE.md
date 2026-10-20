# Aaraagate V4.99.3 — Human-Crafted UX Excellence & Validation

Baseline: released V4.99.2, `develop` 2ea032df3d9ef7363ebefd2f1a07427faed53bce; staged/main V4.99.2 have identical code trees. This is the next sub-version improvement cycle, **not** a production or build publication claim.

## Competitive audit consolidation

UX review starting score: 8.1/10 **provisional expert estimate**, not measured user satisfaction or a claim of 9/10 maturity. Benchmark Mygate for quick resident operations, ADDA for trusted society workflows, and keep Aaraagate’s simpler utility-first experience rather than duplicating promotional UI.

### Workstream priorities and release gates

| Slice | Priority | Deliverable | Acceptance evidence |
| --- | --- | --- | --- |
| V4.99.3.1 | P0 | Admin mobile navigation and keyboard/screen-reader access | 320px no page-wide horizontal overflow, unwrapped role-filtered nav, current destination announced, keyboard focus/skip link, Playwright and protected CI |
| V4.99.3.2 | P0 | Admin design convergence and light/dark presentation in operational panels | Existing brand/roles unchanged; real rendered light/dark screen matrix and contrast/keyboard checks |
| V4.99.3.3 | P0 | Resident Gate, Billing and Helpdesk task states and recovery | Preserve server authorization, payment consent, action idempotency, drafts; targeted task tests; no redundant confirmation |
| V4.99.3.4 | P0 | Guard work-priority clarity and safe navigation among operational groups | No behavioral, history, audit, gate permission or API changes; compact and 200% tests |
| V4.99.3.5 | P0 | Expand essential translation coverage with language review | Scope Home/Billing/Helpdesk/Staff/Guard; validated translation completeness; avoid claiming fluent/localized experience until language review |
| V4.99.3.6 | P1 | Final visual polish, screen-reader/keyboard and physical-device UX acceptance evidence | Measure core task completion and tap/time metrics; physical device and TalkBack cannot be inferred from widget tests |

## Existing UI design boundaries

- Retain current teal/society brand variables, dark/light semantic tokens, established radii/spacing and responsive typography.
- Resident navigation remains Home / Gate / Services / Community / Profile; Home quick actions remain Staff / Billing / Amenities / Helpdesk and AI entry remains at Home top.
- Strict role filtering, cross-society separation, owner/tenant/occupant notifications and existing payment/gate security semantics are invariant.
- Do not reimplement already green V4.99.2 Guard dialogs, accessibility cards or 12-month staff attendance.
- Keep staging/main unchanged until separately approved; do not publish an APK as part of UX development.
- Change focused, reviewable slices on develop with targeted tests before milestone-wide regression; check repository head and PR state before every slice.

## Slice V4.99.3.1 — Admin mobile navigation

**Observed source problem:** the legacy Admin stylesheet includes mobile `.nav { flex-wrap: wrap; }`. The later Admin shell sets mobile nav to horizontal scrolling without explicitly removing wrapping, allowing 10+ role-visible destinations to produce multiple tall rows on 320px devices. The Admin console also omits a named navigation landmark, `aria-current`, and a keyboard skip to main workspace content.

**Change:** at widths at or below 680px, force nowrap plus constrained horizontal scrolling only within Admin's existing role-filtered navigation. Preserve all buttons/routes, active-state identity and role checks. Add a named Admin sections landmark, current-page semantics and visible-on-focus skip link to a focusable workspace anchor. Use existing design tokens and a non-obstructive focus ring. Do not mutate API, auth, state transitions or business data.

**Evidence:** add a Playwright mobile layout/keyboard test at 320px alongside pre-existing Admin axe, dark preview, reduced-motion, session and role regression suites. Require CI and visual review before considering completion; Playwright fixture tests do not constitute a physical-device or screen-reader certification.

**Version management:** keep current `4.99.2` package manifests until the V4.99.3 release identity is reconciled as its own gated release slice, avoiding premature staging/main commits.

## Slice V4.99.3.2 — Admin active-navigation contrast

**Source-level issue:** the later `admin-shell.css` overrides legacy active-navigation text with `color:var(--brand)` regardless of light/dark mode, despite `brand-tokens.css` defining theme-specific readable ink. The inherited light accent/brand combination is approximately 3.61:1 and dark accent/brand approximately 2.75:1, below the 4.5:1 normal-text target. The opt-in Admin dark preview should not force a global mode activation.

**Change:** use the pre-existing `--ink` design token for the active Admin navigation label while retaining `--brand` for its selected indicator and leaving society/partner colors unchanged. Existing navigation state, buttons and routes are unchanged.

**Acceptance:** Playwright checks active text/background contrast >=4.5:1, preserved `aria-current`, and no viewport horizontal overflow in light and opt-in dark at 390px. Keep the full Admin CI/access tests and shared dark preview checks as regression gates. This is an incremental contrast slice, **not** certification that all Admin routes are dark-mode complete.

## Slice V4.99.3.3a — Resident Helpdesk form guidance and voice safety

**Observed source issue:** the complaint form's title and description carry server-facing minima (3 and 5 characters), but the fields do not communicate these requirements before submission. More importantly, Submit is enabled while dictation is still active; a late speech transcript can change title/description while the request is already being submitted.

**Change:** retain the original field labels and add short required-length hints; disable Submit while microphone capture is active (it is already disabled while submitting); announce existing validation/retry text via an accessible live region without clearing draft values. Preserve existing safe idempotency-key reuse after ambiguous submission failure, voice/manual editing, priority, category, authorization and server contracts.

**Test:** use an injected pending `ResidentSpeech` test double to prove that Submit is unavailable during listening, becomes available after voice completion, and required helper text is present. Keep the established full Helpdesk recovery and 320dp/200% regression gates. Physical screen-reader testing and full Home/Billing/Gate task timing remain open.

## Slice V4.99.3.3b — Resident Billing single-flight payment preparation

**Source-level issue:** the Billing summary and each outstanding invoice have independent Pay buttons. During an in-flight payment order, only the selected invoice's button previously disabled; tapping another invoice could start a second network payment preparation simultaneously. This added resident uncertainty and could create competing order attempts even with per-invoice idempotency keys.

**Change:** maintain one active payment preparation per Billing screen. Disable all other invoice/summary Pay buttons until the selected order returns, retaining the selected busy indicator and other labels. An early guard protects callbacks invoked before rebuild. Preserve existing payment modal, error recovery, server verification, per-invoice idempotency keys, gateway contracts, authorization and property scope.

**Test:** use two issued invoices and a held order to verify summary and both invoice Pay controls disable, only the selected invoice displays progress, and exactly one payment preparation call occurs. Require the existing large-text, dark/light and retry tests plus protected full Resident validation.

## Slice V4.99.3.3c — Gate refresh recovery retains visible history

**Observed source issue:** Gate rendered an access-error card with an `else if` that replaced all previously loaded nonpending access cards, even though the controller still retained their latest locally available state. Pending decisions stayed visible, but residents lost their activity context until the next successful refresh.

**Change:** keep the localized retry/error card and render the controller's existing nonpending history below it. Show the ordinary empty state only when there is no history and no load error; maintain the pre-existing initial spinner. Do not invent refreshed data or change gate status, commands, validation, authorization, callbacks, translations, lifecycle or request IDs.

**Tests:** five widget cases validate light/dark at standard 390dp and 320dp/200% text, plus the empty-error fallback. Preserve all existing Gate mutation concurrency, authoritative reload, visitor pass, short cab/delivery approval, and locale tests in CI. Cached access entries are not claimed to be newly verified; physical-device and screen-reader acceptance remain separate.

### PR #1489 initial CI correction
The first five new tests failed (12 existing Gate cases passed) because test assertions expected Helpdesk's English “Try again” text while Gate localization intentionally uses “Retry”. At 320dp/200% text the error notice also started beyond the lazy ListView's initial build viewport, making a direct `find.text` assertion premature. Keep the production fix unchanged; assert the real Gate translation and scroll to the recovery notice and preserved history in the same ListView. The coverage-upload failure was downstream of the test failure. Require a new green CI run for the corrected PR head; do not bypass gates.

## Slice V4.99.3.4a — Guard attention ordering and safe recovery

**Observed source problems:** Field Operations put its routine summary metrics above urgent gate attention, requiring guards to scan counts before seeing the safety queue. It also exposed raw Dart/network exceptions directly on screen and had no error-specific retry control. An ambiguous mutation error must never be treated as permission to repeat that mutation automatically.

**Change:** show the already computed `Attention now` / `Attention queue clear` summary before metrics. Replace raw errors with separate, actionable user copy for refresh failures versus uncertain action outcomes. Extract `GuardFieldRecoveryNotice`, with existing warning surface, full-width 56dp-minimum `Refresh status` action and large-text wrapping. The retry **only calls `load()` to re-read authoritative status**; it never automatically repeats an escalation, checkpoint scan, handover, move pass or incident command. Retain all API calls, summary counters, existing sections, action disablement, input forms and established theme colors.

**Tests:** five targeted Guard widget tests across light/dark and 390dp/100% / 320dp/200% text plus disabled retry state, in addition to required Guard behavior/coverage and full Flutter CI. Source review verifies existing attention/metrics content unchanged beyond ordering. No physical guard or TalkBack testing is claimed.

## Slice V4.99.3.5a — Home quick actions in existing eight languages

**Source issue:** Gate's current `AaraagateStrings` language table provides translations for English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi and Bengali, while the Resident Home heading and four critical actions remain English-only. Blindly replacing the strings in the existing 320dp four-icon row could truncate longer Indic-script labels.

**Change:** localize only Home's `Quick actions` heading and the four Staff / Billing / Amenities / Helpdesk labels via the existing `AaraagateStrings.device()` table. English retains its previously validated four-icon compact grid; non-English locale views prefer the existing flexible responsive `PremiumQuickAction` layout (one column below 340dp, two on wider phones at normal text, and one at >=130% scale). These are presentation-only choices. Keep all callbacks, destination order, feature visibility, user roles, API contracts, brand tokens, gate-approval text and existing user preferences unchanged. Do not globally activate a new locale, modify app navigation or claim the entire Home, Billing or Guard screens are translated.

**Acceptance:** add a focused widget matrix for eight locale codes × light/dark at 320dp, plus Hindi/Tamil 200% tests; action navigation and overflow must remain correct. Existing Home density and all Gate localization tests remain authoritative. Translations require native-speaker product review before describing them as certified.

## Slice V4.99.3.5b — Resident bottom navigation labels

**Source issue:** the persistent five-tab Resident navigation shell still uses English-only labels even after Home quick actions and Gate translation coverage improved. These are high-frequency destinations and should reuse the same device-language fallback rather than adding a second translation system.

**Change:** localize the five existing `NavigationDestination` labels (Home, Gate, Services, Community, Profile) using `AaraagateStrings.device()` for the same eight locale codes. Keep the exact number/order of tabs, icons, indices, badges, callbacks, easy-mode geometry, page visibility, permission scope and theme colors. Existing independent-home two-tab navigation is a different flow and is untouched. English remains bit-for-bit identical in visible text.

**Acceptance:** add a focused light/dark matrix at 320dp for eight locale codes, plus Hindi/Tamil 200% text. Verify five distinct labels, unchanged selected index and no layout exceptions; full Resident/Guard CI and role tests remain authoritative. The widget harness isolates navigation presentation; native-speaker review and physical-device screen-reader acceptance remain outstanding. No claim of complete app-wide localization.

## Slice V4.99.3.5c — Localized Resident Helpdesk entry and recovery

**Observed gap:** after Gate, Home quick actions and five-tab navigation gained eight-language labels, the primary Helpdesk entry screen still contained English-only headings, complaint action, empty/loading/error copy and retry text. That makes a critical resident support entry inconsistent with the selected device locale.

**Change:** reuse the established `AaraagateStrings.device()` table and English fallback for exactly ten Helpdesk entry keys across en/hi/ta/te/kn/ml/mr/bn: page heading, complaint section heading, supporting intro, count summary, new complaint action, loading, connection error, retry, empty state and missing-property guidance. Reuse `helpdeskNewComplaint` in the sheet title. Show translated long button copy with wrapping; retain the native premium responsive page intro. Store a stable error key so changing locale at rebuild does not expose stale English. No changes to user-entered text, ticket submission or idempotency, assigned property scope, voice input, comment/reopen flows, permissions, APIs or theme branding.

**Tests:** add eight-locale × light/dark widget coverage at 320dp for entry and navigating into the existing complaint sheet. Verify English/Tamil recovery at 320dp/200% text, and retain existing Helpdesk concurrency/voice, recovery, compact and full Resident CI gates. This is **entry-screen localization only**: ticket details and the form's remaining English field labels need separate review. Translations are draft pending native-speaker and physical-device acceptance.

## Slice V4.99.3.5d — Helpdesk form labels and validation across eight languages

**Source issue:** the localized Helpdesk entry still opens an English-only form for the title, issue, category, priority, submission and validation/retry. Residents need clear, localized descriptions at the actual reporting step.

**Fix:** reuse `AaraagateStrings.device()` for the fourteen visible complaint-form keys in the eight existing language codes. Keep exact `LOW/NORMAL/HIGH/URGENT` backend enum values, field validation minimums, user draft, voice sequencing, idempotency shape and reuse after uncertain transport, current property checks and permission contracts. This is text presentation only, with no brand/color change and no new APIs.

**Proof:** add eight-language form interaction tests and Hindi/Tamil at 320dp/200% text; require the existing Helpdesk voice, retry, security, full Resident analyzer/tests and merge gates. Native-speaker review and physical TalkBack acceptance remain unverified.

## Slice V4.99.3.5e — Billing entry and read-only status localization

**Source gap:** after Resident Home/navigation and Helpdesk were localized, Billing still displayed English-only page title, outstanding status and payment-history labels. Keep financial authority and payment safety outside this presentation-only change.

**Change:** add eleven supported-language Billing entry/status keys for English/Hindi/Tamil/Telugu/Kannada/Malayalam/Marathi/Bengali, used for page title, loading/retry/no-bills, outstanding heading/count/zero-state, and payment history heading/receipts/empty state. Preserve English bill singular/plural behavior exactly, use placeholder counts for non-English labels, and leave all payment checkout buttons, due amounts/dates, AutoPay, gateway/payment-completion warnings, idempotency, role checks and API unchanged. Colors, navigation destinations and brand are unchanged.

**Validation:** eight-language x light/dark 320dp test matrix plus existing Billing single-flight, financial permission, gateway recovery and receipt tests and full Flutter gated CI. **Not full Billing localization:** financial statements and checkout remain in their existing English presentation until accurate translations receive professional review. Native-speaker and physical screen-reader acceptance remain pending.

## Slice V4.99.3.5f — Guard Field Operations heading localization

**Observed gap:** Guard tools already support a language preference and eight complete guard-language vocabularies, including `fieldOperations`, but the linked Field Operations screen still hardcodes its app-bar and six long section headings in English. The field refresh tooltip is also English-only. This creates inconsistent navigation in routine shifts.

**Change:** reuse `GuardStrings(widget.controller.languageCode)` to localize the existing Field Operations title, six section headings (overstays, watchlist, passes, patrol, handover, incidents) and refresh tooltip without creating a new preference or altering the main Guard tools navigation. Add seven keys to all eight languages and to the existing localization completeness contract; header tests exercise 320dp and 200% text. Avoid translating safety instructions, mutation buttons or incident severity states without separate operational verification. All guard action paths, authorization, API, runtime state and brand/theme remain unchanged.

**Acceptance:** eight-language large-text heading matrix plus pre-existing Guard field-operation accessibility and recovery suites, full Guard analyzer/tests and protected merge gates. Human language review and in-field device usability remain open, and the screen is not claimed to be fully localized.
