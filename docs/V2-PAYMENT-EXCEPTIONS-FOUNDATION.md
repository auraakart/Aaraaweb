# Aaraagate V2 Payment Exceptions Foundation

## Objective

Handle allocation mistakes and payment refunds without deleting settlement history or rewriting captured gateway transactions.

## Accounting model

`Payment` remains the gateway transaction truth. V2 exception handling adds compensating, append-only events:

- `ReceivableAllocationReversal` reverses all or part of an existing receivable allocation.
- `PaymentRefund` records cash returned against a captured payment.

The effective payment allocation is:

`gross allocations - allocation reversals`

The payment amount still available for either allocation or refund is:

`captured payment - net allocations - refunds`

The receivable outstanding amount is:

`original charge + debit adjustments - credit/waiver adjustments - net allocations`

## Safety invariants

1. Allocation reversal amount must be positive and cannot exceed the unreversed portion of the source allocation.
2. Refund amount must be positive.
3. Refunds are permitted only for captured payments.
4. A refund cannot exceed unallocated refundable cash. If money is still allocated to a receivable, the allocation must be reversed first.
5. New allocations consider prior refunds and allocation reversals when deriving available captured cash.
6. Allocation reversal and refund events are append-only. They cannot be updated or deleted.
7. Idempotency keys are unique within a society so retried commands cannot duplicate financial effects.
8. All payment/allocation references remain society scoped.
9. Allocation reversal recalculates receivable status from derived economics. It may move a receivable from SETTLED back to PARTIALLY_SETTLED or OPEN.
10. The gateway `Payment.status` is not rewritten to represent accounting exceptions. Gateway state and accounting correction history remain separate concerns.

## Operational sequence for refunding allocated cash

1. Operator identifies the payment and its allocation history.
2. Reverse the required allocation amount with a reason and idempotency key.
3. Receivable outstanding/status is recalculated automatically.
4. Record the refund against the now-unallocated portion of the captured payment.
5. Store the payment-provider refund reference when available.

This ordering prevents a refund from silently leaving a receivable marked as paid after its cash has been returned.

## Authorization target for the API slice

- viewing exception history / refundable availability: `FINANCE_READ`
- reversing allocations / recording refunds: `FINANCE_MANAGE`
- all endpoints: `SOCIETY_ACCOUNTING`

## UI target

The Accountant/Treasurer Finance workspace should provide:

- payment availability including gross allocation, reversed allocation, net allocation, prior refunds and refundable amount;
- allocation history with reversible balance per allocation;
- explicit reverse-allocation action requiring a reason;
- explicit record-refund action requiring amount, reason, idempotency key and optional provider reference;
- clear warning that allocated cash must be reversed before refund.

## Future gateway integration

This foundation records accounting-domain refund truth. A later provider adapter may initiate Razorpay/other gateway refunds and then record the provider reference. The provider call must be idempotent and reconciliation must detect a provider refund that has not yet been represented by a `PaymentRefund` event.
