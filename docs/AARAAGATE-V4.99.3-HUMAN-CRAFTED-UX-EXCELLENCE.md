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

## Slice V4.99.3.5g — Localized Guard Field Operations count labels

**Observed gap:** Guard Field Operations sections are localized across eight Guard language codes, but the five operational summary count labels remain English: Overstays, Watchlist, Open passes, Incidents and Checkpoints. This creates a high-frequency reading inconsistency at shift handoff and during safety reviews.

**Change:** reuse the existing `GuardStrings(widget.controller.languageCode)` for three existing matching terms (`fieldOverstays`, `fieldWatchlist`, `fieldIncidents`) and add just two context-accurate summary terms (`fieldOpenPasses`, `fieldCheckpoints`) across the existing eight languages. The metric component, values, visible status data, tap targets, authority, API, refresh/mutation safety, semantics shape, brand palette and operational section order are unchanged. Do not translate incident priority, safety commands or operating modes without validated operational-language copy.

**Validation:** require the existing Guard localization completeness suite to cover both added terms, and a new 8-language x light/dark 320dp/200% widget matrix proving all five labels, one meaningful count/value semantics per metric, vertical legibility and no exceptions. CI must include the existing Guard metric, recovery, keyboard/accessibility, API and merge gates. Native-speaker review, physical-device and screen-reader acceptance remain pending; these translations are provisional.

## Slice V4.99.3.3d — Home Gate attention remains visible after refresh failure

**Issue:** the Resident Home Action Inbox used an exclusive `else if` that replaced a still-pending gate visitor card with a connection-error card whenever a refresh failed. This contradicted Gate screen recovery (which retains the last available activity) and suppressed a high-priority action while the controller still held a pending request. When no request was available, a simple “All clear” message would also incorrectly imply live verification if recovery states were reordered naively.

**Change:** display the existing recovery/error card **and** the last available pending approval in the same inbox, with restrained existing spacing. Keep the initial loading spinner, request identity, keyed card, callback behavior, backend-derived status, and role/property scoping. Do not claim stale information is newly verified, auto-retry a security mutation or change any API. Suppress the “All clear” banner during a failed refresh when there is no known pending request.

**Test:** widget checks for light/dark 390dp showing both the recovery message and actionable pending card, plus error/empty fallback that never asserts all-clear. Preserve existing Home Action Inbox, Gate single-flight, auth and end-to-end access validation gates. Real-device acceptance and stale-request timing remain pending.

### CI correction for PR #1498
The first changed-widget run failed only the new light/dark test assertions: Home correctly renders the same pending visitor in the Action Inbox **and** the separate Recent gate activity row, so `find.text('Waiting visitor')` finds two widgets. The no-pending/error regression and existing Home tests passed. Replace the incorrect exact-one text assertion with a presence assertion while retaining explicit Allow/Deny, refresh-warning and no-false-all-clear checks. Do not remove either user-visible record or change production code to satisfy a brittle test. Require a fresh green CI run for this corrected head; the failed artifact upload was downstream of the failed test step.

## Slice V4.99.3.5h — Guard attention and safe-refresh control localization

**Observed source gap:** Guard Field Operations sections and metrics now use eight language vocabularies, but the primary attention heading and the recovery button remained in English. They are prominent during incidents and uncertain action outcomes, and their mismatch undermines comprehension.

**Change:** use the existing Guard language preference for just three short presentation strings: `fieldAttentionNow`, `fieldAttentionClear` and `fieldRefreshStatus`. Extend `GuardFieldAttentionHeader` and `GuardFieldRecoveryNotice` with optional localized labels, retaining existing English defaults so all other call sites keep identical behavior. The status badge, authoritative `load()` recovery only, mutation suppression, operational incident instruction copy, pending commands, network/API, permissions and brand semantics are unchanged. Native-speaker review is required before declaring safety-language acceptance.

**Tests:** completeness checks cover three new keys across eight languages. Targeted widgets verify an attention state and a clear state, translated safe refresh button, 320dp/light and dark, Hindi/Tamil at 200% text, disabled action and no rendering exceptions. Preserve existing Guard recovery/attention and full guarded CI before develop integration. Never auto-retry a gate mutation; never interpret this as a full-screen translation or real-device TalkBack validation.

## Slice V4.99.3.4b — Guard long-queue progressive disclosure

**Observed source issue:** Field Operations silently showed only the first 20 overstays and watchlist records, 30 move passes and incidents, and 20 handovers. Operators could interpret the short visible list as the entire available server response even if additional safety records had already loaded. The API already returns more records; hiding them without any indication undermines trust and operational awareness.

