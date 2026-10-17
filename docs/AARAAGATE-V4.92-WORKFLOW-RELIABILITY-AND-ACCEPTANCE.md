# V4.92 — workflow reliability and acceptance

Authorized: owner instruction on 17 October 2026 to consolidate the competitive-review recommendations and proceed continuously. Baseline develop: `945cab4fb4224940b5a16ea7e4e5f51bdfe7f2cc`. Engineering owner: Aaraagate implementation/review; independent product, finance, QA and TEST operators own the external acceptances below.

Target: develop only. Staging/main remain at the separately approved previous promotion. Version identity: root/API/Admin `4.92.0`; Resident/Guard `4.92.0+49200`. No automatic promotion or demo rebuild follows from this cycle.

## Execution and stop condition

Mastermind workflow: inspect current code before adding work, fix demonstrated gaps sequentially, run focused regressions first, then one consolidated implementation PR with full protected milestone CI. Allow one documentation-only evidence closure if needed. Stop after the three engineering slices and current-state reconciliation pass and merge; no automatic chain of readiness wrappers or speculative features. CI fixes remain narrowly scoped to failures. Do not infer field results or a higher score from test counts.

| Slice | Demonstrated gap and implementation | Acceptance |
| --- | --- | --- |
| V4.92.1 Onboarding/import adoption | Onboarding retained old progress on failure and accepted old-context responses. Import allowed mutable inputs while preview/file reads were pending and accepted late results/callbacks. Bind reads to sign-in/society/role, clear invalidated data, serialize operations and freeze inputs. CSV duplicate headers/extra cells previously discarded data; reject ambiguity and preserve quoting/source provenance. Simplify onboarding copy. | Browser regressions for changed society, replacement login, denied role, failed refresh/recovery, stale preview/batch, frozen source and CSV preservation/rejection. Server validation/authorization and dry-run scope remain authoritative. |
| V4.92.2 Assistant money truth | `Number(null)`, blank strings and booleans could become a claimed zero amount; fractional/unsafe paise could be rounded. Accept only nonnegative safe whole-paise numbers or decimal digit strings; absent/malformed values say amount unavailable. | Actual answer composition tests for malformed values, safe numeric strings, genuine zero and retained pending-payment/face-value disclaimers. This is a bounded factual-quality regression set, not measured general language accuracy. |
| V4.92.3 Guard workforce recovery | Overlapping searches could replay the same queue concurrently; replay loop could continue after mutable guard/token/gate context changed. Share one in-flight replay, check context before each request/storage/UI completion, retain original retry identities on interruption, prevent duplicate household actions and suppress stale mutation feedback. | Widget regressions for overlapping replay and sign-in/society switch mid-replay, plus existing conflict/backoff, assignment, context and accessibility suites. No offline arrival authority, new attendance engine or field-reliability certification. |

## Consolidated recommendation disposition

| Recommendation | Work in this cycle | Remaining independent acceptance |
| --- | --- | --- |
| Highest-frequency resident/guard journeys | Fix the demonstrated guard replay/context defects and extend actual regression fixtures. Reuse current visitor, staff, parcel, dues and complaint workflows. | Representative residents/guards on two device classes; completion-time, TalkBack/large-text, notification and offline observations. No physical test was executed by this document. |
| Services commercial completion | Retain the existing Services 4.5 product decision register; no parallel checkout/readiness model. | Product/finance/legal accept seller/invoice owner, parts/labour/tax treatment, extra-work consent, cancellation/refunds and category-specific rework terms before chargeable execution. No policy value is invented. |
| Accountant acceptance | Preserve existing ledger, concurrency and finance-recovery work; do not reopen completed #1387 or Services 3.1. | Independent accountant/treasurer reviews representative owner/tenant payment, partial settlement, refund/reversal, reconciliation, period close and Tally examples. CI is not accountant signoff. |
| AI quality benchmark | Add adversarial money-fact cases against the real composer, retain existing source/no-evidence and tenant/role suites. | Curated representative questions and independently reviewed answers. Resident Assistant stays English-only per V4.91.1; multilingual Helpdesk/Guard behavior remains separate. No arbitrary multilingual Assistant expansion or autonomous action. |
| Adoption/support | Repair the existing onboarding/import workflow and preserve its server-derived next actions. No duplicate configuration or import engine. | Human onboarding, permission setup, import/recovery and daily-role walkthroughs with representative anonymized data. |
| V5 partner completion | Reference current canonical manifest and #1380, retain existing safe default branding and partner boundaries. | Independent TEST registry/runner/observer, exact source/image/toolchain/trust pins, measured runtime evidence, explicit TEST build authority, real signed Partner A/B artifacts and device acceptance. No repository-only wrapper counts as external progress. |
| Capability truth | Refresh the capability entry point and README; preserve historical milestone documents. | Update current state only when new concrete implementation/acceptance evidence exists. The competitive-review range is provisional judgment, not an earned engineering re-score. |
| Essential-action focus | Keep existing Home/Gate/Services/Community/Profile navigation and Staff/Billing/Amenities/Helpdesk quick actions. | No unsolicited advertising, biometric feature, paid ranking, benefits wallet or navigation redesign. |

## Validation state

Implementation candidate; protected CI not yet claimed. Focused local execution imports the actual pure TypeScript amount/CSV modules with the available Node runtime; required CI uses supported Node 22 and pinned pnpm. Local Flutter execution and dependency/browser bootstrap are not retried after the earlier environment/review failures; use the existing isolated protected workflows for API/Admin/Flutter/browser validation. No tests are weakened or skipped to obtain a merge.

No new API route, database schema, payment/invoice/settlement mutation, public quality score, rework guarantee, partner build authorization, productionization, physical hardware or iOS launch is included. Independent acceptance entries remain OPEN until their actual owners record evidence.
