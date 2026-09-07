# Consumer service payment readiness

## Objective

Prepare independent-home service bookings for safe payment integration without coupling the consumer marketplace to society maintenance billing or committing to a gateway before the payment contract is stable.

## Architecture boundary

Independent-home payments are a separate aggregate:

`User -> ConsumerServiceBooking -> ConsumerServicePayment -> ConsumerServicePaymentEvent`

They must not reuse or require society billing entities such as `MaintenanceInvoice`, society-scoped `Payment`, `societyId`, `unitId`, or society reconciliation permissions.

The existing society billing flow remains unchanged.

## Financial snapshot

A payment is created from the authoritative booking snapshot, never from client-provided amounts.

Initial monetary fields:

- grossAmountPaise: service amount charged to the consumer;
- platformFeePaise: Aaraagate platform fee/commission amount;
- providerAmountPaise: amount attributable to the service provider before any later payout adjustments;
- currency: `INR` in the India-first milestone.

Invariant:

`grossAmountPaise = platformFeePaise + providerAmountPaise`

For this readiness milestone, fee policy must be server-defined. The client cannot submit or alter price, fee, commission, provider amount or currency.

## Payment state model

Payment intent lifecycle:

`CREATED -> PENDING -> CAPTURED`

Failure/refund branches:

- `CREATED -> FAILED`
- `PENDING -> FAILED`
- `CAPTURED -> REFUND_PENDING -> REFUNDED`

Terminal-state mutations must be rejected unless explicitly defined by server-side transition policy.

The readiness layer is gateway-neutral. `provider` and provider reference fields may remain nullable until a real gateway adapter creates them.

## Booking relationship

A payment belongs to exactly one independent `ConsumerServiceBooking` and the payer must be the authenticated booking owner.

Payment amount comes from the immutable booking `servicePricePaise` snapshot. A later catalogue price change must never alter an existing booking/payment amount.

A booking may have multiple payment attempts over time, but at most one active non-terminal payment intent should exist for the same booking and payer at a time.

## Idempotency

Consumer payment creation requires an idempotency key.

The key is scoped to authenticated user + booking. Reusing the same key for the same booking returns the existing payment; using it for another booking is rejected.

Gateway webhook/event idempotency is separate and must use the provider event identifier once a gateway is integrated.

## Cancellation and refund policy boundary

This milestone does not automatically refund every cancelled booking. It defines the contract only:

- cancellation before capture: payment intent may be failed/cancelled without refund;
- cancellation after capture: refund eligibility is decided by server policy and becomes an explicit refund workflow;
- a booking refund must never be inferred solely from client state;
- fulfilment and payment state remain separate state machines connected by server policy.

Exact commercial refund windows/penalties remain deferred until product policy is approved.

## Settlement boundary

Provider payout/settlement is not implemented in this milestone.

The payment record stores the provider-attributable amount so a later settlement ledger can be introduced without recomputing historical economics.

Future settlement must be append-only/auditable and must not mutate captured consumer payment history.

## Audit events

Every payment mutation records an append-only event with:

- payment id;
- actor user id when applicable;
- event/action;
- from status;
- to status;
- provider event id/reference when applicable;
- occurredAt.

Consumer-facing reads must only return payments belonging to the authenticated consumer's bookings. Platform reconciliation/audit access must use separately authorized platform permissions and must not inherit society tenant scope.

## Initial APIs

Gateway-neutral readiness APIs:

- `GET /api/v1/consumer/services/payments`
- `GET /api/v1/consumer/services/bookings/:bookingId/payments`
- `POST /api/v1/consumer/services/bookings/:bookingId/payments`

The creation endpoint establishes a payment intent only; it does not pretend a real gateway order/payment exists.

A later gateway milestone may add provider-session/order creation and signed webhook reconciliation behind the same aggregate.

## Security invariants

- authenticated user identity is derived from Bearer auth;
- booking ownership is checked server-side;
- amount/currency/fee/provider split are derived server-side;
- no client-supplied payment status;
- no client-supplied actor user id;
- no society identifiers in consumer payment tables or APIs;
- independent payment APIs do not use `TenantGuard`;
- platform payment/reconciliation controls require dedicated platform permission rather than society `PAYMENT_RECONCILE`;
- all state changes are transactional and append an event.

## Tests

Required readiness coverage:

- user cannot create payment for another consumer's booking;
- amount is copied from immutable booking snapshot;
- idempotent retry returns same payment;
- idempotency key cannot be reused against another booking;
- only valid payment transitions succeed;
- terminal states are protected;
- payment history is consumer-owner scoped;
- independent payment paths contain no society/unit/invoice identifiers;
- society billing regressions remain green.

## Deferred

- gateway choice and SDK;
- production credentials/webhooks;
- UPI/cards/netbanking UI;
- automated refund rules;
- provider payout/settlement execution;
- GST/TDS/compliance ledger details;
- promotions/coupons;
- dynamic pricing;
- infrastructure/hosting decisions.
