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
- platformFeePaise: optional readiness field for the future Aaraagate fee/commission snapshot;
- providerAmountPaise: optional readiness field for the future provider-attributable amount;
- currency: `INR` in the India-first milestone.

The current readiness layer snapshots `grossAmountPaise` from the immutable booking amount and intentionally leaves the fee/provider split unset until a commercial fee policy is approved. This avoids inventing a commission percentage in code. Once assigned, both split fields must be present and satisfy:

`grossAmountPaise = platformFeePaise + providerAmountPaise`

The client cannot submit or alter price, fee, commission, provider amount or currency.

## Payment state model

Payment intent lifecycle:

`CREATED -> PENDING -> CAPTURED`

Failure/refund branches:

- `CREATED -> FAILED`
- `PENDING -> FAILED`
- `CAPTURED -> REFUND_PENDING -> REFUNDED`

Terminal-state mutations must be rejected unless explicitly defined by server-side transition policy.

The readiness layer is gateway-neutral. `provider` and provider reference fields remain nullable until a real gateway adapter creates them.

## Booking relationship

A payment belongs to exactly one independent `ConsumerServiceBooking` and the payer must be the authenticated booking owner.

Payment amount comes from the immutable booking `servicePricePaise` snapshot. A later catalogue price change must never alter an existing booking/payment amount.

A booking may have a replacement attempt after a failed payment, but the database prevents more than one active/captured payment record for the booking at the same time.

## Idempotency

Consumer payment creation requires an idempotency key.

The key is scoped to the authenticated user. Reusing the same key for the same booking returns the existing payment; using it for another booking is rejected. The database independently enforces that user/key uniqueness so concurrent requests cannot bypass this rule.

Gateway webhook/event idempotency is separate and uses the provider event identifier once a gateway is integrated.

## Cancellation and refund policy boundary

This milestone does not automatically refund every cancelled booking. It defines the contract only:

- a cancelled booking cannot create a new payment intent;
- cancellation before capture may eventually terminate an uncaptured payment without refund;
- cancellation after capture requires an explicit server-side refund decision/workflow;
- a booking refund must never be inferred solely from client state;
- fulfilment and payment state remain separate state machines connected by server policy.

Exact commercial refund windows/penalties remain deferred until product policy is approved.

## Settlement boundary

Provider payout/settlement is not implemented in this milestone.

The schema reserves a provider-attributable amount field so a later settlement ledger can snapshot approved commercial economics without recomputing or mutating captured payment history.

Future settlement must be append-only/auditable.

## Audit events

Every payment mutation records an append-only event with:

- payment id;
- actor user id when applicable;
- event/action;
- from status;
- to status;
- provider event id/reference when applicable;
- occurredAt.

Consumer-facing reads only return payments belonging to the authenticated consumer's bookings. Platform reconciliation/audit access must use separately authorized platform permissions and must not inherit society tenant scope.

## Initial APIs

Gateway-neutral readiness APIs:

- `GET /api/v1/consumer/services/payments`
- `GET /api/v1/consumer/services/bookings/:bookingId/payments`
- `POST /api/v1/consumer/services/bookings/:bookingId/payments`

The creation endpoint establishes an internal payment intent only; it does not pretend a real gateway order/payment exists.

A later gateway milestone may add provider-session/order creation and signed webhook reconciliation behind the same aggregate.

## Security invariants

- authenticated user identity is derived from Bearer auth;
- booking ownership is checked server-side;
- amount/currency are derived server-side from the booking/payment policy;
- fee/provider split cannot be client-supplied and remains unset until approved server policy exists;
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
- concurrent active-intent duplication is blocked at the database boundary;
- cancelled booking cannot create a payment intent;
- only valid future payment transitions succeed;
- terminal states are protected;
- payment history is consumer-owner scoped;
- independent payment paths contain no society/unit/invoice identifiers;
- society billing regressions remain green.

## Deferred

- fee/commission percentage and commercial split policy;
- gateway choice and SDK;
- production credentials/webhooks;
- UPI/cards/netbanking UI;
- automated refund rules;
- provider payout/settlement execution;
- GST/TDS/compliance ledger details;
- promotions/coupons;
- dynamic pricing;
- infrastructure/hosting decisions.