**Change:** retain the established initial list sizes and operational order, and add a small visible `Showing X of Y` caption with a `Show next N` control only when records are hidden. Revealing records updates local presentation counters in increments of 20 or 30, preserving source order, existing server-loaded data, all action callbacks and current busy/authorization guards. The shared `GuardFieldMoreRecords` component uses existing theme colors, >56dp button touch size and full-width adaptive labels. Use the existing Guard preference and eight Guard language tables for the two short disclosure strings; do not add a new language preference. No API call, privilege change, auto-retry or mutation is attached to Show next.

**Acceptance:** focused 8-language × light/dark at 320dp/200% component tests, incremental-count and empty-disclosure cases, localization completeness test, Guard analyzers/risk coverage/full Flutter gates. Existing list and status history semantics are unchanged. This reveals only records that the API has already returned; it is **not** server-side pagination or a claim of unbounded history. Safety language remains provisional pending human translation and physical guard acceptance.

## Slice V4.99.3.3e — Helpdesk stale-refresh recovery with property isolation

**Source issue:** Helpdesk's `else if (_error != null)` replaces an existing list of tickets with only the connection-error card, even though the last successful property-scoped list remains available. This duplicates the refresh UX defect already corrected in Resident Gate and Home. Simply exposing cached tickets is unsafe if the parent changes the selected controller/property while a read is in flight.

**Change:** display a localized retry card **and** clearly identified last-available complaints on refresh failures. Keep the ordinary empty/error behavior when no successful list exists; no false all-clear or claim of current status. Track the source controller and unit ID for the cached list; clear it on controller replacement. A monotonically increasing request epoch rejects late old-controller or out-of-order responses so no former property's rows can repaint the active Helpdesk. Keep all ticket reads server-authorized, per-property filtering, reopen/comment/draft mutations and idempotency contracts unchanged. Reuse the eight-language entry localization table for the cached-state notice without altering navigation, permissions, API or the theme.

**Tests:** widget coverage for light/dark refresh errors retaining the ticket and translated retry, failed first load without invented cached history, and controller/property switch during an error. Require existing Helpdesk voice/draft, mutation safety, large-text and full Resident CI. Prior data is explicitly last-known, not newly verified; physical-device and native translation reviews remain pending.

## Slice V4.99.3.5i — Localized Resident Home action inbox and recovery

**Source gap:** after the five-tab navigation, four Home actions and primary Helpdesk/Billing entry received existing eight-language labels, the Home action inbox still exposed English-only status summaries, the gate loading/error notice, and recent activity/community section labels. These are high-frequency informational surfaces.

**Change:** reuse `AaraagateStrings.device()` and existing fallback, adding ten presentation-only keys per supported language (en/hi/ta/te/kn/ml/mr/bn): Action inbox, clear/no-urgent/one/multiple-item summaries, gate loading/error notices, latest society label, See all, and recent Gate activity. Reuse `navCommunity` for the existing Community section and the pre-existing Gate `retry` translation for recovery. Preserve English strings exactly, localized semantics/liveRegion, current counts, background loading, urgent action visibility after refresh error, existing shortcuts, all callback/data/role boundaries and every theme token.

**Proof:** 8 languages × light/dark at 320dp with a pending request, plus English/Tamil 320dp/200% refresh-failure and no-false-all-clear assertions. Require existing Home action inbox, Gate recovery, Helpdesk, localization, and full Flutter CI gates before develop merge. No claim of full Home or accessibility certification; native-speaker review and physical-device tests are still open. No staging/main/APK release.

### V4.99.3.5i preflight source-contract correction

**Exact CI failure:** `scripts/check-v4.52-competitive-excellence.mjs` still demanded hardcoded `title: 'Action inbox'` and `items need your attention` in the Home Dart screen. That contract was written before the approved localization work; it falsely rejects a correctly translated UI because the strings now live in the eight-language `AaraagateStrings` table. GitHub Actions Repository structure failed at `Check stable domain invariants`, not at the Flutter renderer or application logic.

**Narrow fix:** update only the historic V4.52 contract to check the localized Home heading binding, translated count formatter and pre-existing live announcement/attention summary, plus require the original English copy and count placeholder in the default language table. Keep the original action-inbox deduplication prohibitions and all unrelated security, privacy and finance invariants untouched. This preserves a meaningful fail-closed regression contract without reintroducing English-only UI labels. Re-run the entire protected CI head after updating the PR; no skip/override.

### Follow-up CI finding: V4.84 informational Home contract

