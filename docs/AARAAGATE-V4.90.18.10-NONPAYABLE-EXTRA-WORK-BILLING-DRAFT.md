# V4.90.18.10 — Non-payable separate extra-work billing draft

**Baseline:** develop `e859b07d5ad8ad8cf26fd4fd118b6aac4abf70f2` after V4.90.18.9.

## Bounded gap
After the provider acknowledges the resident's explicit separate-bill request, there is no isolated record for provider invoice preparation. Reusing the one-active-payment-per-booking model would conflate original service price with extra work.

## Implementation
- Provider POST `/provider/services/bookings/:bookingId/extra-work-billing-requests/:requestId/prepare-draft` creates **one immutable, non-payable billing draft** for an approved quote, matched bill request and provider acknowledgement. Booking is locked before request; provider ownership, quote status and immutable paise amount are verified server-side.
- Draft contains original request/quote/booking/provider/resident identifiers, INR amount and preparation timestamp. Duplicate requests recover the exact receipt without duplicate audit events; new preparation on a CANCELLED booking is refused.
- Existing provider and resident billing-request endpoints expose only `nonPayableDraftPreparedAt`, not private operator details. Provider UI lets an operator prepare this draft explicitly; resident UI calls it **non-payable**, not a tax invoice or successful charge.
- Consumer data-subject access export includes this timestamp. Forward-only migration has one-draft-per-request uniqueness, FKs, amount limits, currency/status checks and an immutability trigger.
- Focused tests cover ownership, prior acknowledgement, retries, cancellation, amount conflict, exact locks, audit trail and absence of payment/repricing.

## Explicit exclusions
No taxable invoice issuance, invoice number, GST rate or tax calculation, payment authorization/order, gateway integration, receivable posting, refunds, commission allocation, settlement or payout. No mutation to original booking price/payment. Finance-approved independent invoice and payable order models are still required before money may move.

## Process
Single bounded PR, whitespace/preflight tests before merge, required exact-head CI including API/Admin/Flutter and security. Develop only; staging/main unchanged.
