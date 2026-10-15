# Provider Settlement Ledger

Date: 2026-09-18

## Scope

Aaraagate now has an internal provider settlement accounting layer for External Services. This closes the repository gap between captured consumer payments and provider earnings evidence without introducing a real payout-provider integration.

## Commercial split

A platform operator configures `settlementCommissionBps` on the provider commercial profile.

The payment split is calculated only when a consumer service payment transitions to `CAPTURED`:

- `platformFeePaise = round(grossAmountPaise × commissionBps / 10000)`
- `providerAmountPaise = grossAmountPaise - platformFeePaise`

Capture fails closed when no settlement commission is configured. Consumer clients and providers cannot submit or alter the fee split.

## Settlement eligibility

A payment is eligible only when:

- the consumer payment is `CAPTURED`;
- the booking is `COMPLETED`;
- both split amounts are present;
- the payment is not already attached to a settlement entry.

Creating a draft uses an advisory lock per provider and creates immutable entry snapshots.

## Workflow

Settlement batches move through:

`DRAFT -> APPROVED -> PAID`

A draft can also become `CANCELLED`.

Approval and mark-paid operations revalidate the underlying payment and booking evidence. This prevents a refund/cancellation that occurs after batch creation from being paid accidentally.

`PAID` is an **internal reconciliation state**. It means an authorized platform operator recorded a payment reference after an external payout process. Aaraagate does not initiate bank transfers or payout-provider calls in this repository milestone.

## Refund recovery

If a payment enters `REFUND_PENDING` after its provider settlement batch was already marked `PAID`, Aaraagate creates one recovery record for that payment.

Recovery records are:

- provider scoped;
- linked to the original settlement entry and payment;
- amount-equal to the provider portion previously settled;
- OPEN until an authorized platform finance operator records a recovery reference;
- visible read-only to the provider.

This preserves commercial reconciliation without blocking consumer refunds.

## Provider experience

The Provider workspace includes an **Earnings** tab showing:

- paid, approved and draft settlement amounts;
- open recovery amount/count;
- settlement batch history;
- refund recovery history.

Providers cannot approve, pay, cancel or resolve settlements.

## Authorization

Platform reads require `PLATFORM_CONSUMER_PAYMENT_READ`.

Creating/approving/cancelling/marking paid and resolving recoveries require `PLATFORM_CONSUMER_PAYMENT_RECONCILE`.

Provider self-service derives the provider from the authenticated operator mapping and scopes all batch/entry/recovery queries by that provider id.

## Out of scope

The following remain intentionally outside this repository gap-closure slice:

- real payout gateway or banking integration;
- provider KYC/bank-account verification;
- tax/GST/TDS remittance automation;
- payout webhooks;
- production credentials and settlement rails.

Those are real-world integrations/productionization and remain excluded from the mastermind gap-closure scope requested for this phase.
