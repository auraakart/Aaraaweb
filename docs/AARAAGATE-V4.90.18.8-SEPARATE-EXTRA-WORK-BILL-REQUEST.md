# V4.90.18.8 — Separate extra-work billing request (non-payment)

**Baseline:** develop `274e8915fc4dcc5aef6196d0bfdb8f792646e050`.

## Root cause / safety requirement
The normal `ConsumerServicePayment` model enforces **one active payment per booking** and uses the original immutable booking price. The approved quotation records scope and consent, but **does not authorize a second charge**. Reusing base booking payment intents to collect extra money would mingle distinct economic obligations and violate the approved 3.1 consent boundary.

## Implemented
- Consumer chooses **Request separate bill** only on an APPROVED extra-work quote. Explicit confirmation reiterates that requesting a bill is not authorizing a payment.
- NestJS creates one immutable `ConsumerServiceExtraWorkBillingRequest` per quote with **exact approved amount and linked booking/quote/user/provider evidence**; quote approval actor must be the requesting booking owner. Booking and quote rows are locked before insert. Cancellation blocks new requests, while exact existing retries recover their receipt even after booking completion.
- Unapproved/withdrawn/foreign quotes fail closed. Provider can review requests only for provider-owned bookings. Consumer can read requests only for owned bookings.
- A dated booking event records the explicit billing request; no payment intent, invoice, gateway webhook, booking price update, refund, commission, or provider settlement is created.
- Add resident UI, provider read-only status, consumer privacy access export, a forward-only DB migration with unique quote and immutable trigger, and focussed API tests.

## Exclusions / acceptance still required
This slice is **billing-request initiation**, NOT issuance of a legal/tax invoice or a payable amount. Actual independent extra-work invoices, separately authorized payment orders, tax treatment, reconciliation, refunds, split settlement and provider release require their **own** migration and finance/security acceptance. Never map these requests into existing base-booking `ConsumerServicePayment` records or imply a charge succeeded. Live provider UAT, productionization and external gateway integrations remain excluded.

## Validation and branch discipline
Focused tests cover ownership, wrong consent actor, rejected states, cancelled bookings, duplicate replays, lock ordering, no charge or repricing. Required exact PR-head API/Admin/Flutter gates must pass before a develop-only merge; staging and main untouched.

## Delay-prevention procedure
Read latest develop head once, isolate exactly one slice, use one feature branch and PR, run required gates, merge only verified head, and move to the next acceptance gap without re-reading settled scope.
