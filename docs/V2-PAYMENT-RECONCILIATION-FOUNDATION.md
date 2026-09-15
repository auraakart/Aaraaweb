# Aaraagate V2 Payment Reconciliation Foundation

## Purpose

Aaraagate must keep payment-gateway state separate from accounting truth. Gateway responses are external transaction evidence; posted journals, receivable allocations, allocation reversals and recorded refunds remain the auditable financial history.

## Provider-neutral model

`PaymentGatewayOperation` records asynchronous gateway work such as status queries and refund requests. The model stores provider identity and provider operation IDs without embedding any provider-specific payload into finance-domain tables.

`PaymentReconciliationCase` represents a mismatch or unresolved comparison between Aaraagate's expected payment economics and the provider's observed state.

## Core rules

- gateway operations are idempotent per society;
- operation identity and economics are immutable after creation;
- operation history cannot be deleted;
- provider status may advance as callbacks/polls arrive;
- only one unresolved reconciliation case may exist for a society/payment pair;
- reconciliation cases never rewrite captured payments, allocations, refunds or journals;
- refund execution is a gateway concern, while refund financial recognition remains append-only in the existing payment-exception domain;
- society/tenant boundaries are enforced with composite payment references.

## Reconciliation sequence

1. derive expected captured/refunded/net state from Aaraagate records;
2. query the configured gateway adapter;
3. persist provider evidence;
4. mark MATCHED when the evidence agrees;
5. create or update a MISMATCH/ACTION_REQUIRED case when it does not;
6. resolve only after the corrective financial or provider action is complete and auditable.

## Next implementation slice

Add the adapter interface and reconciliation service/API for status refresh, mismatch listing, resolution, and linking provider refund results back to the existing append-only `PaymentRefund` records.
