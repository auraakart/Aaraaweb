# Services 3.1 — V4.90.18 engineering scope closure

**Status:** CLOSED_FOR_NEW_SERVICES_3_1_FEATURES
**Cutoff:** V4.90.18.10
**Baseline:** develop b9c2fe6021083f48fe673920cea1a532dc3301e4 after [PR #1194](https://github.com/auraakart/Aaraaweb/pull/1194) on 2026-10-11.
**Promotion:** develop only. No staging/main promotion is authorized here.
**Finance:** NOT_AUTHORIZED_FOR_EXTRA_WORK_INVOICING_OR_PAYMENT.

## Root cause

The original V4.90.4 Services 3.1 roadmap covered quotations, booking changes, provider disputes/continuity, guarantees and safe repeat booking. V4.90.18 continued into consent retries, text evidence, separate-bill requests, provider acknowledgement and a non-payable billing draft. Although each PR listed exclusions, **no aggregate stop condition** distinguished completing Services from starting a Finance, Privacy, settlement, invoice and UI program.

**Correction:** close the Services 3.1 engineering feature sequence at V4.90.18.10. Preserve completed behavior and the immutability, authorization and consent controls. Do not authorize new finance requirements simply because the preceding step was delivered.

## Frozen deliverables and traceability

| Scope | Evidence | Firm limit |
|---|---|---|
| Safe repeat booking and provider booking modifications | V4.90.4 roadmap and [#1185](https://github.com/auraakart/Aaraaweb/pull/1185) | Idempotent rebooking, transactional proposal/cancellation protection; no parallel booking engine |
| Extra-work quotation and explicit resident decision | [#1186](https://github.com/auraakart/Aaraaweb/pull/1186), [#1187](https://github.com/auraakart/Aaraaweb/pull/1187), [#1188](https://github.com/auraakart/Aaraaweb/pull/1188) | Provider authoring/review/withdrawal, resident approval/decline; no auto-charge or original-price change |
| Lost-response retries | [#1189](https://github.com/auraakart/Aaraaweb/pull/1189), [#1190](https://github.com/auraakart/Aaraaweb/pull/1190) | Same-decision receipts and session-isolated provider same-tab reload recovery; not cross-device offline storage |
| Dispute history and evidence exchange | [#1185](https://github.com/auraakart/Aaraaweb/pull/1185), [#1191](https://github.com/auraakart/Aaraaweb/pull/1191) | Authenticated, scoped text/reference evidence and review read access; no photo/file pipeline or live adjudication |
| Non-payable billing preparation | [#1192](https://github.com/auraakart/Aaraaweb/pull/1192), [#1193](https://github.com/auraakart/Aaraaweb/pull/1193), [#1194](https://github.com/auraakart/Aaraaweb/pull/1194) | Bill request, provider acknowledgement, isolated **non-payable** draft only. **Not** an invoice, receivable, payment order, charge, refund or settlement |
| Privacy and UI impacts | [#1191](https://github.com/auraakart/Aaraaweb/pull/1191) through [#1194](https://github.com/auraakart/Aaraaweb/pull/1194) | Only necessary privacy access/export/erasure consequences and direct workflow surfaces; not a new Privacy or premium UI program |

The final PR implementation head e78c9cadba3c3552f7d1bc0284c0f7cb7640c5ba passed Repository structure, Mastermind preflight, API, Admin, Flutter, security and merge gates before develop merge. Earlier slices were also merged under their required gates. This evidence does **not** demonstrate live field outcomes or real-device accessibility.

## Exit criteria and residual risk

1. **Engineering implementation boundary: CLOSED.** V4.90.18.1–.10 are merged and Services 3.1 remains closed. The explicitly owner-authorized, read-only independent Finance handoff V4.90.18.11 below does not reopen Services. No V4.90.18.12+ sequence, dependency-driven expansion or next-slice autopilot.
2. **Safety invariants: ACTIVE.** Immutable original booking price/payment, authenticated consumer/provider ownership, privacy minimization, safe consent/retries and separate extra-work draft identity stay enforced.
3. **Product/field acceptance: NOT VERIFIED.** Run independently tracked role UAT for repeat booking, cancellations and schedule changes, quote consent/withdrawal, disputes, resident/provider errors and recovery; test large text, keyboard/TalkBack and device behavior. A defect is a narrowly scoped fix with regression evidence, not a new feature sub-slice.
4. **Scope-specific interface work: DONE AS IMPLEMENTED.** Premium UI modernization belongs to the separate V4.90 UX track. Existing guarantee/warranty promises remain authoritative; no new provider underwriting is claimed.
5. **Release: NOT PROMOTED.** This is a develop-scope closure only. Staging, main, hosted acceptance, provider field validation and updated quality scoring are independently gated.

## Downstream work: separate epics, NO implicit approval

- **Finance / independently payable extra work:** first obtain product, finance and security decisions for seller/buyer and GST ownership, invoice requirements and numbering, fresh payer authorization, wholly separate order/payment identity, duplicate-charge prevention, refunds/chargebacks, accounting and provider share/settlement. Then specify tests, audit evidence, data migration, review owners, cost and a hard stop. No actual invoice/payment/settlement code is authorized by this closure.
- **Privacy:** new lifecycle behavior only after an independently accepted gap assessment; the already necessary access/erasure treatment of Services records stays intact.
- **Settlement/payout:** separate policy, ledger/reconciliation and segregation-of-duties review. A non-payable draft cannot become a settlement instruction.
- **Invoices and tax:** separate legal/finance acceptance; do not label the current draft an invoice.
- **Cross-application UX:** existing UX track, not an extension of Services 3.1.

Every newly approved workstream needs a **single accountable owner, objective, included/excluded scope, acceptance evidence, stop condition and PR budget** before implementation. A completed dependency does not approve the next dependency.

## Repo gate and exceptions

**Exception:** V4.90.18.11 — ONE_APPROVED_READ_ONLY_FINANCE_HANDOFF. On 2026-10-11 the owner explicitly authorized only a bounded independent Finance evidence endpoint, its tests, documentation and closure exception. This is **not** authorization for invoice issuance, payment orders, tax, payouts, migrations, resident data expansion or UI redesign. The exception matches one exact PR title and branch only; see [V4.90.18.11](AARAAGATE-V4.90.18.11-INDEPENDENT-FINANCE-HANDOFF.md).

Required Repository structure CI runs the Services 3.1 closure check, rejecting new PR titles/head branch labels above .10 except the exact owner-authorized one-time .11 Finance handoff. This **narrow version guard** does not replace semantic PR review: a renamed PR that introduces invoices, payments, settlements or broad Privacy/UI features without a separately authorized workstream is equally out of scope.

Correctness or security hotfixes of existing Services behavior are permitted as separately scoped bugfixes with exact-head regression gates and unchanged no-charge/no-reprice rules. They do **not** reopen feature development.

No future work is approved by this closure document.
