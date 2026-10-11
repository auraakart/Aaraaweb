# V4.90.18.11 — Independent Finance handoff (read-only)

**Status:** One-off approved Finance follow-on. Services 3.1 remains CLOSED at V4.90.18.10.
**Baseline:** develop cd751be4916c1e34d8b3664e1ac5c03672f44ff6.
**Authorization:** User explicitly requested V4.90.18.11 on 2026-10-11.
**Stop condition:** One provider-authenticated GET evidence read-model, focused tests, hard-stop guard and this document. No automatic .12.

## Outcome

Provider endpoint: `GET /api/v1/provider/services/bookings/:bookingId/extra-work-billing-requests/:requestId/finance-handoff`.

- Provider identity and original booking ownership are checked before request lookup. Request, quote and provider must match; resident request must belong to the booking owner.
- Read-only JOIN of quote/approval, bill request, acknowledgement and isolated non-payable billing draft; compare original amount (integer paise), quote approval actor, draft amount, INR currency and DRAFT status.
- Return scoped booking, request, quote and non-payable draft IDs plus status and stable blocker codes for missing/mismatched evidence. Do not return resident identity or bank/payment details.
- Even with complete evidence, the only handoff state is `FINANCE_POLICY_APPROVAL_REQUIRED`. Explicitly return `NOT_GRANTED` finance approval, `NOT_ISSUED` invoice, `NOT_CREATED` payment order and `NOT_AUTHORIZED` settlement.
- No writes, migrations, GST, legal invoice, payable order, gateway calls, original booking payment/price mutation, settlement, data-subject expansion or provider/resident UI additions.

## Validation

Provider/booking/request cross-authorization, original user consent, exact approved quote amount, missing acknowledgement/draft, immutable draft amount/currency consistency, zero SQL writes and no false financial readiness. Required PR-head API/Admin/Flutter/structure/security merge gates.

## Explicit exclusions and completion boundary

Product/Finance/Legal/Security decisions on legal seller, GST, invoice numbering, independent payment authorization, tax, refunds/chargebacks, ledger postings and payout/settlement are **not approved or implemented**. Follow-on .12 is blocked pending independent authorization. No field UAT or production claim. This .11 is complete once the read-only contract and tests merge to develop.
