# Aaraagate V2 — Late Fees and Unapplied Cash

Status: implementation slice

## Purpose
This slice adds controlled late-fee assessment and defines how advance/unapplied cash is represented without introducing a second mutable cash balance.

## Design rules

### Late fees
- Late fees never rewrite the original receivable amount.
- A late fee is a new economic event represented by a `LateFeeAssessment` plus a `ReceivableAdjustment` and balanced posted journal.
- Only non-void receivables with positive derived outstanding balance are eligible.
- Grace days are applied before eligibility.
- `NONE` rules never assess a fee.
- `FIXED` rules use the configured fixed paise amount.
- `PERCENTAGE` rules use configured basis points against the derived outstanding amount as of the assessment date.
- An assessment for the same society/receivable/as-of date is unique, making batch retries safe.
- Assessment preview and apply are separate operations.
- Applying a batch must happen transactionally per assessment so a partially failed batch is observable and recoverable.

### Unapplied / advance cash
Aaraagate does not create a second stored cash-balance field.

For a captured society payment:

`unapplied cash = payment.amountPaise - SUM(receivable allocations)`

This value is derived from payment truth plus append-only allocations.

Consequences:
- a captured payment may remain partially or fully unapplied;
- unapplied cash can later be allocated to an eligible receivable;
- over-allocation is prohibited;
- no background process silently moves cash between receivables;
- refund/reversal workflows must add explicit compensating events instead of deleting allocations.

## Accountant UX requirements
The Admin finance workspace should show:
- captured payment amount;
- allocated amount;
- unapplied amount;
- allocation history;
- receivable outstanding amount;
- late-fee preview counts and totals;
- per-receivable calculation basis;
- explicit apply confirmation;
- batch outcome and failures.

## Audit requirements
Every applied late-fee assessment must retain:
- society;
- receivable;
- charge rule;
- as-of date;
- outstanding basis;
- fee amount;
- resulting adjustment;
- posted journal;
- initiating user/batch.

## Safety boundaries
- no late fee on void or settled receivables;
- no fee before due date + grace period;
- no duplicate same-day assessment for a receivable;
- no fee if an applicable rule is inactive or outside its effective window;
- no posting into a closed accounting period;
- no cross-society references;
- all write operations require `FINANCE_MANAGE` and `SOCIETY_ACCOUNTING` entitlement.

## Next implementation
1. Late-fee preview API.
2. Late-fee apply API with adjustment + journal creation.
3. Unapplied-cash summary endpoint.
4. Admin Accountant/Treasurer finance workspace.
5. Later payment-exception slice for refund/reversal/dispute handling.
