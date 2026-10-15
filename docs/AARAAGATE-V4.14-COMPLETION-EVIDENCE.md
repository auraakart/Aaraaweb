# Aaraagate V4.14 Completion Evidence

Date: 2026-09-18
Baseline: `9519244f19b50d7996c4b56ae096b0bff9f7d6fa`
Functional closure: `c8f30f7051a88d158462e1c109d37e94ec06b396`
Scope: Repository-only Finance Close & Operator Workflow Depth

## Functional slices

| Slice | PR | Merge commit | Evidence |
|---|---:|---|---|
| Period-close integrity | #670 | `bbcfb63023dc9ede14029dc00d44f3a230860563` | Close-readiness API; FINANCE_READ/FINANCE_MANAGE authorization; period locking; draft blocker; balance defence; closed-period draft rejection; focused tests |
| Close/reporting workspace | #671 | `caee35219dde5a57e1060ea44d0bc7b3251d20c3` | Admin period selector; close-readiness view; explicit irreversible close; trial balance, income/expense, balance sheet and fund statement views; regression contract |
| Finance operator ergonomics | #672 | `c8f30f7051a88d158462e1c109d37e94ec06b396` | Typed liability/journal selection; bounded payable settlement; explicit allocation reversal; typed reconciliation refund/resolution; no-prompt regression contract |

## Accounting integrity evidence

- Close readiness is society- and period-scoped and reports draft/posted/reversed journal counts and ledger debit/credit evidence.
- Period close executes transactionally while holding a period lock.
- Draft journals block closure.
- Posted/reversed totals must balance before closure.
- Closure records `closedAt` and `closedByUserId`.
- Journal draft creation locks/validates the target period so a closed period cannot receive a new draft through a close race.
- Existing immutable accounting and closed-period database invariants remain authoritative.
- Payment-provider transaction truth remains separate from accounting truth.

## Operator workflow evidence

- The Admin Finance close workspace reuses the existing financial-reporting service rather than introducing parallel calculation logic.
- Period closure is never effect-driven or automatic; an authorized operator explicitly triggers it after readiness evidence is visible.
- Expense approval uses active liability-account choices rather than requiring a payable-account UUID.
- Payable settlement uses posted-journal choices and client-side bounds against outstanding payable value while the server remains authoritative.
- Allocation reversal uses an explicit amount/reason form bounded by the reversible amount.
- Payment reconciliation refund and case resolution use visible typed controls rather than transient browser prompts.
- Admin regression checks protect both the close workspace contract and the absence of `prompt()` in the targeted finance surfaces.

## Quality gates

Each functional slice was validated on its exact final feature head before merge. The final heads passed the applicable full non-documentation path including:
- repository structure;
- dependency security;
- Admin regression tests, typecheck and build;
- API Prisma validation/migrations, lint, typecheck, tests, build and production-mode readiness;
- Flutter Resident and Guard analysis/tests;
- Cross-role E2E;
- V2 Security Privacy Review;
- V2 Role UAT Contract;
- V2 Policy Pilot Contract;
- V2 Pilot Acceptance Contract;
- V2 Staging Pilot Execution Contract;
- V4.11 Pilot Readiness Contract.

Development-time failures encountered during V4.14 were confined to newly added test assertions/regression-script quoting. They were corrected without removing production safeguards or weakening required gates.

## Conservative score effect

Only the Accounting/billing/ERP dimension receives a V4.14 evidence increase:
- previous: 8.8
- V4.14 repository evidence: 9.0

The other seven dimensions remain unchanged. Overall repository evidence therefore becomes:
`(9.3 + 9.3 + 9.0 + 8.9 + 9.1 + 9.1 + 9.4 + 8.0) / 8 = 9.0125`, reported as **9.01/10**.

## External evidence still pending

The following are intentionally not claimed by this repository closure:
- Accountant/Treasurer human usability and role acceptance in a real society;
- real-society chart-of-accounts, close-calendar and accounting-policy acceptance;
- live payment-provider reconciliation/refund execution and provider callbacks;
- hosted production/staging operational acceptance beyond repository contracts;
- representative browser/device acceptance;
- tax, statutory or legal certification;
- production monitoring, backup/restore, credentials and release operations;
- measured field financial outcomes.

Production/field readiness therefore remains **8.0** and `main` is not part of this V4.14 repository closure.
