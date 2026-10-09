# Aaraagate V4.90 — Competitive Excellence (non-production)

**Basis:** `develop` V4.89.14, commit `14f5909b0fb14e2e779dcf6b69346a945e2b504f`.
**Release policy:** Feature branches → `develop`; a single consolidated staging candidate after gates, `main` only with independent reviewer approval and explicit owner authorization. No hosting, provider activation, hardware certification, iOS launch or production deployment is implied.

## Scope and evidence-oriented sequence

| Slice | Objective | Required completion evidence |
|---|---|---|
| V4.90.1 Gate and workforce | Guard search/refresh context isolation, duplicate/uncertain writes, denied-entry/no-response and offline replay journeys | Guard widget & API authorization tests, repeated rapid refresh/switch tests, cross-role gate smoke |
| V4.90.2 Finance accuracy | Owner/tenant two-payer race, statement imports, duplicate receipts, partial payments, refunds/reversals, period closing and Tally export | Migrated PostgreSQL concurrency tests, independent accounting trace, zero unverified success |
| V4.90.3 Premium UX | Resident/Guard/Admin keyboard, 320px/200% text, screen-reader semantics, dark/light/reduced motion and recovery | Flutter/Playwright automated regressions plus separately recorded two-device Android acceptance |
| V4.90.4 Services 3.1 | Quotation transparency, booking changes, provider dispute/continuity, guarantees, repeat booking | Consumer/provider/admin boundary tests, price immutability and gate authorization |
| V4.90.5 Society Copilot | Source references, no-evidence responses, multilingual follow-ups, safe action proposals, tenant/owner permissions | Adversarial and cross-property tests, factual answer quality set, consent evidence |
| V4.90.6 Maintainability | Bounded high-coupling files, data isolation and representative performance, documentation truth | Targeted refactors, PostgreSQL tests, measurement on exact final head, CI and closure score |

Existing features take precedence over new abstractions. Preserve current occupant gate routing, owner + tenant dues, private payer history, guard fail-closed behavior, segregated workforce roles, immutable finance evidence, and society authorization. No double booking/payment engines.

## V4.90.1: first bounded change

**Root cause:** `GuardWorkforceScreen._load` consulted the mutable controller gate ID and search text after asynchronous operations. Requests started for an older gate/search/session could write their results after newer requests; `gateId!` could fail when the gate disappeared in flight.

**Change:** snapshot gate, authenticated session and query per load; use a monotonically increasing load epoch, reject stale responses/errors/finalizers, clear stale worker records at refresh start or absent gate/session. Keep the existing secured attendance queue and server authorization unchanged.

**Regression:** `apps/guard/test/guard_workforce_context_test.dart` tests out-of-order searches across gates and clearing worker rows when no gate is active.

**Current status:** code and tests proposed on the V4.90.1 feature branch. Flutter execution, CI, physical-device testing, full Gate workflows, finance and later slices are **not yet claimed passed**. Do not treat this as full V4.90 completion or assign a new competitive score.

## V4.90.2: finance integrity — first bank statement slice

**Root cause:** bank imports and bank-statement previews compared same-key retries using date, direction and amount only. A repeated bank external key could therefore silently accept changed value date, remittance reference or description, misrepresenting immutable imported statement provenance.

**Change:** require exact canonical value-date and trimmed reference/description fingerprint agreement as well as existing money/transaction checks. Read these columns in existing-import and preview queries; preserve society/bank-account SQL scoping, the existing idempotent insert conflict boundary, and accounting journal immutability. Matching whitespace around a stable bank reference is not a conflict.

**Regressions:** import duplicate metadata mismatch, normalized identical retry, preview mismatch. This remains a *bounded* first V4.90.2 finance improvement: owner/tenant payment races, reversals, Tally acceptance and complete finance scenarios still need exact-head verification and review. No automatic bank matching or posting is added.

## V4.90.3: Guard workforce accessibility — first bounded UX slice

**Root cause:** repeated `ENTER` and `EXIT` buttons in the Guard workforce list did not identify the worker or household unit. This made similarly named controls ambiguous when many assignments were on screen.

**Change:** add descriptive button semantics for society workforce and both household attendance actions, including the worker name and building/unit. Preserve visible concise labels, action callbacks, eligibility and gate authority. Dark/light widget tests assert distinct action labels.

**Not claimed:** end-to-end TalkBack voice output, 320px/200% text on real devices, complete Resident/Admin accessibility acceptance or any physical-device certification. Those require separate evidence.

## V4.90.4: Services 3.1 — safe repeat booking (bounded slice)

**Root cause:** the repeat-booking API delegated to the existing idempotent booking engine without forwarding a retry identity; the Resident service-history button omitted a key. If a booking succeeded server-side but its response was lost, a repeated user attempt could create another booking.

**Change:** an optional validated `idempotencyKey` flows through the existing rebooking route to the authoritative `ConsumerBookingsService`. The Resident service-history screen uses a device-memory attempt registry keyed to original booking + selected slot. Retry of the same unconfirmed attempt keeps the same unpredictable key; a confirmed booking clears it. Concurrent taps for one booking are ignored. Existing booking availability, current price, serviceability and active-property authorization remain authoritative.

**Tests:** service forwarding for society-unit rebooking and a pure Flutter registry test covering stable retries, changed schedules and post-success reset.

**Limitations:** stability is screen-session scoped, not persisted across app restarts; this does not deliver a server-quoted final price, approved extra-work quotation, automated recurring booking, real provider guarantees or live integration acceptance. Full Services 3.1 flows remain open.

## V4.90.5: permission-grounded society policy Q&A — first bounded slice

**Root cause:** the knowledge-intent recognizer missed everyday reversed-word-order visitor questions such as “rules for visitors” and questions about permission, entry pass or after-hours access. Those could fall through to generic/visitor status without querying published society rules.

**Change:** expand the deterministic knowledge-intent patterns for public visitor/guest/delivery rules and access conditions; preserve the explicit suppression of a resident's private pass/activity queries, runtime tenant permission checks, document audience filtering and no-evidence fallback. The recognizer invents no society policy and does not supply new multi-turn memory.

**Tests:** extend the existing assistant service's published-source/no-answer matrix with common rule queries, plus a private visitor pass negative regression. Exact-head CI remains mandatory.

**Not claimed:** arbitrary multilingual chat, complete physical voice UAT, complete society FAQ corpus, or private knowledge sharing between properties.

## Completion rules

Validate exact PR-head checks before merging to `develop`. A partial or unrelated passing workflow is insufficient. For every future slice, record changed files, executed checks, unverified assumptions, residual risks and branch/PR references. Do not increase scores until acceptance criteria are satisfied.
