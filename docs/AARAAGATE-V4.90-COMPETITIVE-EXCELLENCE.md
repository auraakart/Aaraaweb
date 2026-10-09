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

## Completion rules

Validate exact PR-head checks before merging to `develop`. A partial or unrelated passing workflow is insufficient. For every future slice, record changed files, executed checks, unverified assumptions, residual risks and branch/PR references. Do not increase scores until acceptance criteria are satisfied.