The fresh PR run progressed past the V4.52 check but surfaced a second historical source-token requirement in `scripts/check-v4.84-field-operations-pilot-readiness.mjs`: it demanded the literal English `No urgent follow-up. Recent activity is shown below.` in `home_screen.dart`. The functional invariant remains correct—the Home action count still excludes `ResidentHomeUrgency.info` and displays a distinct informational-state summary. Update the contract to enforce the actual localized binding and exact original English fallback; preserve the urgency exclusion and all unrelated V4.84 safety and finance checks. Repository-wide code search found these two historic source-token contracts; the preexisting English Home widget tests remain unchanged and still prove fallback behavior.


## Slice V4.99.3.5j — Staff entry, identity fallbacks and history destinations

**Confirmed remaining source gap:** Staff is explicitly in the V4.99.3.5 scope, but the household staff header, empty-state guidance, add/refresh tooltips, missing-name/role fallbacks, loading announcement and attendance/payment-history entry labels were still English-only after the Home, Billing, Helpdesk and Guard slices merged through PR #1502.

**Change:** reuse the established eight-language Resident table for twelve Staff entry keys. Preserve exact English labels, name/phone data, assignment/verification/gate-access meaning, role/status enums, existing callbacks and routes, attendance month selection/history, payment/leave/rating mutations, property isolation and theme tokens. The Add tooltip is translated; the existing add form, operational status text and history sheet content are separate remaining localization surfaces. Do not claim full Staff localization or professionally approved translations.

**Validation:** add an eight-language × light/dark 320dp matrix for empty entry and missing-identity cards, exercise the existing attendance destination, and test Hindi/Tamil light/dark at 200% text plus unsupported-locale fallback. Existing localization completeness, workforce mutation recovery and monthly attendance regressions remain required alongside protected Flutter CI. Local execution is unavailable in this session, so test execution evidence must come from GitHub Actions; no local pass is asserted. Native-speaker and physical-device acceptance remain pending.


### V4.99.3.5j large-text interaction harness correction

The first changed-test run passed all 32 normal-size locale/theme cases and English fallback. Four 200%-text cases failed a text-center hit-test immediately after scrolling, without a production overflow exception. Use the actual enabled attendance button, explicitly settle scrolling, and require a real tap to open the month selector. Preserve the 320dp/200% condition and all existing production behavior. The protected rerun must prove the action works; no failing case is removed.


## Slice V4.99.3.2b / 3.6a — Compact operational Admin acceptance matrix

**Verified remaining coverage gap:** the seven migrated workspaces already have desktop opt-in dark/axe coverage and 360/768/1440px light responsive tests. Recreating those completed checks would add no closure evidence. The missing combination is 320px reflow, both themes, 200% zoom, and keyboard traversal across their actual migrated route components.

**Change:** add 28 browser cases (seven routes × light/dark × normal/200% zoom). Reuse the existing isolated API fixtures and real Helpdesk, Privacy, Facilities, Documents, Occupancy, Finance and Governance pages, including selected queue details where needed. Check one main landmark, no viewport horizontal overflow, ready content, enabled keyboard focus/Tab traversal, zero runtime errors and WCAG A/AA axe results. Capture a full-page PNG for each condition in the existing Admin CI evidence artifact. Check that these read-only finance acceptance steps cause no finance mutation.

**Scope:** this adds automated evidence and narrow responsive style corrections described below. It preserves permissions, API, theme preference and brand colors. At 200% browser CSS zoom, a 640px viewport exercises 320px effective reflow, alongside an independent physical 320px CSS viewport at normal scale. This is not physical-device testing, native screen-reader certification, human visual review, hosted integration acceptance or observed user task timings. The milestone remains open for those separately recorded acceptance steps.


### Compact acceptance found real operational overflow

The first protected matrix passed 197/207 browser tests, including 18/28 new scenarios. All ten failures were strict horizontal-overflow checks: Facilities and Finance at 320px in both themes/normal and doubled zoom, plus opened Governance details at doubled zoom. No assertion is relaxed and no page-level overflow is hidden.

Source review identified unwrapped Facilities work-order/action flex rows, Finance's fixed 280px minimum period selector inside a narrower panel, and implicit grid minimum sizing in the shared shell and nested Governance forms/date controls. Permit those layouts to shrink and wrap using zero-minimum grid tracks/controls, wrapping Facilities rows, a maximum-100% Finance selector, and zero-minimum Governance form grids. Keep data fields, order, status and all operational/financial handlers unchanged. The matrix retains diagnostic element bounds on any future overflow so failures identify offending content.
