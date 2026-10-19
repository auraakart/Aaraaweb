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
