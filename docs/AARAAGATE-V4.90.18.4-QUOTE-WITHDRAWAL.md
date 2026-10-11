# V4.90.18.4 — Withdraw an unaccepted extra-work quote

**Baseline:** `develop` 2392e42cd7935e36544b1442cdb754bad371ac30 after verified V4.90.18.1–V4.90.18.3 merges.

## Specific workflow gap
The provider workspace supports quotations and resident approval, but cannot withdraw an erroneous or obsolete **PENDING** extra-work quote. One pending quote blocks a corrected replacement. Providers should not ask a resident to decline known-invalid work.

## Change
- Provider-authenticated POST `/provider/services/bookings/:bookingId/extra-work-quotes/:quoteId/withdraw` with required reason (3–500 characters). Provider ownership is verified before fetching the quote.
- Transaction locks booking **before** quote (same order as resident consent) to serialize resident acceptance versus provider withdrawal. Only pending quotes can be withdrawn. APPROVED and DECLINED remain permanent; prior identical withdrawal retries return the original receipt, while changed reasons conflict.
- The existing immutable economic evidence trigger continues to guard scope and amount, and a forward-only constraint migration allows WITHDRAWN with actor, time and reason.
- Append the `PROVIDER_WITHDREW_EXTRA_WORK_QUOTE` booking timeline event. Resident and provider history endpoints already list all statuses. Provider workspace now displays the reason and a **Withdraw pending quote** action.
- No automatic price mutation, payment, financial settlement or rewriting of consent.

## Validation
Regression tests cover ownership, validation, locking, resident-decision integrity, event insert and lost-response idempotency. Forward migration and full API/Admin checks must pass exact-head CI required gates before merging to develop. Staging/main remain untouched.

## Unfinished Services 3.1 items
Real provider/resident field UAT; durable reload-safe local quote drafts, rich dispute evidence exchange, representative financial acceptance for **separate** approved extra-work billing; offline integration and productionization remain separate.
