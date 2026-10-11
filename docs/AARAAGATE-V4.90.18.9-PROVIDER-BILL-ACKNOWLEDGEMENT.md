# V4.90.18.9 — Provider acknowledgement of separate bill request

**Baseline:** develop `e997daa4f8dedeb0568f8c500c0de9241d8d6cd6` after V4.90.18.8.

## Root cause and bounded fix
An approved quotation and explicit resident request for a separate bill are recorded, but providers have no auditable way to acknowledge receiving that request. That leaves residents uncertain whether a provider has seen it. This slice closes that communication gap **without** claiming an invoice or payable order exists.

## Implemented
- Provider-authenticated POST `/provider/services/bookings/:bookingId/extra-work-billing-requests/:requestId/acknowledge` checks provider ownership before reading the request, locks booking then request, and inserts an immutable single receipt linked to the bill request. Exact retry returns the prior receipt without another booking event. New acknowledgements are blocked after cancellation.
- The resident/provider scoped existing bill-request lists expose `providerAcknowledgedAt` without leaking operator identities.
- Provider web booking UI has an explicit **Acknowledge bill request** action and safe retry. Resident Flutter shows requested vs acknowledged status.
- Consumer subject-data access export exposes acknowledgement timestamp through the existing bill-request entry.
- Forward-only table with uniqueness, FK relationships and immutable trigger; focused authorization, replay, no-financial-side-effect and cancellation tests.

**Boundary:** Acknowledgement means the provider saw the resident's request. It is NOT agreement that the work is chargeable, issuance of an invoice, a tax calculation, payment order, refund, commission or provider settlement. The original booking amount remains unchanged. Actual independently payable invoice/order model, GST validation, reconciliation and field UAT remain separate follow-up slices.

Required exact-head CI API/Admin/Flutter/security gates before develop-only merge; staging and main untouched.
